import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Inbox, Loader2, Minus, Search, X } from 'lucide-react';
import { cn, formatCOP, useEscape, useLockBody } from '../../lib/utils';
import { Button } from '../ui/Button';

/**
 * Piezas compartidas del panel.
 *
 * El panel es más denso que la tienda —son tablas, no escaparate— pero usa el
 * mismo sistema: los mismos colores, la misma escala tipográfica y los mismos
 * radios. No hay ni un hex suelto aquí.
 */

// ---------------------------------------------------------------------------
// Estructura de página
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-h4 text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-body text-ash">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-body font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-cap text-mist">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName ?? 'p-4')}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'clay' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-sand text-ash',
  ok: 'bg-[#EAF2ED] text-ok',
  warn: 'bg-[#FBF1DF] text-warn',
  danger: 'bg-[#FBE9E7] text-danger',
  clay: 'bg-clay-soft text-clay-dark',
  info: 'bg-[#ECEFF3] text-ash',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-meta font-semibold uppercase tracking-[.05em]',
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Variación contra el periodo anterior.
 *
 * `null` significa que el periodo anterior fue cero. Se dice con palabras
 * ("sin dato previo") en vez de pintar un +100 % que haría creer a la dueña
 * que duplicó algo cuando en realidad partió de nada.
 */
export function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) {
    return <span className="text-cap text-mist">sin dato previo</span>;
  }
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-cap text-mist">
        <Minus size={12} strokeWidth={2.5} /> igual
      </span>
    );
  }
  const up = value > 0;
  // En casi todo subir es bueno; en devoluciones o costos es al revés, y por
  // eso el color lo decide `inverse` y no el signo.
  const good = inverse ? !up : up;
  return (
    <span
      className={cn(
        'tnum inline-flex items-center gap-0.5 text-cap font-medium',
        good ? 'text-ok' : 'text-danger',
      )}
    >
      {up ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />}
      {Math.abs(value).toLocaleString('es-CO')} %
    </span>
  );
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon,
  inverse,
  active,
  onClick,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  icon?: ReactNode;
  inverse?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="label-xs">{label}</span>
        {icon && <span className="text-mist">{icon}</span>}
      </div>
      <p className="tnum display mt-1.5 text-h3 leading-none text-ink">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta !== undefined && <Delta value={delta} inverse={inverse} />}
        {hint && <span className="truncate text-cap text-mist">{hint}</span>}
      </div>
    </>
  );

  // Las tarjetas que filtran la gráfica son botones de verdad: si no, no se
  // puede llegar a ellas con el teclado ni se anuncian como accionables.
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'card cursor-pointer p-3.5 text-left transition-colors hover:border-ink',
          active && 'border-ink ring-1 ring-ink',
        )}
      >
        {body}
      </button>
    );
  }
  return <div className="card p-3.5">{body}</div>;
}

export const money = (n: number): string => formatCOP(n);

/**
 * Pesos abreviados para ejes y celdas estrechas: 1,2 M, 340 k.
 *
 * En un eje, "$1.240.000" repetido seis veces no cabe y obliga a rotar las
 * etiquetas, que es peor que perder precisión donde no hace falta.
 */
export function shortCOP(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000).toLocaleString('es-CO')} k`;
  return `$${Math.round(n)}`;
}

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('-mx-px overflow-x-auto', className)}>
      <table className="w-full min-w-[720px] border-collapse text-body">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
  className,
  sortable,
  active,
  dir,
  onSort,
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  sortable?: boolean;
  active?: boolean;
  dir?: 'asc' | 'desc';
  onSort?: () => void;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(
        'sticky top-0 z-10 border-b border-line bg-white px-3 py-2.5 text-meta font-semibold uppercase tracking-[.06em] text-mist',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-ink',
            active && 'text-ink',
          )}
        >
          {children}
          {active &&
            (dir === 'asc' ? (
              <ArrowUp size={11} strokeWidth={2.5} />
            ) : (
              <ArrowDown size={11} strokeWidth={2.5} />
            ))}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className,
  colSpan,
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-line px-3 py-2.5 align-middle text-ink',
        align === 'right' && 'tnum text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return <p className="px-4 py-3 text-cap text-mist">{total.toLocaleString('es-CO')} registros</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <p className="tnum text-cap text-mist">
        Página {page} de {totalPages} · {total.toLocaleString('es-CO')} registros
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <span className="text-mist">{icon ?? <Inbox size={22} strokeWidth={1.5} />}</span>
      <p className="text-body font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-body text-ash">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle size={22} strokeWidth={1.5} className="text-danger" />}
      title="No se pudo cargar"
      description={message}
      action={
        onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        )
      }
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-sand', className)} aria-hidden />;
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-body text-mist">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

/** Velo sobre datos ya pintados mientras se recargan: evita el salto a vacío. */
export function Refreshing({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className={cn('transition-opacity', active && 'pointer-events-none opacity-55')}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 rounded border border-line bg-white px-2.5 transition-colors focus-within:border-clay focus-within:ring-2 focus-within:ring-clay/25',
        className,
      )}
    >
      <Search size={14} strokeWidth={2} className="shrink-0 text-mist" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-mist"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          className="cursor-pointer text-mist transition-colors hover:text-ink"
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

/** Grupo de opciones excluyentes. Para rangos de fecha y filtros cortos. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'cursor-pointer whitespace-nowrap rounded-sm px-2.5 py-1 text-cap font-medium transition-colors',
            value === o.value ? 'bg-ink text-white' : 'text-ash hover:bg-sand hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEscape(open, onClose);
  useLockBody(open);
  const panelRef = useRef<HTMLDivElement>(null);

  // Al abrir, el foco entra al diálogo. Si no, el teclado seguiría en la
  // página de atrás y el tabulador recorrería la tabla que el velo tapa.
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [href]',
    );
    first?.focus();
  }, [open]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }[size];

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-ink/35 p-4 backdrop-blur-[2px] md:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative my-auto w-full animate-fade-up rounded-lg bg-white shadow-pop',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="display text-h5 text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-body text-ash">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1.5 -mt-1 cursor-pointer rounded p-1.5 text-mist transition-colors hover:bg-sand hover:text-ink"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-sand px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            loading={pending}
            onClick={onConfirm}
            className={danger ? 'bg-danger hover:bg-danger/85' : undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-body text-ash">{message}</p>
    </Modal>
  );
}

/** Mensaje de error de formulario, junto al botón que lo provocó. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-cap text-danger">
      <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0" />
      {message}
    </p>
  );
}
