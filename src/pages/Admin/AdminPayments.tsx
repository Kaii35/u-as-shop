import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CreditCard,
  Eye,
  FlaskConical,
  Hourglass,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  Badge,
  EmptyState,
  ErrorState,
  FormError,
  Modal,
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
  formatDateTime,
  money,
  type Tone,
} from '../../components/admin/Primitives';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useAction, useDebounced, useResource } from '../../lib/useResource';
import type { OrderStatus, Paged } from '../../lib/admin-types';

/**
 * Cobros.
 *
 * Esta pantalla existe para una sola conversación: una clienta escribe
 * diciendo que pagó y el pedido aparece sin pagar. Todo lo demás —fichas,
 * filtros, avisos— está al servicio de poder contestarle en un minuto, así
 * que la bitácora del cobro es lo único que no se resume ni se abrevia.
 */

// ---------------------------------------------------------------------------
// Formas de la API (sección 9.2 de docs/api.md)
// ---------------------------------------------------------------------------

type PaymentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'EXPIRED';
type PaymentProvider = 'MOCK' | 'WOMPI';
type PaymentEventSource = 'WEBHOOK' | 'POLL' | 'MANUAL';
type ReservationState = 'HELD' | 'CONSUMED' | 'RELEASED';

interface AdminPayment {
  id: string;
  reference: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  /** En pesos enteros: el servidor ya convirtió los centavos de la pasarela. */
  amount: number;
  currency: string;
  methodType: string | null;
  providerTransactionId: string | null;
  providerStatus: string | null;
  statusMessage: string | null;
  message: string;
  final: boolean;
  reservationState: ReservationState;
  order: { id: string; number: string; status: OrderStatus; customerName: string };
  expiresAt: string;
  approvedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

interface PaymentEvent {
  id: string;
  source: PaymentEventSource;
  status: PaymentStatus;
  checksumOk: boolean;
  applied: boolean;
  note: string | null;
  createdAt: string;
}

interface AdminPaymentDetail extends AdminPayment {
  checkoutUrl: string | null;
  customerEmail: string;
  events: PaymentEvent[];
}

interface PaymentListResponse extends Paged<AdminPayment> {
  totals: { approved: number; approvedAmount: number; pending: number; declined: number };
}

interface PaymentHealth {
  provider: PaymentProvider;
  configured: boolean;
  problems: string[];
  pendingOlderThan15m: number;
  /** Minutos tras los que un cobro pendiente se considera atascado. */
  staleAfterMinutes?: number;
  expiredNotReleased: number;
  /** Cobrados y sin pedido que despachar. Es el descuadre más caro. */
  approvedNotPaid: number;
}

// ---------------------------------------------------------------------------
// Vocabulario de tienda
// ---------------------------------------------------------------------------

/**
 * Los estados en las palabras de quien atiende.
 *
 * "DECLINED" no dice de quién fue la decisión; "Rechazado por el banco" sí, y
 * es justo lo que hay que responderle a la clienta para que no vuelva a
 * intentar con la misma tarjeta.
 */
const STATUS_LABEL: Readonly<Record<PaymentStatus, string>> = {
  PENDING: 'Esperando pago',
  APPROVED: 'Aprobado',
  DECLINED: 'Rechazado por el banco',
  VOIDED: 'Anulado',
  ERROR: 'Falló el cobro',
  EXPIRED: 'Se acabó el tiempo',
};

const STATUS_TONE: Readonly<Record<PaymentStatus, Tone>> = {
  PENDING: 'warn',
  APPROVED: 'ok',
  DECLINED: 'danger',
  VOIDED: 'neutral',
  ERROR: 'danger',
  EXPIRED: 'neutral',
};

const PROVIDER_LABEL: Readonly<Record<PaymentProvider, string>> = {
  MOCK: 'Simulada',
  WOMPI: 'Wompi',
};

const METHOD_LABEL: Readonly<Record<string, string>> = {
  CARD: 'Tarjeta',
  NEQUI: 'Nequi',
  PSE: 'PSE',
  BANCOLOMBIA_TRANSFER: 'Transferencia Bancolombia',
  BANCOLOMBIA_COLLECT: 'Corresponsal Bancolombia',
  DAVIPLATA: 'Daviplata',
  PCOL: 'Efectivo',
  BNPL: 'Pago diferido',
  UNKNOWN: 'Sin definir',
};

/**
 * El método lo dice la pasarela AL RESOLVER: mientras el cobro está abierto
 * no hay ninguno, y "—" es más honesto que inventar uno.
 */
const methodLabel = (method: string | null): string =>
  method ? (METHOD_LABEL[method] ?? method) : '—';

const SOURCE_LABEL: Readonly<Record<PaymentEventSource, string>> = {
  WEBHOOK: 'Aviso de la pasarela',
  POLL: 'Consulta nuestra',
  MANUAL: 'Forzado desde el panel',
};

/** Qué pasó con las unidades, sin nombrar la máquina de estados. */
const RESERVATION_LABEL: Readonly<Record<ReservationState, string>> = {
  HELD: 'Apartado para este pedido',
  CONSUMED: 'Salió de bodega',
  RELEASED: 'Devuelto a bodega',
};

const STATUSES: readonly PaymentStatus[] = [
  'PENDING',
  'APPROVED',
  'DECLINED',
  'VOIDED',
  'ERROR',
  'EXPIRED',
];

const PROVIDERS: readonly PaymentProvider[] = ['WOMPI', 'MOCK'];

const LIMIT = 25;

/**
 * Las fechas del filtro son días del calendario de quien mira, no instantes
 * UTC: «hasta el 24» tiene que incluir lo que se cobró a las 6 de la tarde.
 */
const dayStart = (value: string): string | undefined =>
  value ? new Date(`${value}T00:00:00`).toISOString() : undefined;

const dayEnd = (value: string): string | undefined =>
  value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('es-CO')} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Aviso de salud
// ---------------------------------------------------------------------------

/**
 * Banda de aviso.
 *
 * Va arriba del todo y no dentro de un panel plegable a propósito: los tres
 * casos que la disparan (sin credenciales, pasarela simulada, cobros vencidos
 * sin liberar) son silenciosos —la tienda se ve perfectamente sana— y el
 * único momento en que alguien se entera es si se lo dicen sin que pregunte.
 */
function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'danger' | 'warn';
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded border border-line border-l-2 bg-sand px-3.5 py-3',
        tone === 'danger' ? 'border-l-danger' : 'border-l-warn',
      )}
    >
      <span className={cn('mt-0.5 shrink-0', tone === 'danger' ? 'text-danger' : 'text-warn')}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-body font-semibold text-ink">{title}</p>
        <div className="mt-0.5 text-cap leading-relaxed text-ash">{children}</div>
      </div>
    </div>
  );
}

function HealthNotices({ health }: { health: PaymentHealth }) {
  const notices: ReactNode[] = [];

  /**
   * Va primero a propósito. Los otros avisos son molestias; este significa que
   * a alguien se le cobró y no hay pedido que entregarle, que es lo único de
   * esta pantalla que hay que resolver hoy mismo.
   */
  if (health.approvedNotPaid > 0) {
    notices.push(
      <Notice
        key="cobrado-sin-pedido"
        tone="danger"
        icon={<AlertTriangle size={17} strokeWidth={2} />}
        title={`${plural(
          health.approvedNotPaid,
          'cobro aprobado sin pedido que despachar',
          'cobros aprobados sin pedido que despachar',
        )}`}
      >
        Se recibió la plata pero el pedido quedó anulado, casi siempre porque el banco aprobó
        después de que se acabara el tiempo de espera. Ábrelo, revisa si hay existencias y
        decide: despacharlo creando el pedido a mano, o devolverle el dinero a la clienta.
        El sistema no lo resuelve solo porque volver a descontar unidades que quizá ya se
        vendieron es una decisión tuya.
      </Notice>,
    );
  }

  if (!health.configured) {
    notices.push(
      <Notice
        key="configured"
        tone="danger"
        icon={<ShieldAlert size={17} strokeWidth={2} />}
        title="La pasarela no está lista: nadie puede pagar"
      >
        {/* Se enseña el problema literal de la pasarela, no un "revisa la
            configuración": el texto ya viene diciendo qué credencial falta y
            resumirlo obligaría a abrir el servidor para saber cuál. */}
        <ul className="list-disc space-y-0.5 pl-4">
          {health.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </Notice>,
    );
  }

  if (health.provider === 'MOCK') {
    notices.push(
      <Notice
        key="mock"
        tone="warn"
        icon={<FlaskConical size={17} strokeWidth={2} />}
        title="Pasarela simulada: no se está cobrando de verdad"
      >
        Los cobros de esta lista se aprueban con un botón de prueba y no llega plata a ninguna
        cuenta. Sirve para ensayar el flujo; antes de vender hay que activar Wompi.
      </Notice>,
    );
  }

  if (health.expiredNotReleased > 0) {
    notices.push(
      <Notice
        key="expired"
        tone="danger"
        icon={<AlertTriangle size={17} strokeWidth={2} />}
        title={`${plural(health.expiredNotReleased, 'cobro vencido', 'cobros vencidos')} sigue${
          health.expiredNotReleased === 1 ? '' : 'n'
        } con producto apartado`}
      >
        Se acabó el tiempo para pagarlos, pero sus unidades siguen bloqueadas: nadie más puede
        comprarlas y nadie las va a comprar. Filtra por «Se acabó el tiempo» y vuelve a consultar
        cada uno a la pasarela para soltarlas.
      </Notice>,
    );
  }

  if (health.pendingOlderThan15m > 0) {
    notices.push(
      <Notice
        key="pending"
        tone="warn"
        icon={<Hourglass size={17} strokeWidth={2} />}
        title={`${plural(
          health.pendingOlderThan15m,
          'cobro lleva',
          'cobros llevan',
        )} más de 15 minutos sin resolverse`}
      >
        Un banco no tarda tanto. Suele ser que el aviso de la pasarela se perdió: ábrelos y usa
        «Volver a consultar a la pasarela».
      </Notice>,
    );
  }

  if (notices.length === 0) return null;
  return <div className="mb-4 flex flex-col gap-2">{notices}</div>;
}

// ---------------------------------------------------------------------------
// Ficha del cobro
// ---------------------------------------------------------------------------

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="label-xs">{label}</p>
      <div className="mt-0.5 break-words text-body text-ink">{children}</div>
    </div>
  );
}

/**
 * Un renglón de la bitácora.
 *
 * Los dos colores no son decoración. Rojo = alguien mandó un aviso con firma
 * inválida, que es exactamente la pinta de un intento de marcar como pagado
 * algo que nadie pagó. Gris = el aviso llegó bien pero no cambió nada, casi
 * siempre porque era repetido o venía desordenado; sin distinguirlo, una lista
 * de seis avisos parece seis cosas que pasaron cuando pasó una sola.
 */
function EventRow({ event }: { event: PaymentEvent }) {
  const invalid = !event.checksumOk;
  const ignored = event.checksumOk && !event.applied;

  return (
    <li
      className={cn(
        'border-l-2 py-2 pl-3',
        invalid ? 'border-l-danger' : ignored ? 'border-l-line' : 'border-l-ok',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone={invalid ? 'danger' : ignored ? 'neutral' : STATUS_TONE[event.status]}>
          {STATUS_LABEL[event.status]}
        </Badge>
        <span className={cn('text-cap', invalid ? 'text-danger' : ignored ? 'text-mist' : 'text-ash')}>
          {SOURCE_LABEL[event.source]}
        </span>
        <span className="tnum ml-auto text-cap text-mist">{formatDateTime(event.createdAt)}</span>
      </div>

      <p
        className={cn(
          'mt-1 text-cap font-medium',
          invalid ? 'text-danger' : ignored ? 'text-mist' : 'text-ok',
        )}
      >
        {invalid
          ? 'Firma inválida: este aviso no vino de la pasarela y no se aplicó.'
          : ignored
            ? 'Llegó bien, pero no cambió nada (repetido o fuera de orden).'
            : 'Se aplicó: este aviso movió el cobro.'}
      </p>

      {event.note && <p className="mt-0.5 text-cap leading-relaxed text-ash">{event.note}</p>}
    </li>
  );
}

function PaymentDetailModal({
  paymentId,
  onClose,
  onChanged,
}: {
  paymentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const detail = useResource<AdminPaymentDetail>(
    (signal) => api.get<AdminPaymentDetail>(`/api/admin/payments/${paymentId}`, undefined, signal),
    [paymentId],
  );

  const sync = useAction(async () => {
    await api.post<AdminPaymentDetail>(`/api/admin/payments/${paymentId}/sync`);
    // Se recargan los dos: la ficha para ver el evento recién nacido y el
    // listado porque el estado del cobro (y el del pedido) pudo cambiar.
    detail.reload();
    onChanged();
  });

  const payment = detail.data;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={payment ? `Cobro ${payment.reference}` : 'Cobro'}
      description={payment ? payment.message : undefined}
      footer={
        <>
          <FormError message={sync.error} />
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cerrar
          </Button>
          <Button size="sm" loading={sync.pending} disabled={!payment} onClick={() => void sync.run()}>
            <RefreshCw size={14} strokeWidth={2} />
            Volver a consultar a la pasarela
          </Button>
        </>
      }
    >
      {detail.first ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : detail.error ? (
        <ErrorState message={detail.error} onRetry={detail.reload} />
      ) : !payment ? null : (
        <Refreshing active={detail.loading}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
            <Fact label="Estado">
              <Badge tone={STATUS_TONE[payment.status]}>{STATUS_LABEL[payment.status]}</Badge>
            </Fact>
            <Fact label="Monto">
              <span className="tnum font-semibold">{money(payment.amount)}</span>
            </Fact>
            <Fact label="Método">{methodLabel(payment.methodType)}</Fact>

            <Fact label="Pedido">
              <Link
                to={`/admin/pedidos?estado=${payment.order.status}`}
                className="tnum font-semibold underline-offset-4 hover:underline"
              >
                {payment.order.number}
              </Link>
            </Fact>
            <Fact label="Clienta">{payment.order.customerName || '—'}</Fact>
            <Fact label="Correo">{payment.customerEmail || '—'}</Fact>

            <Fact label="Pasarela">{PROVIDER_LABEL[payment.provider]}</Fact>
            <Fact label="Se abrió">{formatDateTime(payment.createdAt)}</Fact>
            <Fact label={payment.status === 'APPROVED' ? 'Se aprobó' : 'Vence'}>
              {payment.approvedAt
                ? formatDateTime(payment.approvedAt)
                : formatDateTime(payment.expiresAt)}
            </Fact>

            <Fact label="Inventario">{RESERVATION_LABEL[payment.reservationState]}</Fact>
            <Fact label="Última consulta">
              {payment.lastSyncedAt ? formatDateTime(payment.lastSyncedAt) : 'Nunca'}
            </Fact>
            <Fact label="Respuesta de la pasarela">{payment.providerStatus ?? '—'}</Fact>
          </div>

          {/* El id de transacción es lo primero que pide soporte de la pasarela
              cuando hay que reclamar un cobro, así que va entero y en una
              línea propia donde se pueda copiar sin recortarlo. */}
          <div className="mt-4 rounded border border-line bg-sand px-3 py-2.5">
            <p className="label-xs">Id de transacción en la pasarela</p>
            <p className="tnum mt-0.5 select-all break-all text-body text-ink">
              {payment.providerTransactionId ?? 'Todavía no hay: la clienta no eligió medio de pago.'}
            </p>
          </div>

          {payment.statusMessage && (
            <p className="mt-2 text-cap leading-relaxed text-ash">
              Lo que dijo la pasarela: {payment.statusMessage}
            </p>
          )}

          <section className="mt-5">
            <h3 className="text-body font-semibold text-ink">Qué le pasó a este cobro</h3>
            <p className="mt-0.5 text-cap text-mist">
              Todos los avisos recibidos, del más reciente al más antiguo. Los que llegaron con
              firma inválida se guardan igual.
            </p>

            {payment.events.length === 0 ? (
              <p className="mt-3 text-cap text-mist">
                Ningún aviso todavía. Si el cobro lleva rato pendiente, vuelve a consultarlo a la
                pasarela.
              </p>
            ) : (
              <ul className="mt-2.5 flex flex-col gap-1">
                {payment.events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </section>
        </Refreshing>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function AdminPayments() {
  const [status, setStatus] = useState<PaymentStatus | 'all'>('all');
  const [provider, setProvider] = useState<PaymentProvider | 'all'>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search);
  const fromIso = dayStart(from);
  const toIso = dayEnd(to);

  const list = useResource<PaymentListResponse>(
    (signal) =>
      api.get<PaymentListResponse>(
        '/api/admin/payments',
        {
          status: status === 'all' ? undefined : status,
          provider: provider === 'all' ? undefined : provider,
          search: debouncedSearch.trim() || undefined,
          from: fromIso,
          to: toIso,
          page,
          limit: LIMIT,
        },
        signal,
      ),
    [status, provider, debouncedSearch, fromIso, toIso, page],
  );

  /**
   * La salud no depende de los filtros: un cobro vencido sin liberar sigue
   * bloqueando producto aunque quien mira esté buscando otra cosa.
   */
  const health = useResource<PaymentHealth>(
    (signal) => api.get<PaymentHealth>('/api/admin/payments/health', undefined, signal),
    [],
  );

  const reloadAll = () => {
    list.reload();
    health.reload();
  };

  const filtered =
    status !== 'all' || provider !== 'all' || search !== '' || from !== '' || to !== '';

  const clearFilters = () => {
    setStatus('all');
    setProvider('all');
    setSearch('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const data = list.data;
  const rows = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Cobros"
        subtitle="Qué se pagó, qué quedó a medias y qué dijo la pasarela."
        actions={
          <Button size="sm" variant="secondary" onClick={reloadAll}>
            <RefreshCw size={14} strokeWidth={2} />
            Actualizar
          </Button>
        }
      />

      {health.data && <HealthNotices health={health.data} />}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          label="Aprobados"
          value={data ? data.totals.approved.toLocaleString('es-CO') : '—'}
          hint="Todo el filtro, no la página"
        />
        <StatCard
          label="Plata cobrada"
          value={data ? money(data.totals.approvedAmount) : '—'}
          hint="Solo los aprobados"
          icon={<CreditCard size={15} strokeWidth={2} />}
        />
        <StatCard
          label="Esperando pago"
          value={data ? data.totals.pending.toLocaleString('es-CO') : '—'}
          hint="Sin resolver"
        />
        <StatCard
          label="Rechazados"
          value={data ? data.totals.declined.toLocaleString('es-CO') : '—'}
          hint="El banco dijo que no"
        />
      </div>

      <p className="mt-2 text-cap text-mist">
        Las cuatro fichas cuentan todos los estados del filtro, así que no cambian al elegir uno
        solo en la lista.
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
              placeholder="Referencia, pedido o correo…"
            />
          </div>

          <Select
            label="Estado"
            className="min-w-[160px]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PaymentStatus | 'all');
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>

          <Select
            label="Pasarela"
            className="min-w-[150px]"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as PaymentProvider | 'all');
              setPage(1);
            }}
          >
            <option value="all">Todas</option>
            {PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {PROVIDER_LABEL[value]}
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
            icon={<CreditCard size={22} strokeWidth={1.5} />}
            title={filtered ? 'Ningún cobro con estos filtros' : 'Todavía no hay cobros'}
            description={
              filtered
                ? 'Prueba a quitar el rango de fechas o a volver a «Todos» los estados.'
                : 'Aquí aparecerá cada intento de pago de la tienda en línea, aprobado o no.'
            }
            action={
              filtered ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Refreshing active={list.loading}>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Referencia</Th>
                  <Th>Pedido</Th>
                  <Th>Fecha</Th>
                  <Th>Método</Th>
                  <Th>Pasarela</Th>
                  <Th>Estado</Th>
                  <Th align="right">Monto</Th>
                  <Th align="right">Ver</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((payment) => (
                  <tr
                    key={payment.id}
                    onClick={() => setOpenId(payment.id)}
                    className="cursor-pointer transition-colors hover:bg-sand"
                  >
                    <Td>
                      {/* Botón de verdad para que la fila también se abra con
                          el teclado, no solo con el ratón. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(payment.id);
                        }}
                        className="tnum max-w-[180px] cursor-pointer truncate font-semibold text-ink underline-offset-4 hover:underline"
                      >
                        {payment.reference}
                      </button>
                      <p className="max-w-[180px] truncate text-cap text-mist">
                        {payment.order.customerName || 'Sin nombre'}
                      </p>
                    </Td>
                    <Td>
                      {/* Lleva a la cola en la que está ese pedido: es lo más
                          cerca que deja el listado de pedidos, que filtra por
                          estado y no por número. */}
                      <Link
                        to={`/admin/pedidos?estado=${payment.order.status}`}
                        onClick={(e) => e.stopPropagation()}
                        className="tnum text-ink underline-offset-4 hover:underline"
                      >
                        {payment.order.number}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-ash">{formatDate(payment.createdAt)}</Td>
                    <Td className="text-ash">{methodLabel(payment.methodType)}</Td>
                    <Td className="text-ash">{PROVIDER_LABEL[payment.provider]}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[payment.status]}>
                        {STATUS_LABEL[payment.status]}
                      </Badge>
                    </Td>
                    <Td align="right" className="font-medium">
                      {money(payment.amount)}
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(payment.id);
                        }}
                        aria-label={`Ver el cobro ${payment.reference}`}
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
        // La clave fuerza una ficha nueva por cobro: así la bitácora de uno no
        // se queda pintada mientras carga la del siguiente.
        <PaymentDetailModal
          key={openId}
          paymentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={reloadAll}
        />
      )}
    </>
  );
}
