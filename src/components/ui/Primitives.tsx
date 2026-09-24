import type { ReactNode } from 'react';
import { Minus, Plus, Star } from 'lucide-react';
import { cn, formatCOP } from '../../lib/utils';

export type BadgeTone = 'wine' | 'ink' | 'light' | 'blush';
const tones: Record<BadgeTone, string> = {
  wine: 'bg-wine text-ivory',
  ink: 'bg-ink text-ivory',
  light: 'bg-ivory text-wine',
  blush: 'bg-nude text-wine',
};

export function Badge({ tone = 'ink', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-[7px] text-[10px] font-medium uppercase leading-none tracking-[.16em]', tones[tone], className)}>
      {children}
    </span>
  );
}

export function RatingStars({ rating, size = 14, className }: { rating: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex gap-0.5 text-wine', className)} aria-label={`${rating.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} strokeWidth={1.3} fill={i <= Math.round(rating) ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

export function PriceDisplay({ price, oldPrice, from, size = 'md', className }: {
  price: number; oldPrice?: number; from?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const main = { sm: 'text-[15px]', md: 'text-[17px]', lg: 'text-[30px]' }[size];
  const old = { sm: 'text-xs', md: 'text-[13px]', lg: 'text-[17px]' }[size];
  return (
    <span className={cn('flex flex-wrap items-baseline gap-2', className)}>
      <span className={cn('font-medium leading-none text-wine', main)}>{from && 'Desde '}{formatCOP(price)}</span>
      {oldPrice && <span className={cn('text-muted line-through', old)}>{formatCOP(oldPrice)}</span>}
    </span>
  );
}

export function QuantitySelector({ value, onChange, min = 1, max = 99, size = 'md' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md';
}) {
  const h = size === 'sm' ? 'h-[38px]' : 'h-14';
  const w = size === 'sm' ? 'w-9' : 'w-12';
  return (
    <div className={cn('inline-flex items-center rounded-full border border-ink/20', h)}>
      <button type="button" aria-label="Disminuir" disabled={value <= min} onClick={() => onChange(value - 1)} className={cn('flex h-full items-center justify-center disabled:opacity-40', w)}>
        <Minus size={16} strokeWidth={1.5} />
      </button>
      <span className="min-w-[24px] text-center font-medium" aria-live="polite">{value}</span>
      <button type="button" aria-label="Aumentar" disabled={value >= max} onClick={() => onChange(value + 1)} className={cn('flex h-full items-center justify-center disabled:opacity-40', w)}>
        <Plus size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/** Imagen con placeholder elegante cuando aún no hay foto. */
export function Img({ src, alt = '', label, className }: { src?: string; alt?: string; label?: string; className?: string }) {
  if (src) return <img src={src} alt={alt} loading="lazy" className={cn('h-full w-full object-cover', className)} />;
  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br from-nude via-nude to-blush p-3 text-center', className)}>
      {label && <span className="text-[10px] font-medium uppercase tracking-[.2em] text-wine/70">{label}</span>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action, className }: { eyebrow: string; title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-7 flex flex-wrap items-end justify-between gap-6 md:mb-12', className)}>
      <div className="flex max-w-2xl flex-col gap-[18px]">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="h-display text-[clamp(38px,4.8vw,68px)]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Logo({ size = 'md', light }: { size?: 'sm' | 'md' | 'lg'; light?: boolean }) {
  const t = { sm: 'text-[27px]', md: 'text-[32px]', lg: 'text-[40px]' }[size];
  return (
    <span className="flex flex-col items-start gap-1">
      <span className={cn('font-display italic leading-none tracking-[-.01em]', t, light ? 'text-ivory' : 'text-ink')}>Aurelle</span>
      <span className={cn('text-[8.5px] font-medium uppercase leading-none tracking-[.46em]', light ? 'text-blush' : 'text-wine')}>Professional Beauty</span>
    </span>
  );
}
