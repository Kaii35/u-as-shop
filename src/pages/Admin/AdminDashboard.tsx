import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CreditCard,
  Package,
  PackageCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import {
  CHANNEL_LABEL,
  MOVEMENT_LABEL,
  ORDER_STATUS_LABEL,
  RANGE_LABEL,
  type Dashboard,
  type DashboardRange,
  type OrderStatus,
  type SeriesPoint,
  type StockAlert,
} from '../../lib/admin-types';
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Refreshing,
  SegmentedControl,
  Skeleton,
  StatCard,
  TableWrap,
  Td,
  Th,
  formatDate,
  formatDateTime,
  money,
  type Tone,
} from '../../components/admin/Primitives';
import { BarList, DistributionBar, Sparkline, TimeSeriesChart } from '../../components/admin/Charts';

/**
 * Resumen del panel.
 *
 * El orden de la pantalla no es decorativo, es la jerarquía del día:
 *
 * 1. Lo que exige actuar hoy (reposición y pedidos por atender). Si se deja al
 *    final, se descubre cuando ya se vendió algo que no había.
 * 2. Cómo va el negocio (cifras y gráfica), que se mira, no se toca.
 * 3. El detalle de apoyo (rankings, inventario, últimos movimientos), que solo
 *    se lee cuando alguna de las dos primeras pide explicación.
 *
 * Todo está escrito para quien atiende el local: "Ingresos" y no "GMV",
 * "Ticket promedio" y no "AOV", y cada cifra que no se explique sola lleva
 * debajo una línea diciendo qué es.
 */

// ---------------------------------------------------------------------------
// Medidas de la gráfica
// ---------------------------------------------------------------------------

type Measure = 'revenue' | 'orders' | 'units' | 'margin';

interface MeasureDef {
  value: Measure;
  label: string;
  format: 'money' | 'count';
  help: string;
}

/**
 * Una medida a la vez. Ingresos y unidades no comparten escala, y superponerlas
 * en un mismo eje haría que la línea de unidades pareciera plana en cero.
 */
const MEASURES: readonly MeasureDef[] = [
  { value: 'revenue', label: 'Ingresos', format: 'money', help: 'Lo que entró por ventas ya cobradas.' },
  { value: 'orders', label: 'Pedidos', format: 'count', help: 'Cuántas ventas se cobraron.' },
  { value: 'units', label: 'Unidades', format: 'count', help: 'Cuántos productos salieron de la bodega.' },
  { value: 'margin', label: 'Margen', format: 'money', help: 'Lo que queda después de restar el costo y el envío.' },
];

const RANGES: readonly DashboardRange[] = ['7d', '30d', '90d', '12m'];

// El control de rango es lo primero que se toca y tiene que caber en 360 px:
// "Últimos 30 días" cuatro veces no cabe, "30 días" sí. El texto completo de
// `RANGE_LABEL` se dice igual en el subtítulo y en la etiqueta del grupo.
const shortRange = (range: DashboardRange): string => RANGE_LABEL[range].replace('Últimos ', '');

const ORDER_FLOW: readonly OrderStatus[] = [
  'PENDING',
  'PAID',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

const STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING: 'warn',
  PAID: 'clay',
  PREPARING: 'clay',
  SHIPPED: 'info',
  DELIVERED: 'ok',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
};

/** Color de cada tramo en la barra apilada. Siempre acompañado de su etiqueta. */
const STATUS_FILL: Record<OrderStatus, string> = {
  PENDING: 'bg-warn',
  PAID: 'bg-clay',
  PREPARING: 'bg-clay-dark',
  SHIPPED: 'bg-ash',
  DELIVERED: 'bg-ok',
  CANCELLED: 'bg-mist',
  REFUNDED: 'bg-danger',
};

const CHANNEL_FILL: Record<string, string> = {
  ONLINE: 'bg-ink',
  COUNTER: 'bg-clay',
  SOCIAL: 'bg-ash',
};

// ---------------------------------------------------------------------------
// Piezas locales
// ---------------------------------------------------------------------------

/** Cifra secundaria: más pequeña que una `StatCard`, para rejillas de 6 o 7. */
function Fact({
  label,
  value,
  hint,
  tone = 'ink',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'ink' | 'warn' | 'danger';
}) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="min-w-0">
      <p className="label-xs">{label}</p>
      <p className={`tnum display mt-1 text-h5 leading-none ${color}`}>{value}</p>
      <p className="mt-1 text-cap leading-snug text-mist">{hint}</p>
    </div>
  );
}

/** Miniatura de producto con reserva: la API puede mandar `image: null`. */
function Thumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-line bg-sand text-mist">
        <Package size={15} strokeWidth={1.75} aria-hidden />
      </span>
    );
  }
  return (
    <img src={src} alt={alt} className="h-10 w-10 shrink-0 rounded border border-line object-cover" />
  );
}

/**
 * Cuánto alcanza el stock.
 *
 * `daysLeft` viene en `null` cuando el producto no se vende: no hay ritmo que
 * proyectar. Se dice con palabras. Un ∞ o un 999 haría creer que hay
 * mercancía de sobra cuando lo que pasa es que está quieta.
 */
function daysLeftText(alert: StockAlert): string {
  if (alert.daysLeft === null) return 'Sin ventas recientes';
  if (alert.daysLeft <= 0) return 'Ya no alcanza para hoy';
  if (alert.daysLeft === 1) return 'Alcanza para 1 día';
  return `Alcanza para ${alert.daysLeft.toLocaleString('es-CO')} días`;
}

/**
 * Primero lo agotado, y dentro de cada grupo lo que menos aguanta.
 * Lo que no tiene ritmo de venta va al final: urge menos que lo que se está
 * vendiendo y se va a acabar el jueves.
 */
function sortAlerts(alerts: StockAlert[]): StockAlert[] {
  return [...alerts].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'out' ? -1 : 1;
    const da = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const db = b.daysLeft ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="display text-h5 text-ink">{children}</h2>;
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const [range, setRange] = useState<DashboardRange>('30d');
  const [measure, setMeasure] = useState<Measure>('revenue');

  const resource = useResource<Dashboard>(
    (signal) => api.get<Dashboard>('/api/admin/dashboard', { range }, signal),
    [range],
  );

  const data = resource.data;
  const measureDef = MEASURES.find((m) => m.value === measure) ?? MEASURES[0];

  const header = (
    <PageHeader
      title="Resumen"
      subtitle={
        data
          ? `${RANGE_LABEL[data.range]} · del ${formatDate(data.from)} al ${formatDate(data.to)}`
          : 'Cómo va la tienda y qué hay que atender hoy.'
      }
      actions={
        <SegmentedControl<DashboardRange>
          label="Periodo que se está mirando"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ value: r, label: shortRange(r) }))}
        />
      }
    />
  );

  if (resource.first) {
    return (
      <>
        {header}
        <DashboardSkeleton />
      </>
    );
  }

  if (!data) {
    return (
      <>
        {header}
        <Panel>
          <ErrorState
            message={resource.error ?? 'No llegó la información del resumen.'}
            onRetry={resource.reload}
          />
        </Panel>
      </>
    );
  }

  const { kpis, stock, ordersByStatus } = data;
  // Sin una sola venta cobrada no hay nada que interpretar: los ceros de la
  // gráfica y de los rankings no dicen "va mal", dicen "todavía no empezó".
  const sinVentas = kpis.orders.value === 0;

  const alerts = sortAlerts(data.alerts);
  const porCobrar = ordersByStatus.PENDING ?? 0;
  const porPreparar = ordersByStatus.PAID ?? 0;
  const porEnviar = ordersByStatus.PREPARING ?? 0;
  const pendientes = porCobrar + porPreparar + porEnviar;

  const points = data.series.map((p: SeriesPoint) => ({
    label: p.label,
    value: p[measure],
    detail:
      measure === 'revenue' || measure === 'margin'
        ? `${p.orders.toLocaleString('es-CO')} pedidos · ${p.units.toLocaleString('es-CO')} unidades`
        : money(p.revenue),
  }));

  return (
    <>
      {header}

      <Refreshing active={resource.loading}>
        <div className="flex flex-col gap-4">
          {/* ------------------------------------------------------------- */}
          {/* 1. Lo que exige actuar hoy                                     */}
          {/* ------------------------------------------------------------- */}
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Panel
              title={alerts.length > 0 ? 'Hay que reponer' : 'Inventario al día'}
              description={
                alerts.length > 0
                  ? 'Productos agotados o por debajo de su mínimo. Es lo único que no puede esperar a mañana.'
                  : 'Ningún producto está agotado ni por debajo de su mínimo.'
              }
              actions={
                <Link
                  to="/admin/inventario"
                  className="inline-flex items-center gap-1 text-cap font-medium text-clay underline-offset-4 hover:underline"
                >
                  Ir a inventario <ArrowRight size={13} strokeWidth={2} aria-hidden />
                </Link>
              }
              bodyClassName="p-0"
            >
              {alerts.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={22} strokeWidth={1.5} className="text-ok" />}
                  title="Nada urgente por ahora"
                  description="Cuando un producto baje de su mínimo aparecerá aquí, con cuánto pedir."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {alerts.slice(0, 6).map((alert) => (
                    <li key={alert.productId}>
                      <Link
                        to="/admin/inventario"
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-sand"
                      >
                        <Thumb src={alert.image} alt={alert.name} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-body font-medium text-ink">{alert.name}</span>
                            <Badge tone={alert.severity === 'out' ? 'danger' : 'warn'}>
                              {alert.severity === 'out' ? 'Agotado' : 'Bajo'}
                            </Badge>
                          </span>
                          <span className="tnum mt-0.5 block text-cap text-mist">
                            {alert.sku} · quedan {alert.stock.toLocaleString('es-CO')} de{' '}
                            {alert.minStock.toLocaleString('es-CO')} mínimo · {daysLeftText(alert)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tnum block text-body font-semibold text-ink">
                            {alert.suggestedOrder.toLocaleString('es-CO')}
                          </span>
                          <span className="block text-cap text-mist">pedir</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {alerts.length > 6 && (
                <p className="border-t border-line px-4 py-2.5 text-cap text-mist">
                  Y {(alerts.length - 6).toLocaleString('es-CO')} referencias más en la lista de
                  inventario.
                </p>
              )}
            </Panel>

            <Panel
              title="Pedidos por atender"
              description="Lo que está esperando una acción tuya."
              actions={
                <Link
                  to="/admin/pedidos"
                  className="inline-flex items-center gap-1 text-cap font-medium text-clay underline-offset-4 hover:underline"
                >
                  Ver pedidos <ArrowRight size={13} strokeWidth={2} aria-hidden />
                </Link>
              }
              bodyClassName="p-0"
            >
              <ul className="divide-y divide-line">
                <QueueRow
                  icon={<CreditCard size={16} strokeWidth={2} aria-hidden />}
                  label="Por cobrar"
                  status="PENDING"
                  hint="Hechos, pero todavía sin pago"
                  count={porCobrar}
                />
                <QueueRow
                  icon={<PackageCheck size={16} strokeWidth={2} aria-hidden />}
                  label="Por preparar"
                  status="PAID"
                  hint="Ya pagados, falta armarlos"
                  count={porPreparar}
                />
                <QueueRow
                  icon={<Truck size={16} strokeWidth={2} aria-hidden />}
                  label="Por despachar"
                  status="PREPARING"
                  hint="Armados, falta entregarlos"
                  count={porEnviar}
                />
              </ul>
              <div className="border-t border-line px-4 py-3">
                <p className="text-cap text-mist">
                  {pendientes === 0
                    ? 'No hay nada pendiente: todos los pedidos están cerrados.'
                    : `${pendientes.toLocaleString('es-CO')} pedidos en total esperando.`}
                </p>
                {data.series.length > 1 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Sparkline values={data.series.map((p) => p.orders)} />
                    <span className="text-cap text-mist">Ritmo de pedidos del periodo</span>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* 2. Cómo va el negocio                                          */}
          {/* ------------------------------------------------------------- */}
          <div>
            <SectionTitle>Cómo van las ventas</SectionTitle>
            <p className="mt-0.5 text-body text-ash">
              Solo cuenta lo cobrado: los pedidos sin pagar y los anulados no suman.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard
                label="Ingresos"
                value={money(kpis.revenue.value)}
                delta={kpis.revenue.changePct}
                hint="ventas cobradas"
                icon={<ShoppingBag size={15} strokeWidth={1.75} aria-hidden />}
              />
              <StatCard
                label="Pedidos"
                value={kpis.orders.value.toLocaleString('es-CO')}
                delta={kpis.orders.changePct}
                hint="ventas cerradas"
                icon={<Package size={15} strokeWidth={1.75} aria-hidden />}
              />
              <StatCard
                label="Ticket promedio"
                value={money(kpis.avgTicket.value)}
                delta={kpis.avgTicket.changePct}
                hint="por pedido"
                icon={<CreditCard size={15} strokeWidth={1.75} aria-hidden />}
              />
              <StatCard
                label="Margen"
                value={money(kpis.margin.value)}
                delta={kpis.margin.changePct}
                hint="queda tras el costo"
                icon={<Boxes size={15} strokeWidth={1.75} aria-hidden />}
              />
            </div>

            {/* El porcentaje de cada tarjeta necesita saber contra qué compara.
                Se dice una vez aquí y no cuatro veces dentro de las tarjetas. */}
            <p className="mt-2 text-cap text-mist">
              El porcentaje compara con {RANGE_LABEL[data.range].toLowerCase()} anteriores a este
              periodo. Se vendieron {kpis.units.value.toLocaleString('es-CO')} unidades.
            </p>
          </div>

          <Panel
            title={`${measureDef.label} día a día`}
            description={measureDef.help}
            actions={
              <SegmentedControl<Measure>
                label="Qué medida se dibuja"
                value={measure}
                onChange={setMeasure}
                options={MEASURES.map((m) => ({ value: m.value, label: m.label }))}
              />
            }
          >
            {sinVentas ? (
              <EmptyState
                title="Todavía no hay ventas en este periodo"
                description="El catálogo y el inventario ya están cargados; lo que falta es el primer pedido cobrado. Prueba con un periodo más largo o registra una venta de mostrador."
                action={
                  <Link
                    to="/admin/pedidos"
                    className="inline-flex items-center gap-1 text-body font-medium text-clay underline-offset-4 hover:underline"
                  >
                    Registrar una venta <ArrowRight size={14} strokeWidth={2} aria-hidden />
                  </Link>
                }
              />
            ) : (
              <TimeSeriesChart
                points={points}
                format={measureDef.format}
                valueLabel={measureDef.label}
              />
            )}
          </Panel>

          {/* ------------------------------------------------------------- */}
          {/* 3. El detalle que explica lo anterior                          */}
          {/* ------------------------------------------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Lo que más se vendió"
              description="Ordenado por ingresos. A la izquierda de la cifra, las unidades que salieron."
            >
              <BarList
                items={data.topProducts.map((p) => ({
                  id: p.id,
                  label: p.name,
                  value: p.revenue,
                  meta: `${p.units.toLocaleString('es-CO')} u.`,
                }))}
                emptyLabel="Sin ventas en este periodo"
              />
            </Panel>

            <Panel
              title="Categorías con más movimiento"
              description="Dónde se está concentrando la venta."
            >
              <BarList
                items={data.topCategories.map((c) => ({
                  id: c.id,
                  label: c.name,
                  value: c.revenue,
                  meta: `${c.units.toLocaleString('es-CO')} u.`,
                }))}
                emptyLabel="Sin ventas en este periodo"
              />
            </Panel>
          </div>

          <Panel
            title="Cómo está el inventario"
            description="Foto de hoy, no del periodo: estas cifras no cambian al mover el selector de arriba."
            actions={
              <Link
                to="/admin/productos"
                className="inline-flex items-center gap-1 text-cap font-medium text-clay underline-offset-4 hover:underline"
              >
                Ver productos <ArrowRight size={13} strokeWidth={2} aria-hidden />
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">
              <Fact
                label="Productos"
                value={stock.products.toLocaleString('es-CO')}
                hint="Referencias activas en el catálogo"
              />
              <Fact
                label="Unidades"
                value={stock.unitsInStock.toLocaleString('es-CO')}
                hint="Lo que hay físicamente en bodega"
              />
              <Fact
                label="Valor a precio de venta"
                value={money(stock.stockValue)}
                hint="Lo que entraría si se vendiera todo"
              />
              <Fact
                label="Valor a costo"
                value={money(stock.stockCost)}
                hint="La plata que está quieta en mercancía"
              />
              <Fact
                label="Bajos"
                value={stock.lowStock.toLocaleString('es-CO')}
                hint="Por debajo de su mínimo"
                tone={stock.lowStock > 0 ? 'warn' : 'ink'}
              />
              <Fact
                label="Agotados"
                value={stock.outOfStock.toLocaleString('es-CO')}
                hint="En cero: no se pueden vender"
                tone={stock.outOfStock > 0 ? 'danger' : 'ink'}
              />
              <Fact
                label="Parados"
                value={stock.deadStock.toLocaleString('es-CO')}
                hint="Sin una sola venta en 60 días"
                tone={stock.deadStock > 0 ? 'warn' : 'ink'}
              />
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Pedidos por estado"
              description="Todos los del periodo, incluidos los anulados y devueltos."
            >
              <DistributionBar
                segments={ORDER_FLOW.map((status) => ({
                  id: status,
                  label: ORDER_STATUS_LABEL[status],
                  value: ordersByStatus[status] ?? 0,
                  className: STATUS_FILL[status],
                }))}
              />
            </Panel>

            <Panel
              title="Por dónde llegan las ventas"
              description="Número de pedidos por canal."
            >
              <DistributionBar
                segments={data.channels.map((c) => ({
                  id: c.channel,
                  label: `${CHANNEL_LABEL[c.channel]} · ${money(c.revenue)}`,
                  value: c.orders,
                  className: CHANNEL_FILL[c.channel] ?? 'bg-mist',
                }))}
              />
            </Panel>
          </div>

          <Panel
            title="Últimos pedidos"
            actions={
              <Link
                to="/admin/pedidos"
                className="inline-flex items-center gap-1 text-cap font-medium text-clay underline-offset-4 hover:underline"
              >
                Ver todos <ArrowRight size={13} strokeWidth={2} aria-hidden />
              </Link>
            }
            bodyClassName="p-0"
          >
            {data.recentOrders.length === 0 ? (
              <EmptyState
                title="Ningún pedido todavía"
                description="Los pedidos de la tienda y los de mostrador aparecen aquí apenas se registran."
              />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Pedido</Th>
                    <Th>Cliente</Th>
                    <Th align="right">Artículos</Th>
                    <Th>Fecha</Th>
                    <Th>Estado</Th>
                    <Th align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.slice(0, 6).map((order) => (
                    <tr key={order.id}>
                      <Td>
                        <Link
                          to="/admin/pedidos"
                          className="tnum font-medium text-ink underline-offset-4 hover:text-clay hover:underline"
                        >
                          {order.number}
                        </Link>
                      </Td>
                      <Td className="max-w-[220px] truncate">{order.customerName}</Td>
                      <Td align="right">{order.items.toLocaleString('es-CO')}</Td>
                      <Td className="whitespace-nowrap text-ash">{formatDateTime(order.createdAt)}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[order.status]}>
                          {ORDER_STATUS_LABEL[order.status]}
                        </Badge>
                      </Td>
                      <Td align="right" className="font-medium">
                        {money(order.total)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>

          <Panel
            title="Últimos movimientos de inventario"
            description="Toda entrada y salida queda registrada: el stock nunca cambia solo."
            actions={
              <Link
                to="/admin/inventario"
                className="inline-flex items-center gap-1 text-cap font-medium text-clay underline-offset-4 hover:underline"
              >
                Ver todos <ArrowRight size={13} strokeWidth={2} aria-hidden />
              </Link>
            }
            bodyClassName="p-0"
          >
            {data.recentMovements.length === 0 ? (
              <EmptyState
                title="Sin movimientos registrados"
                description="Aquí se verán las compras a proveedor, las ventas y los ajustes de conteo."
              />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Producto</Th>
                    <Th>Tipo</Th>
                    <Th align="right">Cantidad</Th>
                    <Th align="right">Quedaron</Th>
                    <Th>Quién</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentMovements.slice(0, 6).map((movement) => (
                    <tr key={movement.id}>
                      <Td className="whitespace-nowrap text-ash">
                        {formatDateTime(movement.createdAt)}
                      </Td>
                      <Td className="max-w-[260px]">
                        <span className="block truncate text-ink">{movement.productName}</span>
                        <span className="tnum block text-cap text-mist">{movement.sku}</span>
                      </Td>
                      <Td>
                        <Badge tone={movement.quantity < 0 ? 'neutral' : 'ok'}>
                          {MOVEMENT_LABEL[movement.type]}
                        </Badge>
                      </Td>
                      {/* El signo ya distingue entrada de salida; el color solo
                          refuerza lo que suma. Una venta no es un error. */}
                      <Td
                        align="right"
                        className={movement.quantity > 0 ? 'font-medium text-ok' : 'font-medium'}
                      >
                        {movement.quantity > 0 ? '+' : ''}
                        {movement.quantity.toLocaleString('es-CO')}
                      </Td>
                      <Td align="right">{movement.stockAfter.toLocaleString('es-CO')}</Td>
                      <Td className="text-ash">{movement.userName ?? 'Automático'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>

          <Panel
            title="Cómo van las promociones"
            description="Cuánta gente vio el anuncio, cuánta hizo clic y cuánto se vendió con la promoción puesta."
            actions={
              <Link
                to="/admin/promociones"
                className="inline-flex items-center gap-1 text-cap font-medium text-clay underline-offset-4 hover:underline"
              >
                Ver promociones <ArrowRight size={13} strokeWidth={2} aria-hidden />
              </Link>
            }
            bodyClassName="p-0"
          >
            {data.promotions.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle size={22} strokeWidth={1.5} className="text-mist" />}
                title="No hay promociones creadas"
                description="Una promoción con anuncio en la portada es la forma más rápida de mover una categoría entera."
              />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Promoción</Th>
                    <Th align="right">Vistas</Th>
                    <Th align="right">Clics</Th>
                    <Th align="right">De cada 100, hicieron clic</Th>
                    <Th align="right">Pedidos</Th>
                    <Th align="right">Ingresos</Th>
                    <Th align="right">Descuento dado</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.promotions.map((promo) => (
                    <tr key={promo.id}>
                      <Td>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-ink">{promo.name}</span>
                          <Badge tone={promo.active ? 'ok' : 'neutral'}>
                            {promo.active ? 'Activa' : 'Apagada'}
                          </Badge>
                        </span>
                      </Td>
                      <Td align="right">{promo.popupViews.toLocaleString('es-CO')}</Td>
                      <Td align="right">{promo.popupClicks.toLocaleString('es-CO')}</Td>
                      <Td align="right">
                        {promo.popupViews === 0
                          ? '—'
                          : `${promo.ctr.toLocaleString('es-CO')} %`}
                      </Td>
                      <Td align="right">{promo.orders.toLocaleString('es-CO')}</Td>
                      <Td align="right" className="font-medium">
                        {money(promo.revenue)}
                      </Td>
                      <Td align="right" className="text-ash">
                        {money(promo.discount)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>
        </div>
      </Refreshing>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fila de cola de trabajo
// ---------------------------------------------------------------------------

function QueueRow({
  icon,
  label,
  hint,
  count,
  status,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  count: number;
  /**
   * La cola abre Pedidos YA filtrada por ese estado. Señalar un número y
   * llevar a la lista entera obligaría a volver a buscar a mano justo lo que
   * se acaba de señalar.
   */
  status: OrderStatus;
}) {
  return (
    <li>
      <Link
        to={`/admin/pedidos?estado=${status}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sand"
      >
        <span className={count > 0 ? 'text-clay' : 'text-mist'}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium text-ink">{label}</span>
          <span className="block text-cap text-mist">{hint}</span>
        </span>
        <span
          className={`tnum display text-h5 leading-none ${count > 0 ? 'text-ink' : 'text-mist'}`}
        >
          {count.toLocaleString('es-CO')}
        </span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Esqueleto
// ---------------------------------------------------------------------------

/**
 * Solo en la primera carga. Al cambiar de rango se mantiene lo ya pintado con
 * el velo de `Refreshing`: saltar a esqueleto haría parpadear la pantalla
 * entera por un cambio de un solo número.
 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-40" />
      <span className="sr-only" role="status">
        Cargando el resumen…
      </span>
    </div>
  );
}
