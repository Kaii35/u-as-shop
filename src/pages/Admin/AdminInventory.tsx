import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  ListChecks,
  PackageCheck,
  PackagePlus,
  PackageX,
  RotateCw,
  TrendingDown,
  Truck,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import type { Movement, MovementType, Paged, StockAlert } from '../../lib/admin-types';
import { MOVEMENT_LABEL } from '../../lib/admin-types';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
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
} from '../../components/admin/Primitives';
import {
  BulkCountModal,
  CountModal,
  MovementBadge,
  MovementModal,
  ProductPicker,
  SignedQuantity,
  UnitCost,
  type MovementSeed,
  type PickedProduct,
} from './InventoryForms';

/**
 * Inventario.
 *
 * La regla del proyecto es que el stock no se escribe a mano: entra y sale
 * como movimiento. Esta pantalla es la cara de esa regla, y por eso está
 * ordenada como el problema: arriba lo que falta (y el botón que lo resuelve),
 * en medio cómo se registra lo que pasa, y abajo la historia que explica, fila
 * a fila, cómo se llegó al número de hoy.
 */

type Severity = 'all' | 'low' | 'out';

const SEVERITY_OPTIONS: ReadonlyArray<{ value: Severity; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'out', label: 'Agotadas' },
  { value: 'low', label: 'Bajo mínimo' },
];

/** Tipos del historial: aquí sí salen `SALE` e `INITIAL`, porque existen. */
const FILTER_TYPES: readonly MovementType[] = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'ADJUSTMENT',
  'INITIAL',
];

const PAGE_SIZE = 25;

/**
 * El servidor compara fechas en UTC y el campo `date` del navegador da el día
 * local. Sin convertir, un movimiento de las 8 de la noche en Colombia caería
 * fuera del "hasta hoy" y parecería no existir.
 */
const dayStart = (value: string): string | undefined =>
  value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
const dayEnd = (value: string): string | undefined =>
  value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;

export default function AdminInventory() {
  // --- Alertas ---
  const [severity, setSeverity] = useState<Severity>('all');
  const alerts = useResource<{ items: StockAlert[] }>(
    (signal) => api.get<{ items: StockAlert[] }>('/api/admin/inventory/alerts', { severity }, signal),
    [severity],
  );

  /**
   * El resumen cuenta SIEMPRE el total, aunque la lista esté filtrada.
   *
   * Si al mirar solo las agotadas el contador de "bajo mínimo" cayera a cero,
   * parecería que ese problema se resolvió solo. Se guarda la foto completa de
   * la última carga sin filtro, que es la que abre la pantalla.
   */
  const [totals, setTotals] = useState({ out: 0, low: 0, units: 0 });
  useEffect(() => {
    const items = alerts.data?.items;
    if (severity !== 'all' || !items) return;
    setTotals({
      out: items.filter((a) => a.severity === 'out').length,
      low: items.filter((a) => a.severity === 'low').length,
      units: items.reduce((sum, a) => sum + a.suggestedOrder, 0),
    });
  }, [severity, alerts.data]);

  // --- Historial ---
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [type, setType] = useState<MovementType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const productId = product?.id;
  const movements = useResource<Paged<Movement>>(
    (signal) =>
      api.get<Paged<Movement>>(
        '/api/admin/inventory/movements',
        { productId, type, from: dayStart(from), to: dayEnd(to), page, limit: PAGE_SIZE },
        signal,
      ),
    [productId, type, from, to, page],
  );

  const filtered = Boolean(productId || type || from || to);

  // --- Formularios ---
  const [entry, setEntry] = useState<MovementSeed | null>(null);
  const [count, setCount] = useState<{ seed: PickedProduct | null } | null>(null);
  const [bulk, setBulk] = useState(false);

  const refreshAll = (): void => {
    alerts.reload();
    movements.reload();
  };

  /**
   * Atajo desde una alerta: el formulario abre con el producto y la cantidad
   * puestos. Es el motivo de ser de la pantalla — ver el problema y resolverlo
   * sin volver a buscar la referencia a mano.
   */
  const restock = (alert: StockAlert): void => {
    setEntry({
      product: {
        id: alert.productId,
        sku: alert.sku,
        name: alert.name,
        stock: alert.stock,
      },
      type: 'PURCHASE',
      // Si el ritmo de venta no pide nada, al menos hay que volver al mínimo:
      // la referencia está en alerta por algo.
      quantity: String(Math.max(alert.suggestedOrder, alert.minStock - alert.stock, 1)),
    });
  };

  const items = alerts.data?.items ?? [];
  const rows = movements.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle="El stock no se escribe a mano: cada unidad entra o sale con un motivo."
        actions={
          <>
            <Button size="sm" onClick={() => setEntry({ product: null, type: 'PURCHASE', quantity: '' })}>
              <PackagePlus size={15} strokeWidth={2} />
              Entrada de mercancía
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCount({ seed: null })}>
              <ClipboardCheck size={15} strokeWidth={2} />
              Conteo físico
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setBulk(true)}>
              <ListChecks size={15} strokeWidth={2} />
              Conteo de bodega
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Actualizar alertas e historial"
              title="Actualizar"
              onClick={refreshAll}
            >
              <RotateCw size={15} strokeWidth={2} />
            </Button>
          </>
        }
      />

      {/* 1 · Reposición. Lo urgente, arriba del todo. */}
      <div className="mb-3 grid gap-2.5 sm:grid-cols-3">
        <StatCard
          label="Agotadas"
          value={totals.out.toLocaleString('es-CO')}
          hint="sin una sola unidad"
          icon={<PackageX size={15} strokeWidth={2} />}
        />
        <StatCard
          label="Bajo mínimo"
          value={totals.low.toLocaleString('es-CO')}
          hint="alcanzan para pocos días"
          icon={<TrendingDown size={15} strokeWidth={2} />}
        />
        <StatCard
          label="Por pedir"
          value={`${totals.units.toLocaleString('es-CO')} u.`}
          hint="suma de lo sugerido"
          icon={<Truck size={15} strokeWidth={2} />}
        />
      </div>

      <Panel
        className="mb-4"
        title="Hay que reponer"
        description="Referencias en su mínimo o por debajo. Lo agotado va primero: es venta que se pierde hoy."
        actions={
          <SegmentedControl
            label="Filtrar alertas por gravedad"
            value={severity}
            options={SEVERITY_OPTIONS}
            onChange={(value) => setSeverity(value)}
          />
        }
        bodyClassName="p-3"
      >
        {alerts.first ? (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : alerts.error ? (
          <ErrorState message={alerts.error} onRetry={alerts.reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<PackageCheck size={22} strokeWidth={1.5} />}
            title={
              severity === 'out'
                ? 'Ninguna referencia agotada'
                : severity === 'low'
                  ? 'Ninguna referencia por debajo del mínimo'
                  : 'No hay nada que reponer'
            }
            description="Todo lo que está a la venta tiene existencias por encima de su mínimo. Cuando alguna baje, aparecerá aquí de primera."
          />
        ) : (
          <Refreshing active={alerts.loading}>
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {items.map((alert) => (
                <AlertCard key={alert.productId} alert={alert} onRestock={restock} />
              ))}
            </div>
          </Refreshing>
        )}
      </Panel>

      {/* 3 · Historial. El registro que explica el stock de hoy. */}
      <Panel
        title="Historial de movimientos"
        description="Todo lo que entró y salió, con su motivo y quién lo registró."
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
          <div className="min-w-[200px] flex-1">
            <ProductPicker
              selected={product}
              onSelect={(value) => {
                setProduct(value);
                setPage(1);
              }}
              label="Producto"
              placeholder="Todos los productos"
            />
          </div>
          <Select
            label="Tipo"
            value={type}
            onChange={(e) => {
              setType(e.target.value as MovementType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {FILTER_TYPES.map((value) => (
              <option key={value} value={value}>
                {MOVEMENT_LABEL[value]}
              </option>
            ))}
          </Select>
          <Input
            label="Desde"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            inputClassName="tnum"
          />
          <Input
            label="Hasta"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            inputClassName="tnum"
          />
          {filtered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setProduct(null);
                setType('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              Quitar filtros
            </Button>
          )}
        </div>

        {movements.first ? (
          <div className="flex flex-col gap-2 p-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : movements.error ? (
          <ErrorState message={movements.error} onRetry={movements.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'Nada con esos filtros' : 'Todavía no hay movimientos'}
            description={
              filtered
                ? 'Prueba con un rango de fechas más amplio, otro tipo de movimiento o quita el producto.'
                : 'En cuanto registres una entrada o se pague un pedido, la primera línea aparecerá aquí.'
            }
          />
        ) : (
          <Refreshing active={movements.loading}>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Producto</Th>
                  <Th align="right">Cantidad</Th>
                  <Th align="right">Quedaron</Th>
                  <Th align="right">Costo</Th>
                  <Th>Motivo</Th>
                  <Th>Quién</Th>
                  <Th>Pedido</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((movement) => (
                  <tr key={movement.id}>
                    <Td className="whitespace-nowrap">
                      <span className="tnum" title={formatDate(movement.createdAt)}>
                        {formatDateTime(movement.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <MovementBadge type={movement.type} quantity={movement.quantity} />
                    </Td>
                    <Td>
                      <span className="block max-w-[220px] truncate font-medium">
                        {movement.productName}
                      </span>
                      <span className="tnum block text-cap text-mist">{movement.sku}</span>
                    </Td>
                    <Td align="right">
                      <SignedQuantity quantity={movement.quantity} />
                    </Td>
                    <Td align="right">{movement.stockAfter.toLocaleString('es-CO')}</Td>
                    <Td align="right">
                      <UnitCost value={movement.unitCost} />
                    </Td>
                    <Td>
                      {movement.reason ? (
                        <span className="block max-w-[260px] truncate text-ash" title={movement.reason}>
                          {movement.reason}
                        </span>
                      ) : (
                        <span className="text-mist">—</span>
                      )}
                    </Td>
                    <Td>
                      {movement.userName ?? <span className="text-mist">el sistema</span>}
                    </Td>
                    <Td>
                      {movement.orderNumber ? (
                        <span className="tnum">{movement.orderNumber}</span>
                      ) : (
                        <span className="text-mist">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={movements.data?.page ?? 1}
              totalPages={movements.data?.totalPages ?? 1}
              total={movements.data?.total ?? 0}
              onPage={setPage}
            />
          </Refreshing>
        )}
      </Panel>

      {/* 2 · Los formularios. Van en diálogo, no en panel fijo: ver el problema
          es lo primero y un formulario siempre abierto empujaría las alertas
          fuera de la pantalla en el móvil, que es donde se revisa la bodega. */}
      {entry && (
        <MovementModal seed={entry} onClose={() => setEntry(null)} onSaved={refreshAll} />
      )}
      {count && (
        <CountModal seed={count.seed} onClose={() => setCount(null)} onSaved={refreshAll} />
      )}
      {bulk && <BulkCountModal onClose={() => setBulk(false)} onSaved={refreshAll} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de alerta
// ---------------------------------------------------------------------------

/**
 * Cuánto dura lo que queda.
 *
 * Sin ventas no hay ritmo que proyectar, y se dice con esas palabras. Un ∞ o
 * un 999 serían una cifra inventada, y quien la lea pedirá mercancía que no
 * rota; un guion tampoco vale, porque no explica nada.
 */
function daysLeftText(alert: StockAlert): string {
  if (alert.daysLeft === null) return 'sin ventas recientes';
  if (alert.severity === 'out') return 'se acabó';
  if (alert.daysLeft === 0) return 'menos de un día';
  return alert.daysLeft === 1 ? '1 día' : `${alert.daysLeft.toLocaleString('es-CO')} días`;
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label-xs">{label}</dt>
      <dd className={cn('tnum truncate text-body font-medium', danger ? 'text-danger' : 'text-ink')}>
        {value}
      </dd>
    </div>
  );
}

function AlertCard({
  alert,
  onRestock,
}: {
  alert: StockAlert;
  onRestock: (alert: StockAlert) => void;
}) {
  const out = alert.severity === 'out';
  const pace = useMemo(
    () => (alert.dailySales === 0 ? 'ninguna' : `${alert.dailySales.toLocaleString('es-CO')} al día`),
    [alert.dailySales],
  );

  return (
    <article className={cn('flex flex-col gap-2 rounded border p-3', out ? 'border-danger' : 'border-line')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-body font-medium text-ink">{alert.name}</h3>
          <p className="tnum text-cap text-mist">{alert.sku}</p>
        </div>
        <Badge tone={out ? 'danger' : 'warn'}>{out ? 'Agotada' : 'Bajo mínimo'}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-2">
        <Fact label="En bodega" value={alert.stock.toLocaleString('es-CO')} danger={out} />
        <Fact label="Mínimo" value={alert.minStock.toLocaleString('es-CO')} />
        <Fact label="Se venden" value={pace} />
        <Fact label="Alcanza para" value={daysLeftText(alert)} />
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <p className="text-cap text-ash">
          {alert.suggestedOrder > 0 ? (
            <>
              Pedir{' '}
              <strong className="tnum text-body font-semibold text-ink">
                {alert.suggestedOrder.toLocaleString('es-CO')}
              </strong>{' '}
              para cubrir 30 días
            </>
          ) : (
            'Con volver al mínimo basta'
          )}
        </p>
        <Button size="sm" variant="secondary" onClick={() => onRestock(alert)}>
          <PackagePlus size={14} strokeWidth={2} />
          Registrar entrada
        </Button>
      </div>
    </article>
  );
}
