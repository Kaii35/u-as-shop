import type { ReactNode } from 'react';
import { Minus, Plus, Star } from 'lucide-react';
import { cn, formatCOP } from '../../lib/utils';

export type BadgeTone = 'sale' | 'new' | 'pro' | 'neutral' | 'light';

const tones: Record<BadgeTone, string> = {
  sale: 'bg-clay text-white',
  new: 'bg-ink text-white',
  pro: 'bg-clay-soft text-clay-dark',
  neutral: 'bg-sand text-ash',
  light: 'bg-white/95 text-ink',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-xs px-1.5 py-1 text-meta font-semibold uppercase leading-none tracking-[.06em]', tones[tone], className)}>
      {children}
    </span>
  );
}

export function RatingStars({ rating, size = 12, className }: { rating: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex gap-px text-clay', className)} aria-label={`${rating.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} strokeWidth={1.5} fill={i <= Math.round(rating) ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

/**
 * El precio vigente va en tinta y el tachado en gris; sólo cuando hay descuento
 * el vigente pasa a terracota, para que el acento signifique siempre "oferta".
 */
export function PriceDisplay({ price, oldPrice, from, size = 'md', className }: {
  price: number; oldPrice?: number; from?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const main = { sm: 'text-body', md: 'text-h5', lg: 'text-h3' }[size];
  const old = { sm: 'text-meta', md: 'text-cap', lg: 'text-lead' }[size];
  return (
    <span className={cn('flex flex-wrap items-baseline gap-2', className)}>
      <span className={cn('tnum font-display font-semibold leading-none', main, oldPrice ? 'text-clay' : 'text-ink')}>
        {from && <span className="text-cap font-medium text-mist">Desde </span>}
        {formatCOP(price)}
      </span>
      {oldPrice && <span className={cn('tnum text-mist line-through', old)}>{formatCOP(oldPrice)}</span>}
    </span>
  );
}

export function QuantitySelector({ value, onChange, min = 1, max = 99, size = 'md' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 'h-9' : 'h-11';
  const w = size === 'sm' ? 'w-9' : 'w-11';
  return (
    <div className={cn('inline-flex items-center rounded border border-line', h)}>
      <button
        type="button" aria-label="Disminuir" disabled={value <= min} onClick={() => onChange(value - 1)}
        className={cn('flex h-full items-center justify-center rounded-l text-ash transition-colors hover:bg-sand hover:text-ink disabled:pointer-events-none disabled:opacity-30', w)}
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      <span className="tnum min-w-[28px] text-center text-body font-medium" aria-live="polite">{value}</span>
      <button
        type="button" aria-label="Aumentar" disabled={value >= max} onClick={() => onChange(value + 1)}
        className={cn('flex h-full items-center justify-center rounded-r text-ash transition-colors hover:bg-sand hover:text-ink disabled:pointer-events-none disabled:opacity-30', w)}
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

/** Imagen con marcador de posición neutro mientras no hay foto. */
export function Img({ src, alt = '', label, className }: { src?: string; alt?: string; label?: string; className?: string }) {
  if (src) return <img src={src} alt={alt} loading="lazy" className={cn('h-full w-full object-cover', className)} />;
  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-sand p-3 text-center', className)}>
      {label && <span className="text-meta font-medium uppercase tracking-[.08em] text-mist">{label}</span>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action, className }: { eyebrow: string; title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 md:mb-7', className)}>
      <div className="flex max-w-xl flex-col gap-1.5">
        <span className="kicker">{eyebrow}</span>
        <h2 className="display text-h4 md:text-h3">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Logo({ size = 'md', light }: { size?: 'sm' | 'md' | 'lg'; light?: boolean }) {
  const t = { sm: 'text-h5', md: 'text-h4', lg: 'text-h3' }[size];
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn('display leading-none', t, light ? 'text-white' : 'text-ink')}>Aurelle</span>
      <span className={cn('text-meta font-semibold uppercase leading-none tracking-[.12em]', light ? 'text-white/60' : 'text-clay')}>Pro</span>
    </span>
  );
}

/** Franja de datos en fila, separada por puntos. Usada bajo títulos y en fichas. */
export function MetaRow({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-cap text-mist', className)}>
      {items.filter(Boolean).map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-line">·</span>}
          {it}
        </span>
      ))}
    </span>
  );
}
