import type { FastifyInstance } from 'fastify';
import { MovementType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { decrementStock, incrementStock, setStock } from '../inventory.js';
import { soldWhere } from '../sales.js';
import { productInclude, serializeAdminProduct } from '../serializers.js';

/**
 * Inventario del panel.
 *
 * Aquí no se escribe `stock` nunca: todo pasa por `src/inventory.ts` dentro de
 * una transacción. Esa es la única razón por la que el historial de movimientos
 * puede explicar, unidad por unidad, cómo se llegó al stock de hoy.
 */

/** Error con código HTTP para el manejador central de `index.ts`. */
function httpError(status: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = status;
  return error;
}

/**
 * Valida y, si falla, responde 400 con el primer problema.
 *
 * Zod devuelve la lista entera, pero un formulario solo puede señalar un campo
 * a la vez y la primera queja suele ser la que de verdad hay que arreglar.
 */
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
// Movimientos
// ---------------------------------------------------------------------------

const movementInclude = {
  product: { select: { sku: true, name: true } },
  user: { select: { name: true } },
  order: { select: { number: true } },
} as const;

type MovementRow = Prisma.InventoryMovementGetPayload<{ include: typeof movementInclude }>;

const serializeMovement = (m: MovementRow) => ({
  id: m.id,
  type: m.type,
  quantity: m.quantity,
  stockAfter: m.stockAfter,
  unitCost: m.unitCost,
  reason: m.reason,
  productId: m.productId,
  sku: m.product.sku,
  productName: m.product.name,
  userName: m.user?.name ?? null,
  orderNumber: m.order?.number ?? null,
  createdAt: m.createdAt,
});

/**
 * Recupera el movimiento recién escrito.
 *
 * El servicio de inventario devuelve el stock resultante, no la fila, así que
 * se busca el último movimiento de ese producto que dejó ese stock exacto:
 * dentro de la transacción es, por construcción, el que acabamos de crear.
 */
async function lastMovement(
  tx: Prisma.TransactionClient,
  productId: string,
  stockAfter: number,
): Promise<MovementRow> {
  return tx.inventoryMovement.findFirstOrThrow({
    where: { productId, stockAfter },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: movementInclude,
  });
}

const listQuery = z.object({
  productId: z.string().min(1).optional(),
  type: z.nativeEnum(MovementType).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: intFromQuery.min(1).default(1),
  limit: intFromQuery.min(1).max(200).default(50),
});

const createBody = z.object({
  productId: z.string().min(1, 'Hace falta el producto.'),
  type: z.nativeEnum(MovementType, {
    errorMap: () => ({ message: 'Tipo de movimiento desconocido.' }),
  }),
  quantity: z.number().int('La cantidad son unidades enteras.'),
  unitCost: z.number().int().min(0).optional(),
  reason: z.string().trim().max(300).optional(),
});

const countBody = z.object({
  productId: z.string().min(1, 'Hace falta el producto.'),
  newStock: z.number().int().min(0, 'El stock contado no puede ser negativo.'),
  reason: z.string().trim().max(300).optional(),
});

const bulkBody = z.object({
  reason: z.string().trim().max(300).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        newStock: z.number().int().min(0, 'El stock contado no puede ser negativo.'),
      }),
    )
    .min(1, 'Manda al menos un conteo.')
    .max(500, 'Máximo 500 conteos por tanda.'),
});

const alertsQuery = z.object({
  severity: z.enum(['all', 'low', 'out']).default('all'),
});

// ---------------------------------------------------------------------------
// Alertas de reposición
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 30;

type Severity = 'low' | 'out';

interface StockAlert {
  productId: string;
  sku: string;
  name: string;
  image: string | null;
  stock: number;
  minStock: number;
  severity: Severity;
  dailySales: number;
  daysLeft: number | null;
  suggestedOrder: number;
}

/**
 * Productos activos que están en su mínimo o por debajo.
 *
 * El ritmo de venta sale de UNA sola agregación sobre `OrderItem` para todas
 * las referencias a la vez. Preguntarlo dentro del bucle daría lo mismo a
 * costa de una consulta por producto, y estas alertas se piden en cada carga
 * del panel.
 */
async function buildAlerts(): Promise<StockAlert[]> {
  const products = await prisma.product.findMany({
    // Comparación columna contra columna: cada referencia trae su propio
    // mínimo, un torno de 390.000 no se repone como un esmalte de 32.000.
    where: { active: true, stock: { lte: prisma.product.fields.minStock } },
    select: { id: true, sku: true, name: true, images: true, stock: true, minStock: true },
  });
  if (products.length === 0) return [];

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const sold = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      productId: { in: products.map((p) => p.id) },
      order: { ...soldWhere, createdAt: { gte: since } },
    },
    _sum: { quantity: true },
  });
  const unitsByProduct = new Map(sold.map((row) => [row.productId, row._sum.quantity ?? 0]));

  const alerts = products.map((product): StockAlert => {
    const units = unitsByProduct.get(product.id) ?? 0;
    const dailySales = units / WINDOW_DAYS;

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      image: product.images[0] ?? null,
      stock: product.stock,
      minStock: product.minStock,
      severity: product.stock <= 0 ? 'out' : 'low',
      // El redondeo es solo para mostrarlo; las cuentas de abajo usan el valor
      // exacto, que con una unidad al mes daría 0,03 y se perdería al redondear.
      dailySales: Math.round(dailySales * 100) / 100,
      // Sin ventas no hay ritmo que proyectar. Un 999 o un Infinity serían una
      // cifra inventada, y quien lea el panel la leería como un dato real.
      daysLeft: dailySales === 0 ? null : Math.floor(product.stock / dailySales),
      suggestedOrder: Math.max(0, Math.ceil(dailySales * WINDOW_DAYS) - product.stock),
    };
  });

  // Primero lo agotado, que es venta perdida hoy mismo; después lo que menos
  // dura. Lo que no se vende cierra la lista: es lo último que hay que pedir.
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'out' ? -1 : 1;
    if (a.daysLeft === null || b.daysLeft === null) {
      if (a.daysLeft === b.daysLeft) return a.name.localeCompare(b.name);
      return a.daysLeft === null ? 1 : -1;
    }
    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
    return a.name.localeCompare(b.name);
  });

  return alerts;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (secured) => {
    secured.addHook('preHandler', requireAuth);

    secured.get('/api/admin/inventory/movements', async (request) => {
      const query = parse(listQuery, request.query);

      const where: Prisma.InventoryMovementWhereInput = {
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.inventoryMovement.findMany({
          where,
          include: movementInclude,
          // El desempate por id importa: la historia sembrada trae varios
          // movimientos con la misma fecha y sin él la página 2 repetiría
          // filas que ya salieron en la 1.
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.inventoryMovement.count({ where }),
      ]);

      return {
        items: items.map(serializeMovement),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      };
    });

    secured.post('/api/admin/inventory/movements', async (request, reply) => {
      const body = parse(createBody, request.body);

      // SALE lo escribe el pedido al pagarse e INITIAL el alta del producto.
      // Dejarlos a mano permitiría "vender" sin pedido, y el inventario
      // dejaría de cuadrar contra los pedidos: justo lo que el historial
      // existe para garantizar.
      if (body.type === MovementType.SALE || body.type === MovementType.INITIAL) {
        return reply.code(400).send({
          error:
            `Los movimientos ${body.type} los crea el sistema: SALE al pagarse un pedido e ` +
            'INITIAL al dar de alta el producto. Registra una compra, una devolución o un ajuste.',
        });
      }

      if (body.quantity === 0) {
        return reply.code(400).send({
          error: 'La cantidad no puede ser cero: no movería nada y solo ensuciaría el historial.',
        });
      }

      if (body.quantity < 0 && body.type !== MovementType.ADJUSTMENT) {
        return reply.code(400).send({
          error: `Una cantidad negativa solo tiene sentido en ADJUSTMENT (avería, pérdida, merma). En ${body.type} tiene que ser positiva.`,
        });
      }

      const exists = await prisma.product.findUnique({
        where: { id: body.productId },
        select: { id: true },
      });
      if (!exists) {
        return reply.code(404).send({ error: 'No existe ese producto.', code: 'NOT_FOUND' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const common = {
          productId: body.productId,
          type: body.type,
          reason: body.reason ?? null,
          userId: request.admin?.sub ?? null,
          // El costo unitario solo se guarda en las entradas de compra: en una
          // devolución o un ajuste no hay factura de proveedor que lo respalde.
          unitCost: body.type === MovementType.PURCHASE ? (body.unitCost ?? null) : null,
        };

        const stockAfter =
          body.quantity > 0
            ? await incrementStock(tx, { ...common, quantity: body.quantity })
            : await decrementStock(tx, { ...common, quantity: -body.quantity });

        const movement = await lastMovement(tx, body.productId, stockAfter);
        const product = await tx.product.findUniqueOrThrow({
          where: { id: body.productId },
          include: productInclude,
        });

        return { movement: serializeMovement(movement), product: serializeAdminProduct(product) };
      });

      return reply.code(201).send(result);
    });

    secured.post('/api/admin/inventory/count', async (request, reply) => {
      const body = parse(countBody, request.body);

      const exists = await prisma.product.findUnique({
        where: { id: body.productId },
        select: { id: true },
      });
      if (!exists) {
        return reply.code(404).send({ error: 'No existe ese producto.', code: 'NOT_FOUND' });
      }

      return prisma.$transaction(async (tx) => {
        const before = await tx.product.findUniqueOrThrow({
          where: { id: body.productId },
          select: { stock: true },
        });

        const stockAfter = await setStock(tx, {
          productId: body.productId,
          type: MovementType.ADJUSTMENT,
          newStock: body.newStock,
          reason: body.reason ?? 'Conteo físico',
          userId: request.admin?.sub ?? null,
        });

        // Si el conteo confirma lo que ya decía el sistema no hay movimiento
        // que devolver: `setStock` no escribe uno a propósito.
        const movement =
          stockAfter === before.stock
            ? null
            : serializeMovement(await lastMovement(tx, body.productId, stockAfter));

        const product = await tx.product.findUniqueOrThrow({
          where: { id: body.productId },
          include: productInclude,
        });

        return { movement, product: serializeAdminProduct(product) };
      });
    });

    secured.post('/api/admin/inventory/bulk', async (request, reply) => {
      const body = parse(bulkBody, request.body);

      const ids = body.items.map((item) => item.productId);
      const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
      if (repeated) {
        return reply.code(400).send({
          error: `El producto ${repeated} viene dos veces. Un conteo físico da un solo número por referencia.`,
        });
      }

      // Se comprueba antes de abrir la transacción para poder contestar qué
      // producto falta; dentro solo sabríamos que algo la hizo fallar.
      const found = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        const known = new Set(found.map((p) => p.id));
        const missing = ids.filter((id) => !known.has(id));
        return reply.code(404).send({
          error: `No existen estos productos: ${missing.join(', ')}. No se guardó ningún conteo.`,
          code: 'NOT_FOUND',
        });
      }

      // Toda la tanda en una transacción: un conteo a medias dejaría el
      // inventario en un estado que no es ni lo contado ni lo que había, y
      // nadie sabría por dónde se quedó para retomarlo.
      return prisma.$transaction(
        async (tx) => {
          let updated = 0;
          let skipped = 0;

          for (const item of body.items) {
            const before = await tx.product.findUniqueOrThrow({
              where: { id: item.productId },
              select: { stock: true },
            });

            const stockAfter = await setStock(tx, {
              productId: item.productId,
              type: MovementType.ADJUSTMENT,
              newStock: item.newStock,
              reason: body.reason ?? 'Conteo físico de inventario',
              userId: request.admin?.sub ?? null,
            });

            // `setStock` devuelve el mismo stock cuando no había nada que
            // corregir, y en ese caso tampoco creó movimiento.
            if (stockAfter === before.stock) skipped += 1;
            else updated += 1;
          }

          return { updated, skipped };
        },
        // Un conteo de bodega entera son cientos de escrituras seguidas y los
        // 5 s por defecto de Prisma se agotan justo al final, con todo hecho.
        { timeout: 60_000 },
      );
    });

    secured.get('/api/admin/inventory/alerts', async (request) => {
      const query = parse(alertsQuery, request.query);
      const alerts = await buildAlerts();

      return {
        items:
          query.severity === 'all' ? alerts : alerts.filter((a) => a.severity === query.severity),
      };
    });
  });
}
