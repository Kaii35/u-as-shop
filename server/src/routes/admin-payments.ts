import type { FastifyInstance } from 'fastify';
import { OrderStatus, PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { gateway, fromCents, isFinal, statusMessage } from '../payments/index.js';
import { syncPayment } from '../payments/service.js';

/**
 * Cobros vistos desde el panel.
 *
 * Aquí no se mueve ni un peso ni una unidad: esta ruta lee y, como mucho,
 * delega en el servicio de pagos. Toda la mecánica de aplicar un estado
 * —soltar la reserva, descontar bodega, avanzar el pedido— vive en
 * `src/payments/service.ts`, porque repetirla aquí abriría un segundo camino
 * capaz de descuadrar el stock, y dos caminos nunca se descuadran igual.
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
// Serialización
// ---------------------------------------------------------------------------

const orderSelect = {
  select: { id: true, number: true, status: true, customerName: true, customerEmail: true },
} as const;

const listInclude = { order: orderSelect } as const;

const detailInclude = {
  order: orderSelect,
  // Más reciente primero: quien abre la bitácora viene a ver qué pasó al
  // final, no cómo empezó.
  events: { orderBy: { createdAt: 'desc' } },
} as const;

type PaymentListRow = Prisma.PaymentGetPayload<{ include: typeof listInclude }>;
type PaymentDetailRow = Prisma.PaymentGetPayload<{ include: typeof detailInclude }>;

/**
 * El monto sale en pesos enteros, no en centavos.
 *
 * En la base se guarda en centavos porque es lo que cobra la pasarela, pero
 * todo lo demás del sistema —pedidos, reportes, el panel— habla en pesos.
 * Dejar salir centavos de aquí obligaría a cada consumidor a acordarse de
 * dividir, y al primero que se le olvide le enseña un cobro cien veces mayor.
 */
const serializePayment = (p: PaymentListRow | PaymentDetailRow) => ({
  id: p.id,
  reference: p.reference,
  provider: p.provider,
  status: p.status,
  amount: fromCents(p.amountInCents),
  currency: p.currency,
  methodType: p.methodType,
  providerTransactionId: p.providerTransactionId,
  providerStatus: p.providerStatus,
  statusMessage: p.statusMessage,
  /** Lo mismo dicho en tienda. El texto crudo del proveedor va aparte. */
  message: statusMessage(p.status),
  /** Si el cobro ya no va a cambiar solo. El panel lo usa para no prometer nada. */
  final: isFinal(p.status),
  reservationState: p.reservationState,
  order: {
    id: p.order.id,
    number: p.order.number,
    status: p.order.status,
    customerName: p.order.customerName,
  },
  expiresAt: p.expiresAt,
  approvedAt: p.approvedAt,
  lastSyncedAt: p.lastSyncedAt,
  createdAt: p.createdAt,
});

/**
 * La bitácora, sin la huella.
 *
 * `fingerprint` es un detalle de la idempotencia: no le dice nada a quien
 * atiende la tienda y llenaría de ruido la única pantalla que se mira cuando
 * una clienta jura que pagó. `checksumOk` y `applied`, en cambio, son justo
 * las dos preguntas que hay que responder ahí.
 */
const serializeEvent = (e: PaymentDetailRow['events'][number]) => ({
  id: e.id,
  source: e.source,
  status: e.status,
  checksumOk: e.checksumOk,
  applied: e.applied,
  note: e.note,
  createdAt: e.createdAt,
});

const serializePaymentDetail = (p: PaymentDetailRow) => ({
  ...serializePayment(p),
  checkoutUrl: p.checkoutUrl,
  customerEmail: p.order.customerEmail,
  events: p.events.map(serializeEvent),
});

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

const listQuery = z.object({
  status: z.union([z.literal('all'), z.nativeEnum(PaymentStatus)]).default('all'),
  provider: z.union([z.literal('all'), z.nativeEnum(PaymentProvider)]).default('all'),
  search: z.string().trim().min(1).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: intFromQuery.min(1).default(1),
  limit: intFromQuery.min(1).max(200).default(25),
});

const idParam = z.object({ id: z.string().min(1) });

/** Un cobro que lleva más de esto en pendiente ya no se está "procesando". */
const STALE_PENDING_MINUTES = 15;

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

export async function adminPaymentRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (secured) => {
    secured.addHook('preHandler', requireAuth);

    /**
     * `/health` va declarada antes que `/:id` por claridad, no por necesidad:
     * el enrutador de Fastify ya prefiere el segmento literal sobre el
     * parámetro. Leerlas en este orden evita que alguien "arregle" mañana un
     * choque que no existe.
     */
    secured.get('/api/admin/payments/health', async () => {
      const staleBefore = new Date(Date.now() - STALE_PENDING_MINUTES * 60_000);

      const [pendingOlderThan15m, expiredNotReleased, approvedNotPaid] = await Promise.all([
        prisma.payment.count({
          where: { status: PaymentStatus.PENDING, createdAt: { lt: staleBefore } },
        }),
        // El cobro ya venció y, sin embargo, las unidades siguen apartadas.
        // Son productos bloqueados para una venta que no va a ocurrir, y no se
        // ven por ningún otro lado: el catálogo solo muestra menos disponible,
        // sin decir por qué.
        prisma.payment.count({
          where: { expiresAt: { lt: new Date() }, reservationState: 'HELD' },
        }),
        /**
         * Cobrado y sin entregar. Es el peor descuadre posible.
         *
         * Pasa cuando la aprobación llega DESPUÉS de que el intento venció: el
         * sistema ya había anulado el pedido y soltado las unidades, así que el
         * aviso tardío deja el cobro aprobado y el pedido cancelado. El dinero
         * se movió y no hay nada que despachar.
         *
         * No se arregla solo a propósito: volver a descontar unidades que quizá
         * ya se vendieron es una decisión con consecuencias y la toma una
         * persona. Lo que sí tiene que pasar es que se vea.
         */
        prisma.payment.count({
          where: {
            status: PaymentStatus.APPROVED,
            order: { status: { notIn: [OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] } },
          },
        }),
      ]);

      return {
        provider: gateway.id,
        configured: gateway.configured,
        problems: [...gateway.problems],
        pendingOlderThan15m,
        staleAfterMinutes: STALE_PENDING_MINUTES,
        expiredNotReleased,
        approvedNotPaid,
      };
    });

    secured.get('/api/admin/payments', async (request) => {
      const query = parse(listQuery, request.query);

      /**
       * El filtro sin el estado.
       *
       * Se separa porque las fichas de arriba (aprobados, pendientes,
       * rechazados) tienen que seguir contando los tres aunque se esté
       * mirando uno solo. Si el estado entrara aquí, elegir "Rechazado"
       * dejaría dos fichas en cero y parecería que no hubo un solo cobro
       * aprobado en todo el mes.
       */
      const scope: Prisma.PaymentWhereInput = {
        ...(query.provider === 'all' ? {} : { provider: query.provider }),
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
                { reference: { contains: query.search, mode: 'insensitive' } },
                { order: { number: { contains: query.search, mode: 'insensitive' } } },
                { order: { customerEmail: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };

      // En `AND` y no fusionado: el estado del usuario nunca debe pisar —ni
      // ser pisado por— los demás filtros del ámbito.
      const where: Prisma.PaymentWhereInput =
        query.status === 'all' ? scope : { AND: [scope, { status: query.status }] };

      const [items, total, byStatus] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: listInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.payment.count({ where }),
        // Un solo recorrido agrupado en vez de tres conteos: los tres números
        // salen de la misma foto y no pueden contradecirse entre sí.
        prisma.payment.groupBy({
          by: ['status'],
          where: scope,
          _count: { _all: true },
          _sum: { amountInCents: true },
        }),
      ]);

      const count = (status: PaymentStatus): number =>
        byStatus.find((row) => row.status === status)?._count._all ?? 0;

      const approvedCents =
        byStatus.find((row) => row.status === PaymentStatus.APPROVED)?._sum.amountInCents ?? 0;

      return {
        items: items.map(serializePayment),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        totals: {
          approved: count(PaymentStatus.APPROVED),
          approvedAmount: fromCents(approvedCents),
          pending: count(PaymentStatus.PENDING),
          declined: count(PaymentStatus.DECLINED),
        },
      };
    });

    secured.get('/api/admin/payments/:id', async (request, reply) => {
      const { id } = parse(idParam, request.params);

      const payment = await prisma.payment.findUnique({ where: { id }, include: detailInclude });
      if (!payment) {
        return reply.code(404).send({ error: 'No existe ese cobro.', code: 'NOT_FOUND' });
      }

      return serializePaymentDetail(payment);
    });

    secured.post('/api/admin/payments/:id/sync', async (request, reply) => {
      const { id } = parse(idParam, request.params);

      const payment = await prisma.payment.findUnique({ where: { id }, select: { id: true } });
      if (!payment) {
        return reply.code(404).send({ error: 'No existe ese cobro.', code: 'NOT_FOUND' });
      }

      // Lo que devuelva `syncPayment` da igual aquí: el cobro se relee de la
      // base justo después. Así el panel recibe siempre la misma forma que en
      // el detalle —bitácora incluida, con el evento que acaba de nacer— y
      // esta ruta no queda atada a la forma del resultado del servicio.
      await syncPayment(payment.id);

      const updated = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: detailInclude,
      });
      return serializePaymentDetail(updated);
    });
  });
}
