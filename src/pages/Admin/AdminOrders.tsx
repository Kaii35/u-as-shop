import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Plus, ShoppingBag } from 'lucide-react';
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Panel,
  Refreshing,
  SearchInput,
  Skeleton,
  StatCard,
  TableWrap,
  Td,
  Th,
  formatDate,
  money,
} from '../../components/admin/Primitives';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { useDebounced, useResource } from '../../lib/useResource';
import {
  CHANNEL_LABEL,
  ORDER_STATUS_LABEL,
  type AdminOrderDetail,
  type OrderListResponse,
  type OrderStatus,
  type SalesChannel,
} from '../../lib/admin-types';
import { STATUS_TONE } from './orderTransitions';
import OrderDetailModal from './OrderDetailModal';
import CounterSaleModal from './CounterSaleModal';

/**
 * Pedidos.
 *
 * La pantalla se organiza alrededor de una pregunta: ¿qué hay que hacer hoy?
 * Por eso los atajos de estado van arriba y con su conteo, antes que los
 * filtros finos: cobrar, alistar y despachar están a un clic, y todo lo demás
 * es consulta.
 */

const LIMIT = 25;

/** Los tres momentos en que un pedido espera algo de la tienda, más el cierre. */
const SHORTCUTS: ReadonlyArray<{ status: OrderStatus; label: string; hint: string }> = [
  { status: 'PENDING', label: 'Pendientes de pago', hint: 'Falta cobrar' },
  { status: 'PAID', label: 'Por alistar', hint: 'Cobrados, sin empacar' },
  { status: 'PREPARING', label: 'Por despachar', hint: 'Empacados, sin salir' },
  { status: 'DELIVERED', label: 'Entregados', hint: 'Cerrados' },
];

const STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'PAID',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

const CHANNELS: readonly SalesChannel[] = ['ONLINE', 'COUNTER', 'SOCIAL'];

/**
 * Las fechas del filtro son días del calendario de quien mira, no instantes
 * UTC: «hasta el 24» tiene que incluir lo que se vendió a las 6 de la tarde.
 */
const dayStart = (value: string): string | undefined =>
  value ? new Date(`${value}T00:00:00`).toISOString() : undefined;

const dayEnd = (value: string): string | undefined =>
  value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;

/** Los estados que `?estado=` acepta. Cualquier otra cosa se ignora. */
const STATUS_VALUES = new Set<string>(Object.keys(ORDER_STATUS_LABEL));

const readStatus = (raw: string | null): OrderStatus | 'all' =>
  raw && STATUS_VALUES.has(raw) ? (raw as OrderStatus) : 'all';

export default function AdminOrders() {
  /**
   * El estado vive tambien en la URL (`?estado=PAID`).
   *
   * Es lo que hace que las colas del resumen ("6 por cobrar") lleguen aqui ya
   * filtradas: sin esto el enlace abria los mil seiscientos pedidos y habia
   * que volver a buscar a mano justo lo que se acababa de senalar.
   */
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<OrderStatus | 'all'>(() => readStatus(params.get('estado')));
  const [channel, setChannel] = useState<SalesChannel | 'all'>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [openId, setOpenId] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);

  // Ida: si se llega con otro `?estado=` sin remontar la pantalla (venir del
  // resumen estando ya aqui), el filtro tiene que seguirlo.
  const urlStatus = readStatus(params.get('estado'));
  useEffect(() => {
    setStatus(urlStatus);
    setPage(1);
  }, [urlStatus]);

  const debouncedSearch = useDebounced(search);
  const fromIso = dayStart(from);
  const toIso = dayEnd(to);

  const base = {
    channel: channel === 'all' ? undefined : channel,
    search: debouncedSearch.trim() || undefined,
    from: fromIso,
    to: toIso,
  };

  const list = useResource<OrderListResponse>(
    (signal) =>
      api.get<OrderListResponse>(
        '/api/admin/orders',
        {
          ...base,
          status: status === 'all' ? undefined : status,
          page,
          limit: LIMIT,
        },
        signal,
      ),
    [status, channel, debouncedSearch, fromIso, toIso, page],
  );

  /**
   * Conteo de cada atajo.
   *
   * El listado no devuelve el desglose por estado, así que se piden cuatro
   * totales con `limit=1`: es más barato que traer los pedidos y, sobre todo,
   * respeta los demás filtros, de modo que el número de la ficha y el de la
   * tabla siempre son el mismo número.
   */
  const counts = useResource<Partial<Record<OrderStatus, number>>>(
    async (signal) => {
      const entries = await Promise.all(
        SHORTCUTS.map(async (shortcut) => {
          const data = await api.get<OrderListResponse>(
            '/api/admin/orders',
            { ...base, status: shortcut.status, page: 1, limit: 1 },
            signal,
          );
          return [shortcut.status, data.total] as const;
        }),
      );
      return Object.fromEntries(entries) as Partial<Record<OrderStatus, number>>;
    },
    [channel, debouncedSearch, fromIso, toIso],
  );

  const reloadAll = () => {
    list.reload();
    counts.reload();
  };

  const filtered =
    status !== 'all' || channel !== 'all' || search !== '' || from !== '' || to !== '';

  const clearFilters = () => {
    pickStatus('all');
    setChannel('all');
    setSearch('');
    setFrom('');
    setTo('');
  };

  /**
   * Vuelta: el filtro elegido queda en la URL para poder compartir el enlace.
   * `replace` porque cambiar de cola no merece una entrada de historial propia
   * — con push, el boton Atras recorreria cola por cola antes de salir.
   */
  const pickStatus = (next: OrderStatus | 'all') => {
    setStatus(next);
    setPage(1);
    const nextParams = new URLSearchParams(params);
    if (next === 'all') nextParams.delete('estado');
    else nextParams.set('estado', next);
    setParams(nextParams, { replace: true });
  };

  const data = list.data;
  const rows = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle="Qué entró, qué falta cobrar y qué hay que sacar hoy."
        actions={
          <Button size="sm" onClick={() => setCounterOpen(true)}>
            <Plus size={15} strokeWidth={2} />
            Registrar venta de mostrador
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        {/* Los dos primeros son del filtro completo, no de la página: se dice
            en la etiqueta porque es la confusión más fácil de cometer. */}
        <StatCard
          label="Ingresos del filtro"
          value={data ? money(data.totals.revenue) : '—'}
          hint="Todo el filtro, no la página"
        />
        <StatCard
          label="Pedidos del filtro"
          value={data ? data.total.toLocaleString('es-CO') : '—'}
          hint="Todo el filtro, no la página"
        />
        {SHORTCUTS.map((shortcut) => (
          <StatCard
            key={shortcut.status}
            label={shortcut.label}
            value={
              counts.first ? '—' : (counts.data?.[shortcut.status] ?? 0).toLocaleString('es-CO')
            }
            hint={shortcut.hint}
            active={status === shortcut.status}
            onClick={() => pickStatus(status === shortcut.status ? 'all' : shortcut.status)}
          />
        ))}
      </div>

      <p className="mt-2 text-cap text-mist">
        En «Ingresos del filtro» solo suman los pedidos cobrados. Los pendientes, anulados y
        devueltos no entran: esa plata no llegó a la caja.
      </p>

      <Panel className="mt-4" bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-2.5 border-b border-line p-3">
          <div className="flex min-w-[190px] flex-1 flex-col gap-1.5">
            <span className="text-cap font-medium text-ash">Buscar</span>
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Número, nombre o correo…"
            />
          </div>

          <Select
            label="Estado"
            className="min-w-[160px]"
            value={status}
            onChange={(e) => pickStatus(e.target.value as OrderStatus | 'all')}
          >
            <option value="all">Todos</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABEL[value]}
              </option>
            ))}
          </Select>

          <Select
            label="Canal"
            className="min-w-[160px]"
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value as SalesChannel | 'all');
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            {CHANNELS.map((value) => (
              <option key={value} value={value}>
                {CHANNEL_LABEL[value]}
              </option>
            ))}
          </Select>

          <Input
            label="Desde"
            type="date"
            className="w-[150px]"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Hasta"
            type="date"
            className="w-[150px]"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />

          {filtered && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Limpiar
            </Button>
          )}
        </div>

        {list.first ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag size={22} strokeWidth={1.5} />}
            title={filtered ? 'Ningún pedido con estos filtros' : 'Todavía no hay pedidos'}
            description={
              filtered
                ? 'Prueba a quitar el rango de fechas o a volver a «Todos» los estados.'
                : 'Cuando entre el primero aparecerá aquí. Mientras tanto, puedes registrar lo que vendas en el local.'
            }
            action={
              filtered ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={() => setCounterOpen(true)}>
                  Registrar venta de mostrador
                </Button>
              )
            }
          />
        ) : (
          <Refreshing active={list.loading}>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Fecha</Th>
                  <Th>Clienta</Th>
                  <Th>Canal</Th>
                  <Th align="right">Unidades</Th>
                  <Th align="right">Total</Th>
                  <Th>Estado</Th>
                  <Th align="right">Ver</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setOpenId(order.id)}
                    className="cursor-pointer transition-colors hover:bg-sand"
                  >
                    <Td>
                      {/* Botón de verdad para que la fila también se abra con
                          el teclado, no solo con el ratón. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(order.id);
                        }}
                        className="tnum cursor-pointer font-semibold text-ink underline-offset-4 hover:underline"
                      >
                        {order.number}
                      </button>
                      {order.couponCode && (
                        <span className="ml-1.5 text-cap text-mist">{order.couponCode}</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-ash">{formatDate(order.createdAt)}</Td>
                    <Td>
                      <p className="max-w-[210px] truncate text-ink">{order.customerName}</p>
                      <p className="max-w-[210px] truncate text-cap text-mist">
                        {order.customerCity || 'Sin ciudad'}
                      </p>
                    </Td>
                    <Td className="text-ash">{CHANNEL_LABEL[order.channel]}</Td>
                    <Td align="right">{order.itemCount.toLocaleString('es-CO')}</Td>
                    <Td align="right" className="font-medium">
                      {money(order.total)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(order.id);
                        }}
                        aria-label={`Ver el pedido ${order.number}`}
                        className="cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-ink"
                      >
                        <Eye size={15} strokeWidth={2} />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            <Pagination
              page={data?.page ?? 1}
              totalPages={data?.totalPages ?? 1}
              total={data?.total ?? 0}
              onPage={setPage}
            />
          </Refreshing>
        )}
      </Panel>

      {openId && (
        // La clave fuerza una ficha nueva por pedido: así las notas y la
        // confirmación armada no se arrastran de un pedido al siguiente.
        <OrderDetailModal
          key={openId}
          orderId={openId}
          onClose={() => setOpenId(null)}
          onChanged={reloadAll}
        />
      )}

      {counterOpen && (
        <CounterSaleModal
          onClose={() => setCounterOpen(false)}
          onCreated={(order: AdminOrderDetail) => {
            setCounterOpen(false);
            reloadAll();
            // Se abre la ficha recién creada: es donde se ve el número del
            // pedido y las unidades que acaban de salir de bodega.
            setOpenId(order.id);
          }}
        />
      )}
    </>
  );
}
