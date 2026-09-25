import { createHash, randomBytes } from 'node:crypto';
import {
  OrderStatus,
  PaymentEventSource,
  PaymentProvider,
  Prisma,
  ReservationState,
  type PaymentStatus,
} from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { computeDiscount, type CartLine, type PromotionRule } from '../promotions.js';
import { consumeReservation, holdStock, orderLines, releaseStock } from '../reservations.js';
import { findSetting } from '../settings-defaults.js';
import { gateway } from './index.js';
import { canTransition, fromCents, statusMessage, toCents, type ProviderSnapshot } from './types.js';

/**
 * Orquestación de cobros.
 *
 * Aquí viven las tres cosas que no puede decidir ni el navegador ni la
 * pasarela: cuánto se cobra, qué unidades quedan apartadas y cuándo un pedido
 * pasa a pagado. Las rutas solo validan y traducen; el estado se mueve
 * exclusivamente desde este archivo, para que haya un único sitio donde mirar
 * cuando un cobro y un pedido no cuentan la misma historia.
 */

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

/** Error con código HTTP para el manejador central de `index.ts`. */
function httpError(status: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = status;
  return error;
}

/**
 * Señal interna para abortar la transacción cuando el aviso ya se procesó.
 *
 * Se lanza en vez de devolver un valor porque un choque de único deja la
 * transacción de Postgres abortada: cualquier consulta posterior fallaría.
 * Lanzando, Prisma hace ROLLBACK y no queda nada a medias.
 */
class DuplicateEventError extends Error {
  constructor(
    readonly paymentId: string,
    readonly status: PaymentStatus,
  ) {
    super('El aviso ya estaba registrado.');
    this.name = 'DuplicateEventError';
  }
}

// ---------------------------------------------------------------------------
// Ajustes y utilidades
// ---------------------------------------------------------------------------

const asNumber = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const settingNumber = (key: string): number => asNumber(findSetting(key)?.value, 0);

interface ShippingSettings {
  readonly fee: number;
  readonly freeFrom: number;
}

/**
 * Lee `shipping.fee` y `shipping.freeFrom` de la tabla `Setting`.
 *
 * Si la fila no está sembrada se cae al valor de `settings-defaults.ts`, que
 * es la misma fuente que usa el panel: así un despliegue sin seed cobra el
 * envío que la dueña ve en pantalla y no cero.
 */
async function shippingSettings(client: Prisma.TransactionClient): Promise<ShippingSettings> {
  const rows = await client.setting.findMany({
    where: { key: { in: ['shipping.fee', 'shipping.freeFrom'] } },
    select: { key: true, value: true },
  });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  return {
    fee: asNumber(stored.get('shipping.fee'), settingNumber('shipping.fee')),
    freeFrom: asNumber(stored.get('shipping.freeFrom'), settingNumber('shipping.freeFrom')),
  };
}

/** Primer consecutivo si la tienda todavía no tiene un solo pedido. */
const FIRST_ORDER_NUMBER = 10483;

/**
 * Siguiente número legible tipo `AU-10483`.
 *
 * Mismo criterio que la venta de mostrador (`src/routes/orders.ts`): el máximo
 * se calcula sobre el sufijo convertido a ENTERO, no sobre el texto. Ordenado
 * como cadena, `AU-9999` iría después de `AU-10000` y el consecutivo daría un
 * salto hacia atrás.
 */
async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(SUBSTRING(number FROM 4) AS INTEGER)) AS max
    FROM orders
    WHERE number ~ '^AU-[0-9]+$'
  `;
  const current = rows[0]?.max ?? null;
  return `AU-${current === null ? FIRST_ORDER_NUMBER : current + 1}`;
}

/**
 * Referencia del cobro: `<numeroPedido>-<4 hex>`.
 *
 * El sufijo no es decoración. Wompi trata la referencia como única, así que si
 * a la clienta le rechazan la tarjeta y reintenta, el segundo intento del
 * MISMO pedido necesita una referencia distinta o la pasarela lo rechaza sin
 * llegar al banco.
 */
const buildReference = (orderNumber: string): string =>
  `${orderNumber}-${randomBytes(2).toString('hex')}`;

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

// ---------------------------------------------------------------------------
// createIntent
// ---------------------------------------------------------------------------

export type ShippingMethod = 'std' | 'exp' | 'pick';

export interface IntentItemInput {
  readonly productId: string;
  readonly quantity: number;
  readonly variant?: string;
}

export interface CreateIntentInput {
  readonly items: readonly IntentItemInput[];
  readonly customer: {
    readonly name: string;
    readonly email: string;
    readonly phone: string;
    readonly legalIdType: string;
    readonly legalId: string;
  };
  readonly shipping: {
    readonly line1: string;
    readonly city: string;
    readonly region: string;
    readonly country: 'CO';
  };
  readonly couponCode?: string;
  readonly shippingMethod: ShippingMethod;
}

export interface CreateIntentResult {
  readonly reference: string;
  readonly orderNumber: string;
  readonly checkoutUrl: string;
  readonly provider: PaymentProvider;
  readonly amountInCents: number;
  readonly expiresAt: Date;
  readonly totals: {
    readonly subtotal: number;
    readonly discount: number;
    readonly shipping: number;
    readonly total: number;
  };
}

/**
 * Cuánto se cobra de envío.
 *
 * `pick` es recoger en tienda: no hay transportadora que pagar. El umbral de
 * envío gratis solo se aplica al envío estándar, porque el exprés es una
 * mejora que la clienta elige y paga aparte; regalarlo por monto convertiría
 * el umbral en un descuento encubierto sobre un servicio que sí nos cuesta.
 */
function shippingFor(
  method: ShippingMethod,
  payable: number,
  settings: ShippingSettings,
  freeByPromotion: boolean,
): number {
  if (method === 'pick') return 0;
  if (freeByPromotion) return 0;
  if (method === 'std' && (settings.freeFrom <= 0 || payable >= settings.freeFrom)) return 0;
  return Math.max(0, Math.trunc(settings.fee));
}

/**
 * Abre un intento de cobro: crea el pedido, aparta las unidades y devuelve a
 * dónde mandar a la clienta.
 *
 * Todo ocurre en una sola transacción. Si el stock no alcanza, `holdStock`
 * lanza `InsufficientStockError` (409 en el manejador de `index.ts`) y no
 * queda ni pedido, ni cobro, ni unidades apartadas: mejor no vender que
 * vender lo que no hay.
 */
export async function createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
  const ids = input.items.map((item) => item.productId);
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
  if (repeated) {
    throw httpError(
      400,
      `El producto ${repeated} viene en dos líneas. Súmalo en una sola con la cantidad total.`,
    );
  }

  const write = (): Promise<CreateIntentResult> =>
    prisma.$transaction(
      async (tx) => {
        const products = await tx.product.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            cost: true,
            active: true,
            categoryId: true,
            brandId: true,
          },
        });
        const byId = new Map(products.map((p) => [p.id, p]));

        const missing = ids.filter((id) => !byId.has(id));
        if (missing.length > 0) {
          throw httpError(400, `Estos productos ya no están en el catálogo: ${missing.join(', ')}.`);
        }
        const inactive = products.filter((p) => !p.active);
        if (inactive.length > 0) {
          throw httpError(
            400,
            `Ya no vendemos ${inactive.map((p) => p.name).join(', ')}. Quítalo del carrito para continuar.`,
          );
        }

        // Precio y costo se congelan en la línea, y el precio sale de la BASE,
        // nunca del cuerpo de la petición: quien controla el navegador
        // controla lo que manda, y un total enviado desde el cliente es un
        // total que se puede editar antes de mandarlo.
        const lines = input.items.map((item) => {
          const product = byId.get(item.productId);
          if (!product) throw httpError(400, `No existe el producto ${item.productId}.`);
          return {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            variant: item.variant ?? null,
            unitPrice: product.price,
            unitCost: product.cost,
            quantity: item.quantity,
            lineTotal: product.price * item.quantity,
            categoryId: product.categoryId,
            brandId: product.brandId,
          };
        });

        const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const cost = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);

        // --- Descuento -------------------------------------------------------
        let discount = 0;
        let freeShipping = false;
        let promotionId: string | null = null;
        const couponCode = input.couponCode ? input.couponCode.toUpperCase() : null;

        if (couponCode) {
          const promotion = await tx.promotion.findUnique({ where: { code: couponCode } });
          if (!promotion) {
            throw httpError(400, `El cupón ${couponCode} no existe.`);
          }
          const rule: PromotionRule = {
            type: promotion.type,
            scope: promotion.scope,
            targetIds: promotion.targetIds,
            value: promotion.value,
            maxDiscount: promotion.maxDiscount,
            minPurchase: promotion.minPurchase,
            startsAt: promotion.startsAt,
            endsAt: promotion.endsAt,
            active: promotion.active,
            usageLimit: promotion.usageLimit,
            usageCount: promotion.usageCount,
          };
          const cartLines: CartLine[] = lines.map((line) => ({
            productId: line.productId,
            categoryId: line.categoryId,
            brandId: line.brandId,
            price: line.unitPrice,
            quantity: line.quantity,
          }));
          const result = computeDiscount(rule, { subtotal, items: cartLines });
          // Un cupón que no aplica se dice en voz alta. Aceptarlo en silencio
          // le cobraría a la clienta más de lo que vio en el carrito, y eso se
          // descubre en el extracto, no en la tienda.
          if (!result.applies) {
            throw httpError(400, result.reason ?? 'Ese cupón no aplica a tu carrito.');
          }
          discount = result.discount;
          freeShipping = result.freeShipping;
          promotionId = promotion.id;
        }

        // --- Envío y total ---------------------------------------------------
        const settings = await shippingSettings(tx);
        const payable = Math.max(0, subtotal - discount);
        const shipping = shippingFor(input.shippingMethod, payable, settings, freeShipping);
        const total = payable + shipping;
        if (total <= 0) {
          throw httpError(400, 'El total del pedido quedó en cero; no hay nada que cobrar.');
        }

        // --- Reserva ---------------------------------------------------------
        // Antes de crear nada: si no alcanza, la excepción deshace la
        // transacción entera y no queda un pedido fantasma en PENDING.
        await holdStock(
          tx,
          lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        );

        const number = await nextOrderNumber(tx);
        const order = await tx.order.create({
          data: {
            number,
            status: OrderStatus.PENDING,
            customerName: input.customer.name,
            customerEmail: input.customer.email,
            customerPhone: input.customer.phone,
            customerCity: input.shipping.city,
            subtotal,
            discount,
            shipping,
            total,
            cost,
            couponCode,
            promotionId,
            items: {
              create: lines.map((line) => ({
                productId: line.productId,
                sku: line.sku,
                name: line.name,
                variant: line.variant,
                unitPrice: line.unitPrice,
                unitCost: line.unitCost,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
              })),
            },
          },
          select: { id: true, number: true },
        });

        const reference = buildReference(order.number);
        const amountInCents = toCents(total);
        const expiresAt = new Date(Date.now() + env.reservationMinutes * 60_000);
        const redirectUrl = `${env.appUrl}/pago/respuesta`;

        // Los dos adaptadores arman la URL del checkout sin salir a la red
        // (Wompi abre su Checkout Web por GET), así que esto no deja la
        // transacción esperando a un tercero. Si algún día un adaptador
        // necesitara llamar a la pasarela, esta llamada tiene que salir de
        // aquí: una transacción abierta contra una red lenta bloquea filas.
        const session = await gateway.openCheckout({
          reference,
          amountInCents,
          currency: 'COP',
          customerEmail: input.customer.email,
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          legalIdType: input.customer.legalIdType,
          legalId: input.customer.legalId,
          shipping: {
            line1: input.shipping.line1,
            city: input.shipping.city,
            region: input.shipping.region,
            country: 'CO',
            phone: input.customer.phone,
          },
          redirectUrl,
          expiresAt,
        });

        await tx.payment.create({
          data: {
            orderId: order.id,
            reference,
            provider: gateway.id === 'WOMPI' ? PaymentProvider.WOMPI : PaymentProvider.MOCK,
            amountInCents,
            currency: 'COP',
            checkoutUrl: session.checkoutUrl,
            redirectUrl,
            expiresAt,
            reservationState: ReservationState.HELD,
            ...(session.providerTransactionId
              ? { providerTransactionId: session.providerTransactionId }
              : {}),
          },
        });

        return {
          reference,
          orderNumber: order.number,
          checkoutUrl: session.checkoutUrl,
          provider: gateway.id === 'WOMPI' ? PaymentProvider.WOMPI : PaymentProvider.MOCK,
          amountInCents,
          expiresAt,
          totals: { subtotal, discount, shipping, total },
        };
      },
      // Holgado a propósito: la transacción abre el checkout además de
      // escribir, y un timeout aquí dejaría a la clienta sin pedido.
      { timeout: 15_000, maxWait: 10_000 },
    );

  // Dos compras simultáneas pueden leer el mismo máximo y pedir el mismo
  // consecutivo; el índice único lo impide y aquí se reintenta, en vez de
  // devolverle un 409 incomprensible a quien está pagando.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      const clash =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        (error.meta.target as string[]).some((t) => t === 'number' || t === 'reference');
      if (!clash) throw error;
    }
  }
  throw httpError(409, 'No se pudo asignar un número de pedido. Intenta de nuevo.');
}

// ---------------------------------------------------------------------------
// applySnapshot
// ---------------------------------------------------------------------------

export type ApplyOutcome =
  /** La referencia del aviso no es de esta tienda. */
  | { readonly kind: 'not-found'; readonly reference: string }
  /** El mismo aviso ya se había procesado: no se movió nada. */
  | { readonly kind: 'duplicate'; readonly paymentId: string; readonly status: PaymentStatus }
  /** Se registró pero no se aplicó (llegó tarde, o el monto no cuadra). */
  | {
      readonly kind: 'ignored';
      readonly paymentId: string;
      readonly status: PaymentStatus;
      readonly note: string;
    }
  /** El cobro cambió de estado. */
  | { readonly kind: 'applied'; readonly paymentId: string; readonly status: PaymentStatus };

export interface ApplyOptions {
  /** False cuando la firma no cuadró. Se guarda igual, para poder mirarlo. */
  readonly checksumOk?: boolean;
  readonly note?: string;
  readonly payload?: unknown;
}

const asJson = (value: unknown): Prisma.InputJsonValue =>
  (value ?? Prisma.JsonNull) as Prisma.InputJsonValue;

/** Estados que sueltan la reserva y anulan el pedido. */
const RELEASES: readonly PaymentStatus[] = ['DECLINED', 'VOIDED', 'ERROR', 'EXPIRED'];

/**
 * Aplica un desenlace a un cobro. Es la función más delicada del proyecto.
 *
 * Tres invariantes que sostienen todo lo demás:
 *
 *  1. **Idempotencia.** El `PaymentEvent` se inserta ANTES de tocar nada. Si
 *     choca el único `[paymentId, fingerprint]`, el aviso ya se procesó y se
 *     sale sin mover un dedo. Wompi reintenta los webhooks hasta recibir un
 *     200, así que el mismo aviso llega varias veces por diseño.
 *
 *  2. **Tolerancia al desorden.** `canTransition` decide si el estado nuevo
 *     puede sustituir al que hay. Es normal recibir el PENDING DESPUÉS del
 *     APPROVED; sin esta guarda ese retraso devolvería a pendiente un pedido
 *     ya cobrado y le soltaría el stock a una venta real.
 *
 *  3. **El monto manda.** Si la pasarela dice un importe distinto al que
 *     firmamos, no se aprueba. Un aprobado por menos de lo debido es dinero
 *     que no vuelve.
 */
export async function applySnapshot(
  snapshot: ProviderSnapshot,
  source: PaymentEventSource,
  fingerprint: string,
  opts: ApplyOptions = {},
): Promise<ApplyOutcome> {
  try {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { reference: snapshot.reference },
        select: {
          id: true,
          orderId: true,
          status: true,
          amountInCents: true,
          reservationState: true,
          providerTransactionId: true,
          order: { select: { number: true, status: true } },
        },
      });
      if (!payment) return { kind: 'not-found', reference: snapshot.reference } as const;

      // --- 1. La puerta de la idempotencia --------------------------------
      let eventId: string;
      try {
        const event = await tx.paymentEvent.create({
          data: {
            paymentId: payment.id,
            source,
            status: snapshot.status,
            fingerprint,
            checksumOk: opts.checksumOk ?? true,
            applied: false,
            note: opts.note ?? null,
            payload: asJson(opts.payload ?? snapshot.raw),
          },
          select: { id: true },
        });
        eventId = event.id;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new DuplicateEventError(payment.id, payment.status);
        }
        throw error;
      }

      const close = async (applied: boolean, note: string | null): Promise<void> => {
        await tx.paymentEvent.update({ where: { id: eventId }, data: { applied, note } });
      };

      // Metadatos que se refrescan siempre, aplique o no: saber cuándo se
      // preguntó por última vez y qué contestó la pasarela es justo lo que se
      // mira cuando una clienta dice que pagó y el pedido sale sin pagar.
      const meta: Prisma.PaymentUpdateInput = {
        lastSyncedAt: new Date(),
        providerStatus: snapshot.providerStatus,
        raw: asJson(snapshot.raw),
        ...(snapshot.statusMessage ? { statusMessage: snapshot.statusMessage } : {}),
        // Solo si falta: es único, y machacarlo con el id de otra transacción
        // rompería la reconciliación del intento que sí lo tenía.
        ...(payment.providerTransactionId === null && snapshot.providerTransactionId
          ? { providerTransactionId: snapshot.providerTransactionId }
          : {}),
      };

      // --- 2. Desorden ------------------------------------------------------
      if (!canTransition(payment.status, snapshot.status)) {
        const note =
          payment.status === snapshot.status
            ? `Aviso repetido: el cobro ya estaba en ${payment.status}.`
            : `Aviso fuera de orden: llegó ${snapshot.status} con el cobro ya en ${payment.status}. No se aplica.`;
        await tx.payment.update({ where: { id: payment.id }, data: meta });
        await close(false, note);
        return { kind: 'ignored', paymentId: payment.id, status: payment.status, note } as const;
      }

      // --- 3. El monto ------------------------------------------------------
      // Solo bloquea la aprobación: un rechazo con un monto raro igual tiene
      // que soltar las unidades, o se quedarían apartadas hasta que expiren.
      if (snapshot.status === 'APPROVED' && snapshot.amountInCents !== payment.amountInCents) {
        const note =
          `Monto distinto al cobrado: la pasarela dice ${snapshot.amountInCents} centavos y ` +
          `el cobro es de ${payment.amountInCents}. No se aprueba.`;
        await tx.payment.update({ where: { id: payment.id }, data: meta });
        await close(false, note);
        return { kind: 'ignored', paymentId: payment.id, status: payment.status, note } as const;
      }

      // --- 4. Aplicar -------------------------------------------------------
      const lines = await orderLines(tx, payment.orderId);
      let note = `Cobro ${payment.status} → ${snapshot.status}.`;

      if (snapshot.status === 'APPROVED') {
        if (payment.reservationState === ReservationState.HELD) {
          // Suelta la reserva y descuenta stock con movimiento SALE, las dos
          // cosas en esta misma transacción.
          await consumeReservation(tx, lines, {
            orderId: payment.orderId,
            reason: `Venta ${payment.order.number}`,
          });
        } else {
          note += ` La reserva ya estaba en ${payment.reservationState}; no se descontó dos veces.`;
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            ...meta,
            status: snapshot.status,
            methodType: snapshot.methodType,
            approvedAt: new Date(),
            ...(payment.reservationState === ReservationState.HELD
              ? { reservationState: ReservationState.CONSUMED }
              : {}),
          },
        });

        // Con el estado en el `where`: si el pedido ya no estaba pendiente
        // (lo anuló alguien desde el panel), no se resucita a pagado a sus
        // espaldas; queda el cobro aprobado y el evento para investigarlo.
        const moved = await tx.order.updateMany({
          where: { id: payment.orderId, status: OrderStatus.PENDING },
          data: { status: OrderStatus.PAID, paymentMethod: snapshot.methodType },
        });
        if (moved.count === 0) {
          note += ` El pedido estaba en ${payment.order.status} y no se movió a PAID.`;
        }
      } else if (RELEASES.includes(snapshot.status)) {
        if (payment.reservationState === ReservationState.HELD) {
          // Solo desde HELD. Soltar dos veces inflaría `reserved` a la baja y
          // acabaríamos vendiendo unidades que ya se vendieron.
          await releaseStock(tx, lines);
        } else {
          note += ` La reserva estaba en ${payment.reservationState}; no se soltó nada.`;
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            ...meta,
            status: snapshot.status,
            ...(snapshot.methodType !== 'UNKNOWN' ? { methodType: snapshot.methodType } : {}),
            ...(payment.reservationState === ReservationState.HELD
              ? { reservationState: ReservationState.RELEASED }
              : {}),
          },
        });

        // Un pedido ya pagado que se anula (APPROVED → VOIDED) NO se toca
        // aquí: el stock ya salió de bodega y devolverlo exige el movimiento
        // RETURN que hace el panel en PAID → CANCELLED. Anularlo a secas
        // dejaría el inventario contando una venta que se deshizo.
        const moved = await tx.order.updateMany({
          where: { id: payment.orderId, status: OrderStatus.PENDING },
          data: { status: OrderStatus.CANCELLED },
        });
        if (moved.count === 0) {
          note += ` El pedido estaba en ${payment.order.status}; hay que anularlo desde el panel.`;
        }
      } else {
        // PENDING sobre PENDING ya lo filtró `canTransition`; llegar aquí
        // sería un estado nuevo del enum sin tratamiento decidido.
        await tx.payment.update({ where: { id: payment.id }, data: { ...meta, status: snapshot.status } });
      }

      await close(true, note);
      return { kind: 'applied', paymentId: payment.id, status: snapshot.status } as const;
    });
  } catch (error) {
    if (error instanceof DuplicateEventError) {
      return { kind: 'duplicate', paymentId: error.paymentId, status: error.status };
    }
    throw error;
  }
}

/**
 * Deja constancia de un aviso que NO pasó la verificación de firma.
 *
 * Va fuera de `applySnapshot` porque un aviso falsificado no tiene estado que
 * aplicar, pero sí es exactamente lo que hay que poder mirar después: alguien
 * intentando marcar como pagado un pedido que nadie pagó.
 */
export async function recordRejectedEvent(args: {
  readonly reference: string | null;
  readonly fingerprint: string;
  readonly reason: string;
  readonly payload: unknown;
  readonly claimedStatus?: PaymentStatus;
}): Promise<boolean> {
  if (!args.reference) return false;
  const payment = await prisma.payment.findUnique({
    where: { reference: args.reference },
    select: { id: true },
  });
  if (!payment) return false;

  try {
    await prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        source: PaymentEventSource.WEBHOOK,
        status: args.claimedStatus ?? 'PENDING',
        fingerprint: args.fingerprint,
        checksumOk: false,
        applied: false,
        note: args.reason,
        payload: asJson(args.payload),
      },
    });
    return true;
  } catch (error) {
    // Un aviso falso reenviado tres veces no necesita tres filas iguales.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// syncPayment
// ---------------------------------------------------------------------------

export interface SyncResult {
  readonly status: PaymentStatus;
  readonly outcome: ApplyOutcome | null;
}

/**
 * Le pregunta a la pasarela y aplica lo que diga.
 *
 * Es la red de seguridad para cuando el webhook se pierde —que pasa— y la vía
 * que usa la pantalla de retorno con el `transactionId` que Wompi añade a la
 * URL. Sin esto, alguien que ya pagó vería "pendiente" hasta que la pasarela
 * reintentara.
 */
export async function syncPayment(key: string, transactionId?: string): Promise<SyncResult> {
  const payment = await prisma.payment.findFirst({
    where: { OR: [{ reference: key }, { id: key }] },
    select: { id: true, reference: true, status: true, providerTransactionId: true },
  });
  if (!payment) throw httpError(404, 'No existe ese cobro.');

  const txId = transactionId ?? payment.providerTransactionId;
  const snapshot = txId
    ? await gateway.fetchByTransactionId(txId)
    : await gateway.fetchByReference(payment.reference);

  // La pasarela no sabe nada de esta transacción: no se inventa un desenlace.
  // Ante la duda un cobro se deja abierto, nunca se da por fallido.
  if (!snapshot) return { status: payment.status, outcome: null };

  // El `transactionId` llega por la query de una ruta pública. Si apunta a
  // otra transacción, no se aplica: es la forma barata de intentar que el
  // aprobado de un pedido ajeno pague el propio.
  if (snapshot.reference !== payment.reference) {
    return { status: payment.status, outcome: null };
  }

  // Huella determinista: preguntar diez veces por lo mismo registra un solo
  // evento y aplica un solo cambio.
  const fingerprint = sha256(
    `poll|${snapshot.providerTransactionId}|${snapshot.status}|${snapshot.amountInCents}`,
  ).slice(0, 32);

  const outcome = await applySnapshot(snapshot, PaymentEventSource.POLL, fingerprint, {
    note: 'Consulta a la pasarela.',
  });

  return {
    status: outcome.kind === 'applied' ? snapshot.status : payment.status,
    outcome,
  };
}

// ---------------------------------------------------------------------------
// expireStale
// ---------------------------------------------------------------------------

export interface ExpireReport {
  readonly checked: number;
  readonly expired: number;
  readonly rescued: number;
}

/**
 * Caduca los cobros pendientes cuya reserva ya venció y devuelve las unidades.
 *
 * La pasarela no avisa cuando alguien abandona el checkout, así que sin esto
 * las unidades apartadas quedarían bloqueadas para siempre.
 *
 * **Antes de expirar se pregunta.** Alguien pudo pagar justo en el límite, y
 * expirar un cobro aprobado sería cobrarle a la clienta y anularle el pedido
 * en el mismo movimiento: el peor error posible en una tienda.
 */
export async function expireStale(limit = 50): Promise<ExpireReport> {
  const now = new Date();
  const stale = await prisma.payment.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    select: { id: true, reference: true, providerTransactionId: true, amountInCents: true },
    orderBy: { expiresAt: 'asc' },
    take: limit,
  });

  let expired = 0;
  let rescued = 0;

  for (const payment of stale) {
    if (payment.providerTransactionId) {
      const synced = await syncPayment(payment.reference);
      if (synced.status !== 'PENDING') {
        rescued += 1;
        continue;
      }
    }

    const snapshot: ProviderSnapshot = {
      status: 'EXPIRED',
      providerTransactionId: payment.providerTransactionId ?? '',
      reference: payment.reference,
      // El mismo importe del cobro: la comprobación de monto no debe
      // confundir una caducidad nuestra con un aprobado por menos.
      amountInCents: payment.amountInCents,
      methodType: 'UNKNOWN',
      providerStatus: 'EXPIRED',
      statusMessage: 'El tiempo para pagar se agotó.',
      raw: { expiredAt: now.toISOString(), by: 'aurelle' },
    };

    const outcome = await applySnapshot(
      snapshot,
      PaymentEventSource.POLL,
      sha256(`expire|${payment.id}`).slice(0, 32),
      { note: 'Reserva vencida: se liberan las unidades.' },
    );
    if (outcome.kind === 'applied') expired += 1;
  }

  return { checked: stale.length, expired, rescued };
}

// ---------------------------------------------------------------------------
// Forma pública
// ---------------------------------------------------------------------------

/**
 * Lo que la ruta pública necesita leer. Se exporta para que la consulta pida
 * exactamente esto y ni una columna más.
 */
export const publicPaymentSelect = {
  reference: true,
  status: true,
  amountInCents: true,
  methodType: true,
  expiresAt: true,
  updatedAt: true,
  order: { select: { number: true, status: true } },
} as const;

export interface PublicPaymentSource {
  readonly reference: string;
  readonly status: PaymentStatus;
  readonly amountInCents: number;
  readonly methodType: string | null;
  readonly expiresAt: Date;
  readonly updatedAt: Date;
  readonly order: { readonly number: string; readonly status: OrderStatus };
}

export interface PublicPayment {
  readonly reference: string;
  readonly status: PaymentStatus;
  readonly message: string;
  readonly orderNumber: string;
  readonly orderStatus: OrderStatus;
  readonly amount: number;
  readonly methodType: string | null;
  readonly expiresAt: Date;
  readonly updatedAt: Date;
}

/**
 * La forma pública del cobro.
 *
 * Sin nombre, correo, teléfono ni dirección, y a propósito: la referencia
 * viaja en una URL, y las URLs se comparten por WhatsApp, quedan en el
 * historial del navegador y acaban en los registros de cualquier proxy por el
 * que pasen. Lo que hay aquí es lo justo para pintar la pantalla de retorno.
 */
export function paymentSnapshotForPublic(payment: PublicPaymentSource): PublicPayment {
  return {
    reference: payment.reference,
    status: payment.status,
    // Nunca el texto crudo de la pasarela: "INVALID_CVC" no le dice nada a
    // quien está intentando pagar.
    message: statusMessage(payment.status),
    orderNumber: payment.order.number,
    orderStatus: payment.order.status,
    // En pesos enteros, como todo el resto del sistema. Los centavos solo
    // existen de cara a la pasarela.
    amount: fromCents(payment.amountInCents),
    methodType: payment.methodType,
    expiresAt: payment.expiresAt,
    updatedAt: payment.updatedAt,
  };
}
