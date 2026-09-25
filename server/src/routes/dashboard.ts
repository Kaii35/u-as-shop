import type { FastifyInstance } from 'fastify';
import { OrderStatus, Prisma, SalesChannel } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { kpi, orderMargin, soldWhere } from '../sales.js';
import { findSetting } from '../settings-defaults.js';

/**
 * Portada del panel: GET /api/admin/dashboard.
 *
 * Es la pantalla que más se abre, así que todo sale en una sola llamada y en
 * un puñado de consultas lanzadas en paralelo. Nada de una consulta por
 * producto ni de sumar en JavaScript lo que Postgres suma mejor.
 */

// ---------------------------------------------------------------------------
// Zona horaria
// ---------------------------------------------------------------------------

/**
 * Colombia es UTC-5 todo el año: no tiene horario de verano desde 1993. Por
 * eso el desfase se puede tratar como una constante en vez de arrastrar una
 * librería de zonas horarias solo para esta pantalla.
 *
 * Agrupar en UTC NO sirve: una venta de las 8 de la noche en Bogotá es la
 * 1:00 UTC del día siguiente. Con `date_trunc` sobre UTC esa venta se iría al
 * día de mañana, el "hoy" del panel empezaría a las 7 p. m. y la dueña vería
 * la tarde de ayer sumada dentro del día de hoy. Por eso todo lo que se
 * agrupa por fecha —la serie, el eje, el rango from/to y el corte del stock
 * parado— se calcula sobre la fecha civil bogotana.
 */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Fecha civil (año, mes 0-11, día) que se está viviendo en Bogotá. */
interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function bogotaCivil(instant: Date): CivilDate {
  // Restar el desfase y leer en UTC da los mismos números que leería un reloj
  // de pared en Bogotá.
  const shifted = new Date(instant.getTime() - BOGOTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

// ---------------------------------------------------------------------------
// Rangos y eje de tiempo
// ---------------------------------------------------------------------------

type Granularity = 'day' | 'month';

const RANGES = {
  '7d': { granularity: 'day', buckets: 7 },
  '30d': { granularity: 'day', buckets: 30 },
  '90d': { granularity: 'day', buckets: 90 },
  '12m': { granularity: 'month', buckets: 12 },
} as const satisfies Record<string, { granularity: Granularity; buckets: number }>;

type RangeKey = keyof typeof RANGES;

const querySchema = z.object({
  range: z.enum(['7d', '30d', '90d', '12m']).default('30d'),
});

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n: number): string => String(n).padStart(2, '0');

interface Bucket {
  /** Clave del contrato: YYYY-MM-DD por día, YYYY-MM por mes. */
  readonly key: string;
  readonly label: string;
  /** Instante UTC en que empieza ese día (o mes) bogotano. */
  readonly start: Date;
}

/**
 * Bucket que está `back` posiciones antes del actual. Acepta `back = -1` para
 * preguntar por el siguiente, que es como se calcula el final del rango.
 *
 * `Date.UTC` ya normaliza los desbordes (día 0, mes -3), así que no hay que
 * hacer aritmética de calendario a mano.
 */
function bucketAt(today: CivilDate, granularity: Granularity, back: number): Bucket {
  if (granularity === 'day') {
    const civil = new Date(Date.UTC(today.year, today.month, today.day - back));
    return {
      key: `${civil.getUTCFullYear()}-${pad(civil.getUTCMonth() + 1)}-${pad(civil.getUTCDate())}`,
      label: `${civil.getUTCDate()} ${MONTHS[civil.getUTCMonth()]}`,
      start: new Date(civil.getTime() + BOGOTA_OFFSET_MS),
    };
  }
  const civil = new Date(Date.UTC(today.year, today.month - back, 1));
  return {
    key: `${civil.getUTCFullYear()}-${pad(civil.getUTCMonth() + 1)}`,
    label: `${MONTHS[civil.getUTCMonth()]} ${civil.getUTCFullYear()}`,
    start: new Date(civil.getTime() + BOGOTA_OFFSET_MS),
  };
}

// ---------------------------------------------------------------------------
// Trozos de SQL compartidos
// ---------------------------------------------------------------------------

/**
 * Qué cuenta como venta, en SQL. Sale de `soldWhere` para que la definición
 * siga viviendo en un solo sitio: si mañana cambia allí, cambia aquí.
 *
 * `Prisma.join` deja un marcador por estado y los valores viajan como
 * parámetros. Nunca se concatena texto en la consulta: eso sería inyección.
 */
const SOLD_SQL = Prisma.join([...soldWhere.status.in]);

/**
 * Las columnas de fecha son `timestamp(3)` SIN zona y guardan hora UTC. El
 * corte viaja como texto ISO y se castea aquí para que la comparación no
 * dependa del `TimeZone` de la sesión de Postgres, que es justo el detalle que
 * hace que el mismo reporte dé distinto en dos servidores.
 */
const at = (d: Date): Prisma.Sql => Prisma.sql`${d.toISOString()}::timestamp`;

/**
 * Fecha civil bogotana de un pedido. Es la misma conversión que usa el eje
 * generado en JS: si las dos no coincidieran, los buckets de la consulta no
 * encajarían en el eje y la serie saldría entera en ceros.
 */
const bogotaDate = Prisma.sql`(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota')`;

// Cuántas filas lleva cada lista. Son listas de portada: la tabla completa
// vive en su propia pantalla.
const TOP_PRODUCTS = 8;
const TOP_CATEGORIES = 6;
const MAX_ALERTS = 8;
const RECENT = 8;
const TOP_PROMOTIONS = 6;

/** Ventana fija de las alertas: el contrato define `dailySales` como el promedio de 30 días. */
const ALERT_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Filas crudas
// ---------------------------------------------------------------------------

/**
 * Ojo con los tipos: `SUM()` y `COUNT()` vuelven de Postgres como `bigint`, y
 * `JSON.stringify` revienta con un bigint. Todo pasa por `Number()` antes de
 * salir en la respuesta.
 */
interface TotalsRow {
  revenue: bigint;
  orders: bigint;
  units: bigint;
  shipping: bigint;
  cost: bigint;
}

type SeriesRow = TotalsRow & { bucket: string };

const EMPTY_TOTALS: TotalsRow = { revenue: 0n, orders: 0n, units: 0n, shipping: 0n, cost: 0n };

interface Totals {
  readonly revenue: number;
  readonly orders: number;
  readonly units: number;
  readonly margin: number;
  readonly avgTicket: number;
}

/**
 * El margen se calcula con `orderMargin`, el mismo de `src/sales.ts`, pero
 * sobre las sumas del periodo. Se puede porque la fórmula es lineal: la suma
 * de (total − envío − costo) es (Σtotal − Σenvío − Σcosto). Así la regla
 * sigue escrita una sola vez y no se duplica dentro del SQL.
 */
function toTotals(row: TotalsRow): Totals {
  const revenue = Number(row.revenue);
  const orders = Number(row.orders);
  return {
    revenue,
    orders,
    units: Number(row.units),
    margin: orderMargin({
      total: revenue,
      shipping: Number(row.shipping),
      cost: Number(row.cost),
    }),
    // Ticket promedio entero: en pesos no hay centavos que mostrar.
    avgTicket: orders > 0 ? Math.round(revenue / orders) : 0,
  };
}

interface TopProductRow {
  id: string;
  sku: string;
  name: string;
  images: string[];
  units: bigint;
  revenue: bigint;
}

interface TopCategoryRow {
  id: string;
  name: string;
  units: bigint;
  revenue: bigint;
}

interface AlertRow {
  productId: string;
  sku: string;
  name: string;
  images: string[];
  stock: number;
  minStock: number;
  units: bigint;
}

interface StockRow {
  products: bigint;
  unitsInStock: bigint;
  stockValue: bigint;
  stockCost: bigint;
  lowStock: bigint;
  outOfStock: bigint;
  deadStock: bigint;
}

interface PromotionRow {
  id: string;
  name: string;
  active: boolean;
  popupViews: number;
  popupClicks: number;
  orders: bigint;
  revenue: bigint;
  discount: bigint;
}

interface AlertItem {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly image: string | null;
  readonly stock: number;
  readonly minStock: number;
  readonly severity: 'out' | 'low';
  readonly dailySales: number;
  readonly daysLeft: number | null;
  readonly suggestedOrder: number;
}

/** Lee un ajuste numérico de la tabla `Setting`, con el valor sembrado como red. */
function numericSetting(
  rows: readonly { key: string; value: Prisma.JsonValue }[],
  key: string,
): number {
  const stored = rows.find((r) => r.key === key)?.value;
  const parsed = typeof stored === 'number' ? stored : Number(stored);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  // Si nadie lo sembró todavía manda la lista de `settings-defaults.ts`: es la
  // misma fuente que usa el seed, así el panel no cambia de criterio según la
  // base esté recién creada o no.
  const fallback = findSetting(key)?.value;
  return typeof fallback === 'number' ? fallback : 0;
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/dashboard', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'El rango pedido no existe. Usa 7d, 30d, 90d o 12m.' });
    }

    const range: RangeKey = parsed.data.range;
    const { granularity, buckets } = RANGES[range];

    // -----------------------------------------------------------------------
    // Eje de tiempo
    // -----------------------------------------------------------------------
    const today = bogotaCivil(new Date());

    // El eje se genera entero en JS, del más viejo al más nuevo. `groupBy`
    // solo devuelve los días que tuvieron ventas: si la serie saliera de ahí,
    // los días en cero faltarían y la gráfica uniría los dos extremos del
    // hueco con una recta por encima, mintiendo sobre lo que pasó ese día.
    const axis: Bucket[] = [];
    for (let back = buckets - 1; back >= 0; back -= 1) {
      axis.push(bucketAt(today, granularity, back));
    }

    const from = axis[0].start;
    // El rango llega hasta el último milisegundo del último bucket (hoy, o el
    // mes en curso), otra vez en hora de Bogotá.
    const to = new Date(bucketAt(today, granularity, -1).start.getTime() - 1);
    // Periodo anterior: misma duración, pegado justo antes. 30d compara con
    // los 30 días previos; 12m, con los 12 meses previos.
    const prevFrom = bucketAt(today, granularity, buckets * 2 - 1).start;
    const prevTo = new Date(from.getTime() - 1);

    // Ventana de las alertas: los últimos 30 días bogotanos, independiente del
    // `range` que se esté mirando, porque el contrato define `dailySales` así.
    const alertsFrom = bucketAt(today, 'day', ALERT_WINDOW_DAYS - 1).start;

    const unit = granularity === 'day' ? 'day' : 'month';
    const fmt = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';

    const windowWhere = { ...soldWhere, createdAt: { gte: from, lte: to } };

    // -----------------------------------------------------------------------
    // Primera tanda: todo lo que no depende de nada más, en paralelo.
    // -----------------------------------------------------------------------
    const [
      seriesRows,
      previousRows,
      topProductRows,
      topCategoryRows,
      channelRows,
      statusRows,
      alertRows,
      recentOrderRows,
      recentMovementRows,
      promotionRows,
      settingRows,
    ] = await Promise.all([
      // 1. Serie del periodo, agrupada por fecha civil bogotana. El LATERAL
      // trae las unidades sin multiplicar las filas del pedido: un JOIN
      // directo contra order_items sumaría el total del pedido una vez por
      // línea y el ingreso saldría inflado.
      prisma.$queryRaw<SeriesRow[]>`
        SELECT
          to_char(date_trunc(${unit}::text, ${bogotaDate}), ${fmt}::text) AS bucket,
          COALESCE(SUM(o."total"), 0)::bigint    AS revenue,
          COUNT(*)::bigint                       AS orders,
          COALESCE(SUM(i.units), 0)::bigint      AS units,
          COALESCE(SUM(o."shipping"), 0)::bigint AS shipping,
          COALESCE(SUM(o."cost"), 0)::bigint     AS cost
        FROM "orders" o
        LEFT JOIN LATERAL (
          SELECT SUM(oi."quantity") AS units FROM "order_items" oi WHERE oi."orderId" = o."id"
        ) i ON TRUE
        WHERE o."status"::text IN (${SOLD_SQL})
          AND o."createdAt" >= ${at(from)}
          AND o."createdAt" <= ${at(to)}
        GROUP BY 1
      `,

      // 2. Totales del periodo anterior, en una sola fila.
      prisma.$queryRaw<TotalsRow[]>`
        SELECT
          COALESCE(SUM(o."total"), 0)::bigint    AS revenue,
          COUNT(*)::bigint                       AS orders,
          COALESCE(SUM(i.units), 0)::bigint      AS units,
          COALESCE(SUM(o."shipping"), 0)::bigint AS shipping,
          COALESCE(SUM(o."cost"), 0)::bigint     AS cost
        FROM "orders" o
        LEFT JOIN LATERAL (
          SELECT SUM(oi."quantity") AS units FROM "order_items" oi WHERE oi."orderId" = o."id"
        ) i ON TRUE
        WHERE o."status"::text IN (${SOLD_SQL})
          AND o."createdAt" >= ${at(prevFrom)}
          AND o."createdAt" <= ${at(prevTo)}
      `,

      // 3. Productos más vendidos del periodo.
      prisma.$queryRaw<TopProductRow[]>`
        SELECT p."id" AS id, p."sku" AS sku, p."name" AS name, p."images" AS images,
               SUM(oi."quantity")::bigint  AS units,
               SUM(oi."lineTotal")::bigint AS revenue
        FROM "order_items" oi
        JOIN "orders" o   ON o."id" = oi."orderId"
        JOIN "products" p ON p."id" = oi."productId"
        WHERE o."status"::text IN (${SOLD_SQL})
          AND o."createdAt" >= ${at(from)}
          AND o."createdAt" <= ${at(to)}
        GROUP BY p."id", p."sku", p."name", p."images"
        ORDER BY units DESC, revenue DESC
        LIMIT ${TOP_PRODUCTS}
      `,

      // 4. Categorías más vendidas del periodo.
      prisma.$queryRaw<TopCategoryRow[]>`
        SELECT c."id" AS id, c."name" AS name,
               SUM(oi."quantity")::bigint  AS units,
               SUM(oi."lineTotal")::bigint AS revenue
        FROM "order_items" oi
        JOIN "orders" o     ON o."id" = oi."orderId"
        JOIN "products" p   ON p."id" = oi."productId"
        JOIN "categories" c ON c."id" = p."categoryId"
        WHERE o."status"::text IN (${SOLD_SQL})
          AND o."createdAt" >= ${at(from)}
          AND o."createdAt" <= ${at(to)}
        GROUP BY c."id", c."name"
        ORDER BY revenue DESC, units DESC
        LIMIT ${TOP_CATEGORIES}
      `,

      // 5. Ventas por canal.
      prisma.order.groupBy({
        by: ['channel'],
        where: windowWhere,
        _count: { _all: true },
        _sum: { total: true },
      }),

      // 6. Pedidos por estado. Aquí NO va `soldWhere`: el panel quiere ver
      // también los PENDING por cobrar y los cancelados del periodo.
      prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),

      // 7. Alertas de stock: UNA agregación para todos los candidatos. El
      // LATERAL resuelve las ventas de cada producto dentro de la misma
      // consulta; buscar los productos y luego preguntar por cada uno serían
      // decenas de viajes a la base para pintar ocho filas.
      prisma.$queryRaw<AlertRow[]>`
        SELECT p."id" AS "productId", p."sku" AS sku, p."name" AS name, p."images" AS images,
               p."stock" AS stock, p."minStock" AS "minStock",
               COALESCE(s.units, 0)::bigint AS units
        FROM "products" p
        LEFT JOIN LATERAL (
          SELECT SUM(oi."quantity") AS units
          FROM "order_items" oi
          JOIN "orders" o ON o."id" = oi."orderId"
          WHERE oi."productId" = p."id"
            AND o."status"::text IN (${SOLD_SQL})
            AND o."createdAt" >= ${at(alertsFrom)}
        ) s ON TRUE
        WHERE p."active" = true AND p."stock" <= p."minStock"
      `,

      // 8. Últimos pedidos, del estado que sea: es una lista operativa, no un
      // ingreso, y el pedido que hay que cobrar hoy es justo el PENDING.
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT,
        select: {
          id: true,
          number: true,
          customerName: true,
          total: true,
          status: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),

      // 9. Últimos movimientos de inventario.
      prisma.inventoryMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT,
        select: {
          id: true,
          type: true,
          quantity: true,
          stockAfter: true,
          reason: true,
          createdAt: true,
          product: { select: { sku: true, name: true } },
          user: { select: { name: true } },
        },
      }),

      // 10. Rendimiento de las promociones en el periodo. Las condiciones del
      // periodo van en el ON y no en el WHERE: en el WHERE descartarían las
      // promociones activas que todavía no han vendido nada, que son
      // precisamente las que hay que vigilar.
      prisma.$queryRaw<PromotionRow[]>`
        SELECT pr."id" AS id, pr."name" AS name, pr."active" AS active,
               pr."popupViews" AS "popupViews", pr."popupClicks" AS "popupClicks",
               COUNT(o."id")::bigint                  AS orders,
               COALESCE(SUM(o."total"), 0)::bigint    AS revenue,
               COALESCE(SUM(o."discount"), 0)::bigint AS discount
        FROM "promotions" pr
        LEFT JOIN "orders" o
          ON o."promotionId" = pr."id"
         AND o."status"::text IN (${SOLD_SQL})
         AND o."createdAt" >= ${at(from)}
         AND o."createdAt" <= ${at(to)}
        GROUP BY pr."id", pr."name", pr."active", pr."popupViews", pr."popupClicks"
        HAVING pr."active" = true OR COUNT(o."id") > 0
        ORDER BY revenue DESC, pr."active" DESC
        LIMIT ${TOP_PROMOTIONS}
      `,

      // 11. Los dos ajustes que necesita esta pantalla, en una sola consulta.
      prisma.setting.findMany({
        where: { key: { in: ['inventory.deadStockDays', 'inventory.coverageDays'] } },
        select: { key: true, value: true },
      }),
    ]);

    const deadStockDays = numericSetting(settingRows, 'inventory.deadStockDays');
    const coverageDays = numericSetting(settingRows, 'inventory.coverageDays');

    // El corte del stock parado también es un día bogotano completo: "sin
    // ventas en 60 días" se cuenta desde las 00:00 de allá, no desde una hora
    // cualquiera de la madrugada UTC.
    const deadStockFrom = bucketAt(today, 'day', deadStockDays - 1).start;

    // -----------------------------------------------------------------------
    // Segunda tanda: la única consulta que depende de un ajuste leído arriba.
    // -----------------------------------------------------------------------
    const stockRows = await prisma.$queryRaw<StockRow[]>`
      SELECT
        COUNT(*)::bigint                                        AS products,
        COALESCE(SUM(p."stock"), 0)::bigint                     AS "unitsInStock",
        COALESCE(SUM(p."stock"::bigint * p."price"), 0)::bigint  AS "stockValue",
        COALESCE(SUM(p."stock"::bigint * p."cost"), 0)::bigint   AS "stockCost",
        -- Cada producto contra SU propio minStock, no contra un 5 fijo: es el
        -- mismo criterio de la tabla de inventario y los dos números tienen
        -- que coincidir. Agotado y bajo son excluyentes, como en stockStatus().
        (COUNT(*) FILTER (WHERE p."stock" > 0 AND p."stock" <= p."minStock"))::bigint AS "lowStock",
        (COUNT(*) FILTER (WHERE p."stock" <= 0))::bigint        AS "outOfStock",
        (COUNT(*) FILTER (WHERE NOT EXISTS (
           SELECT 1
           FROM "order_items" oi
           JOIN "orders" o ON o."id" = oi."orderId"
           WHERE oi."productId" = p."id"
             AND o."status"::text IN (${SOLD_SQL})
             AND o."createdAt" >= ${at(deadStockFrom)}
        )))::bigint                                             AS "deadStock"
      FROM "products" p
      WHERE p."active" = true
    `;

    // -----------------------------------------------------------------------
    // Serie continua
    // -----------------------------------------------------------------------
    const byBucket = new Map<string, SeriesRow>(seriesRows.map((r) => [r.bucket, r]));
    const series = axis.map((b) => {
      const totals = toTotals(byBucket.get(b.key) ?? EMPTY_TOTALS);
      return {
        bucket: b.key,
        label: b.label,
        revenue: totals.revenue,
        orders: totals.orders,
        units: totals.units,
        margin: totals.margin,
      };
    });

    // Los KPIs del periodo salen de sumar la serie: el eje cubre exactamente
    // [from, to], así que cada pedido cayó en uno y solo un bucket. Sumar aquí
    // ahorra una consulta que daría el mismo número.
    const current = series.reduce(
      (acc, b) => ({
        revenue: acc.revenue + b.revenue,
        orders: acc.orders + b.orders,
        units: acc.units + b.units,
        margin: acc.margin + b.margin,
      }),
      { revenue: 0, orders: 0, units: 0, margin: 0 },
    );
    const currentAvgTicket = current.orders > 0 ? Math.round(current.revenue / current.orders) : 0;
    const previous = toTotals(previousRows[0] ?? EMPTY_TOTALS);

    // -----------------------------------------------------------------------
    // Alertas
    // -----------------------------------------------------------------------
    const alerts: AlertItem[] = alertRows.map((r) => {
      // Promedio diario redondeado a un decimal: es el número que se muestra,
      // y `daysLeft` se calcula con ese mismo valor para que quien lea la
      // pantalla pueda rehacer la división y le dé lo mismo.
      const dailySales = Math.round((Number(r.units) / ALERT_WINDOW_DAYS) * 10) / 10;
      // Se pide para cubrir los días de cobertura configurados, pero nunca
      // menos del mínimo: un producto que no rota igual tiene que estar en el
      // estante, y un sugerido de cero al lado de una alerta no ayuda a nadie.
      const target = Math.max(Math.ceil(dailySales * coverageDays), r.minStock);
      return {
        productId: r.productId,
        sku: r.sku,
        name: r.name,
        image: r.images[0] ?? null,
        stock: r.stock,
        minStock: r.minStock,
        severity: r.stock <= 0 ? 'out' : 'low',
        dailySales,
        // Sin ventas no hay ritmo que proyectar: null, ni 0 ni infinito.
        daysLeft: dailySales === 0 ? null : Math.floor(r.stock / dailySales),
        suggestedOrder: Math.max(0, target - r.stock),
      };
    });

    // Se ordena en JS y no en SQL porque los candidatos (activos por debajo de
    // su mínimo) son pocos y el criterio de urgencia mezcla tres campos.
    // Primero lo agotado, luego lo que se acaba antes; lo que no se vende va
    // al final: tiene poco stock, pero tampoco lo necesita nadie.
    alerts.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'out' ? -1 : 1;
      if (a.daysLeft === null || b.daysLeft === null) {
        if (a.daysLeft === b.daysLeft) return b.dailySales - a.dailySales;
        return a.daysLeft === null ? 1 : -1;
      }
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
      return b.dailySales - a.dailySales;
    });

    // -----------------------------------------------------------------------
    // Respuesta
    // -----------------------------------------------------------------------
    const channelByName = new Map(channelRows.map((c) => [c.channel, c]));
    const statusByName = new Map(statusRows.map((s) => [s.status, s._count._all]));
    const stock = stockRows[0];

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      granularity,

      kpis: {
        revenue: kpi(current.revenue, previous.revenue),
        orders: kpi(current.orders, previous.orders),
        units: kpi(current.units, previous.units),
        avgTicket: kpi(currentAvgTicket, previous.avgTicket),
        margin: kpi(current.margin, previous.margin),
      },

      series,

      topProducts: topProductRows.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        image: p.images[0] ?? null,
        units: Number(p.units),
        revenue: Number(p.revenue),
      })),

      topCategories: topCategoryRows.map((c) => ({
        id: c.id,
        name: c.name,
        units: Number(c.units),
        revenue: Number(c.revenue),
      })),

      // Los tres canales van siempre, aunque alguno no haya vendido: así las
      // barras del panel no cambian de sitio entre un rango y otro.
      channels: Object.values(SalesChannel).map((channel) => ({
        channel,
        orders: channelByName.get(channel)?._count._all ?? 0,
        revenue: channelByName.get(channel)?._sum.total ?? 0,
      })),

      // Mismo motivo: el objeto lleva los siete estados, en cero los que no
      // aparecieron. Un estado ausente obligaría al panel a poner `?? 0` en
      // cada celda y a inventarse el orden.
      ordersByStatus: Object.fromEntries(
        Object.values(OrderStatus).map((status) => [status, statusByName.get(status) ?? 0]),
      ) as Record<OrderStatus, number>,

      stock: {
        products: Number(stock?.products ?? 0),
        unitsInStock: Number(stock?.unitsInStock ?? 0),
        stockValue: Number(stock?.stockValue ?? 0),
        stockCost: Number(stock?.stockCost ?? 0),
        lowStock: Number(stock?.lowStock ?? 0),
        outOfStock: Number(stock?.outOfStock ?? 0),
        deadStock: Number(stock?.deadStock ?? 0),
      },

      alerts: alerts.slice(0, MAX_ALERTS),

      recentOrders: recentOrderRows.map((o) => ({
        id: o.id,
        number: o.number,
        customerName: o.customerName,
        total: o.total,
        status: o.status,
        // Líneas del pedido, que es lo que se lista debajo del número.
        items: o._count.items,
        createdAt: o.createdAt.toISOString(),
      })),

      recentMovements: recentMovementRows.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        stockAfter: m.stockAfter,
        reason: m.reason,
        sku: m.product.sku,
        productName: m.product.name,
        // Null cuando lo hizo el sistema (una venta), no una persona.
        userName: m.user?.name ?? null,
        createdAt: m.createdAt.toISOString(),
      })),

      promotions: promotionRows.map((p) => ({
        id: p.id,
        name: p.name,
        active: p.active,
        orders: Number(p.orders),
        revenue: Number(p.revenue),
        discount: Number(p.discount),
        popupViews: p.popupViews,
        popupClicks: p.popupClicks,
        // Sin vistas no hay tasa: 0 es más honesto que dividir por cero.
        ctr: p.popupViews > 0 ? Math.round((p.popupClicks / p.popupViews) * 1000) / 10 : 0,
      })),
    };
  });
}
