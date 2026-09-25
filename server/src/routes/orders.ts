import type { FastifyInstance } from 'fastify';
import { MovementType, OrderStatus, Prisma, SalesChannel } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { decrementStock, incrementStock } from '../inventory.js';
import { soldWhere } from '../sales.js';

/**
 * Pedidos del panel.
 *
 * El estado de un pedido y el stock son la misma historia contada dos veces,
 * así que ningún cambio de estado toca `Product.stock` por su cuenta: se pasa
 * siempre por `src/inventory.ts` dentro de la transacción que guarda el nuevo
 * estado. Si la resta falla, el pedido tampoco avanza.
 */

/** Error con código HTTP para el manejador central de `index.ts`. */
function httpError(status: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = status;
  return error;
}

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  throw httpError(400, `${field}${issue?.message ?? 'Datos inválidos.'}`);
}

const isoDate = z
  .string()
  .min(1)
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), 'Fecha inválida, usa formato ISO-8601.');

const intFromQuery = z.coerce.number().int();

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

/** Qué le pasa al stock al pasar de un estado a otro. */
type StockEffect = 'none' | 'consume' | 'restore';

/**
 * Tabla de transiciones del contrato, literal.
 *
 * Es una lista blanca y no una lista negra a propósito: un estado nuevo en el
 * enum entra aquí sin efecto sobre el stock hasta que alguien decida cuál
 * debe tener, en vez de colarse permitido por descarte.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, Readonly<Partial<Record<OrderStatus, StockEffect>>>>> =
  {
    PENDING: { PAID: 'consume', CANCELLED: 'none' },
    // El salto directo a DELIVERED existe porque una tienda de barrio entrega
    // en mano el mismo dia: obligarla a pulsar alistar y despachar solo para
    // cerrar la venta le haria registrar dos estados que nunca ocurrieron.
    // Hacia atras no hay salto: eso si borraria lo que de verdad paso.
    PAID: { PREPARING: 'none', DELIVERED: 'none', CANCELLED: 'restore' },
    PREPARING: { SHIPPED: 'none', DELIVERED: 'none', CANCELLED: 'restore' },
    SHIPPED: { DELIVERED: 'none', REFUNDED: 'restore' },
    DELIVERED: { REFUNDED: 'restore' },
    // Un pedido anulado o devuelto está cerrado. Si la clienta vuelve, se
    // crea un pedido nuevo: reabrir este borraría lo que de verdad pasó.
    CANCELLED: {},
    REFUNDED: {},
  };

const STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  PENDING: 'pendiente de pago',
  PAID: 'pagado',
  PREPARING: 'en alistamiento',
  SHIPPED: 'despachado',
  DELIVERED: 'entregado',
  CANCELLED: 'anulado',
  REFUNDED: 'devuelto',
};

const describe = (status: OrderStatus): string => `${status} (${STATUS_LABEL[status]})`;

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

const listInclude = { items: { select: { quantity: true } } } as const;

const detailInclude = {
  items: true,
  movements: {
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { sku: true, name: true } },
      user: { select: { name: true } },
    },
  },
} as const;

type OrderListRow = Prisma.OrderGetPayload<{ include: typeof listInclude }>;
type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

const serializeOrder = (o: OrderListRow | OrderDetailRow, itemCount: number) => ({
  id: o.id,
  number: o.number,
  status: o.status,
  channel: o.channel,
  customerName: o.customerName,
  customerEmail: o.customerEmail,
  customerCity: o.customerCity,
  subtotal: o.subtotal,
  discount: o.discount,
  shipping: o.shipping,
  total: o.total,
  cost: o.cost,
  itemCount,
  couponCode: o.couponCode,
  createdAt: o.createdAt,
});

/** Unidades, no líneas: es lo que hay que empacar y lo que descuenta stock. */
const countUnits = (items: ReadonlyArray<{ quantity: number }>): number =>
  items.reduce((sum, item) => sum + item.quantity, 0);

const serializeOrderDetail = (o: OrderDetailRow) => ({
  ...serializeOrder(o, countUnits(o.items)),
  customerPhone: o.customerPhone,
  paymentMethod: o.paymentMethod,
  notes: o.notes,
  items: o.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    variant: item.variant,
    unitPrice: item.unitPrice,
    unitCost: item.unitCost,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  })),
  movements: o.movements.map((m) => ({
    id: m.id,
    type: m.type,
    quantity: m.quantity,
    stockAfter: m.stockAfter,
    reason: m.reason,
    productId: m.productId,
    sku: m.product.sku,
    productName: m.product.name,
    userName: m.user?.name ?? null,
    createdAt: m.createdAt,
  })),
});

// ---------------------------------------------------------------------------
// Consecutivo
// ---------------------------------------------------------------------------

/** Primer consecutivo si la tienda todavía no tiene un solo pedido. */
const FIRST_ORDER_NUMBER = 10483;

/**
 * Siguiente número legible tipo `AU-10483`.
 *
 * Se deriva del máximo existente y no de un aleatorio: el único de `number`
 * rechazaría los choques, pero un consecutivo con huecos y saltos deja de
 * servir para lo que existe, que es contarle a la clienta cuál es su pedido.
 *
 * El máximo se calcula sobre el sufijo convertido a entero, no sobre el texto:
 * ordenado como cadena, `AU-9999` iría después de `AU-10000`.
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

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

const listQuery = z.object({
  status: z.union([z.literal('all'), z.nativeEnum(OrderStatus)]).default('all'),
  channel: z.union([z.literal('all'), z.nativeEnum(SalesChannel)]).default('all'),
  search: z.string().trim().min(1).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: intFromQuery.min(1).default(1),
  limit: intFromQuery.min(1).max(200).default(25),
});

const patchBody = z
  .object({
    status: z.nativeEnum(OrderStatus).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine(
    (body) => body.status !== undefined || body.notes !== undefined,
    'No mandaste nada que cambiar: manda `status`, `notes` o ambos.',
  );

const createBody = z.object({
  customerName: z.string().trim().min(2, 'Escribe a nombre de quién va la venta.').max(200),
  customerEmail: z.string().trim().email('Ese correo no parece válido.').optional(),
  customerPhone: z.string().trim().max(40).optional(),
  customerCity: z.string().trim().max(120).optional(),
  channel: z.nativeEnum(SalesChannel).default(SalesChannel.COUNTER),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1, 'La cantidad mínima es una unidad.'),
        unitPrice: z.number().int().min(0, 'El precio va en pesos enteros, nunca negativo.').optional(),
      }),
    )
    .min(1, 'Un pedido sin productos no es un pedido.')
    .max(200, 'Máximo 200 líneas por pedido.'),
  discount: z.number().int().min(0).default(0),
  shipping: z.number().int().min(0).default(0),
  couponCode: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (secured) => {
    secured.addHook('preHandler', requireAuth);

    secured.get('/api/admin/orders', async (request) => {
      const query = parse(listQuery, request.query);

      const where: Prisma.OrderWhereInput = {
        ...(query.status === 'all' ? {} : { status: query.status }),
        ...(query.channel === 'all' ? {} : { channel: query.channel }),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { number: { contains: query.search, mode: 'insensitive' } },
                { customerName: { contains: query.search, mode: 'insensitive' } },
                { customerEmail: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [items, total, revenue] = await Promise.all([
        prisma.order.findMany({
          where,
          include: listInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.order.count({ where }),
        // Sobre el filtro entero y no sobre la página: el panel enseña este
        // total junto al listado, y si cambiara al pasar de página nadie
        // sabría cuál de los dos números es el del mes.
        //
        // Va en `AND` con `soldWhere` en vez de fusionado: fusionarlo pisaría
        // un filtro por estado del usuario y un listado de anulados mostraría
        // como ingreso la plata que justamente no entró.
        prisma.order.aggregate({ where: { AND: [where, soldWhere] }, _sum: { total: true } }),
      ]);

      return {
        items: items.map((order) => serializeOrder(order, countUnits(order.items))),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        totals: { revenue: revenue._sum.total ?? 0, orders: total },
      };
    });

    secured.get('/api/admin/orders/:id', async (request, reply) => {
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);

      const order = await prisma.order.findUnique({ where: { id }, include: detailInclude });
      if (!order) {
        return reply.code(404).send({ error: 'No existe ese pedido.', code: 'NOT_FOUND' });
      }

      return serializeOrderDetail(order);
    });

    secured.patch('/api/admin/orders/:id', async (request, reply) => {
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const body = parse(patchBody, request.body);

      const order = await prisma.order.findUnique({
        where: { id },
        select: { id: true, number: true, status: true, items: true },
      });
      if (!order) {
        return reply.code(404).send({ error: 'No existe ese pedido.', code: 'NOT_FOUND' });
      }

      // Un PATCH que repite el estado actual no es una transición: se deja
      // pasar como cambio de notas para que guardar dos veces el mismo
      // formulario no reviente ni, peor, vuelva a descontar stock.
      const next = body.status && body.status !== order.status ? body.status : null;

      if (next) {
        const effect = TRANSITIONS[order.status][next];
        if (!effect) {
          const allowed = Object.keys(TRANSITIONS[order.status]);
          return reply.code(400).send({
            error:
              `Un pedido ${describe(order.status)} no puede pasar a ${describe(next)}. ` +
              (allowed.length > 0
                ? `Desde aquí solo se puede ir a: ${allowed.join(', ')}.`
                : 'Este pedido ya está cerrado; si hace falta, crea uno nuevo.'),
          });
        }

        await prisma.$transaction(async (tx) => {
          // El estado viaja en el `where`: si otra pestaña movió el pedido
          // entre la lectura y este UPDATE, aquí no cambia nada y se aborta,
          // en vez de descontar el stock dos veces por la misma venta.
          const claimed = await tx.order.updateMany({
            where: { id: order.id, status: order.status },
            data: {
              status: next,
              ...(body.notes === undefined ? {} : { notes: body.notes }),
            },
          });
          if (claimed.count === 0) {
            throw httpError(
              409,
              'El pedido cambió de estado mientras guardabas. Vuelve a cargarlo y reintenta.',
            );
          }

          for (const item of order.items) {
            if (effect === 'consume') {
              // Si no alcanza, `InsufficientStockError` sube hasta el
              // manejador de `index.ts` (409) y esta transacción se deshace:
              // el pedido se queda sin pagar, que es la verdad.
              await decrementStock(tx, {
                productId: item.productId,
                quantity: item.quantity,
                type: MovementType.SALE,
                orderId: order.id,
                userId: request.admin?.sub ?? null,
                reason: `Venta ${order.number}`,
              });
            } else if (effect === 'restore') {
              await incrementStock(tx, {
                productId: item.productId,
                quantity: item.quantity,
                type: MovementType.RETURN,
                orderId: order.id,
                userId: request.admin?.sub ?? null,
                reason: `Pedido ${order.number} ${STATUS_LABEL[next]}`,
              });
            }
          }
        });
      } else if (body.notes !== undefined) {
        await prisma.order.update({ where: { id: order.id }, data: { notes: body.notes } });
      }

      const updated = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: detailInclude,
      });
      return serializeOrderDetail(updated);
    });

    secured.post('/api/admin/orders', async (request, reply) => {
      const body = parse(createBody, request.body);

      const ids = body.items.map((item) => item.productId);
      const repeated = ids.find((productId, index) => ids.indexOf(productId) !== index);
      if (repeated) {
        return reply.code(400).send({
          error: `El producto ${repeated} viene en dos líneas. Súmalo en una sola con la cantidad total.`,
        });
      }

      const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, sku: true, name: true, price: true, cost: true },
      });
      if (products.length !== ids.length) {
        const known = new Set(products.map((p) => p.id));
        return reply.code(404).send({
          error: `No existen estos productos: ${ids.filter((i) => !known.has(i)).join(', ')}.`,
          code: 'NOT_FOUND',
        });
      }
      const byId = new Map(products.map((product) => [product.id, product]));

      // Precio, costo, SKU y nombre se congelan en la línea: si mañana sube el
      // proveedor o se renombra el producto, este pedido sigue diciendo lo que
      // la clienta compró y por cuánto, y el margen histórico no se mueve.
      const lines = body.items.map((item) => {
        const product = byId.get(item.productId);
        if (!product) throw httpError(404, `No existe el producto ${item.productId}.`);
        const unitPrice = item.unitPrice ?? product.price;
        return {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unitPrice,
          unitCost: product.cost,
          quantity: item.quantity,
          lineTotal: unitPrice * item.quantity,
        };
      });

      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const cost = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
      const total = subtotal - body.discount + body.shipping;
      if (total < 0) {
        return reply.code(400).send({
          error: `El descuento (${body.discount}) se come el pedido: el total quedaría en ${total}.`,
        });
      }

      const couponCode = body.couponCode ? body.couponCode.toUpperCase() : null;
      // Se enlaza la promoción si el cupón existe, para que la venta de
      // mostrador también cuente en el reporte de la campaña. El descuento no
      // se recalcula: lo decidió quien atendió y ya está en el cuadre de caja.
      const promotion = couponCode
        ? await prisma.promotion.findUnique({ where: { code: couponCode }, select: { id: true } })
        : null;

      const write = (): Promise<OrderDetailRow> =>
        prisma.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              number: await nextOrderNumber(tx),
              // Nace pagada: una venta de mostrador se cobra al entregarla.
              status: OrderStatus.PAID,
              channel: body.channel,
              customerName: body.customerName,
              customerEmail: body.customerEmail ?? '',
              customerPhone: body.customerPhone ?? '',
              customerCity: body.customerCity ?? '',
              subtotal,
              discount: body.discount,
              shipping: body.shipping,
              total,
              cost,
              couponCode,
              promotionId: promotion?.id ?? null,
              notes: body.notes ?? null,
              items: { create: lines },
            },
            select: { id: true, number: true },
          });

          for (const line of lines) {
            await decrementStock(tx, {
              productId: line.productId,
              quantity: line.quantity,
              type: MovementType.SALE,
              orderId: order.id,
              userId: request.admin?.sub ?? null,
              reason: `Venta ${order.number}`,
            });
          }

          // Se relee al final para devolver el pedido con sus movimientos ya
          // escritos, que es lo que el panel pinta en la ficha.
          return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: detailInclude });
        });

      // Dos ventas simultáneas pueden leer el mismo máximo y pedir el mismo
      // consecutivo; el índice único lo impide y aquí se reintenta con el
      // siguiente, en vez de devolverle un 409 incomprensible a quien vende.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return reply.code(201).send(serializeOrderDetail(await write()));
        } catch (error) {
          const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
          const numberClash =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            Array.isArray(target) &&
            target.includes('number');
          if (!numberClash) throw error;
        }
      }

      return reply.code(409).send({
        error: 'No se pudo asignar un número de pedido. Intenta de nuevo.',
        code: 'DUPLICATE',
      });
    });
  });
}
