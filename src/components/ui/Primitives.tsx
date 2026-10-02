import type { ReactNode } from 'react';
import { Minus, Plus, Star } from 'lucide-react';
import { cn, formatCOP } from '../../lib/utils';

export type BadgeTone = 'sale' | 'new' | 'pro' | 'neutral' | 'light';

// Ningún relleno del sistema conserva el blanco: `clay` sube de luminosidad en
// oscuro y el blanco encima se queda en 2,96:1. `on-accent` sirve para los
// cuatro rellenos de acento y estado; `on-ink` para `bg-ink`.
const tones: Record<BadgeTone, string> = {
  sale: 'bg-clay text-on-accent',
  new: 'bg-ink text-on-ink',
  pro: 'bg-clay-soft text-clay-dark',
  neutral: 'bg-sand text-ash',
  light: 'bg-surface/95 text-ink',
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

/**
 * Imagen con marcador de posición neutro mientras no hay foto.
 *
 * Decide sola si lleva `.photo`, el filtro que baja el brillo en oscuro. El
 * catálogo separa fotografía (raster: categorías, editorial, colecciones) de
 * packshot (vectorial, `/images/products/*.svg`), y al packshot el filtro solo
 * lo apagaría: es un dibujo, no una foto iluminada para fondo blanco. La regla
 * va por extensión y no por una marca en cada llamada para que acierte también
 * en las páginas que pasan la ruta directamente. `photo` la fuerza si falla.
 */
export function Img({ src, alt = '', label, className, photo }: {
  src?: string; alt?: string; label?: string; className?: string; photo?: boolean;
}) {
  const filtered = photo ?? !/\.svg(\?|$)/i.test(src ?? '');
  if (src) return <img src={src} alt={alt} loading="lazy" className={cn('h-full w-full object-cover', filtered && 'photo', className)} />;
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

/**
 * Logotipo de Natalia Sánchez.
 *
 * El dibujo es el vector original del estudio, extraído del archivo de
 * Illustrator del manual. No se reconstruye con tipografía: el nombre está en
 * contornos, así que sale exactamente como lo dibujaron —gota de esmalte en la
 * N incluida— y no depende de Lamoric Rowen, que es comercial y no viaja con
 * el proyecto.
 *
 * Tres encuadres, porque el del manual es apilado y eso no sirve en todas
 * partes. Medido sobre el propio archivo: el bloque apilado necesita 52 px de
 * alto para que "NATALIA SANCHEZ" se lea, y una cabecera no los tiene. Puestas
 * en fila, las mismas dos piezas dejan el nombre legible desde 28 px.
 *
 * Se monta como `mask-image` y no como `<img>` a propósito: una imagen trae su
 * color dentro y haría falta un archivo por tema. Con la máscara solo cuenta
 * la silueta y el color lo pone `bg-current`, así que el mismo archivo sirve en
 * vino sobre claro y en claro sobre vino, dos de las cuatro aplicaciones que
 * aprueba el manual.
 */
type LogoVariante = 'horizontal' | 'apilado' | 'monograma';

/** Relación de aspecto de cada archivo, tomada de su viewBox. */
const LOGO_ARCHIVO: Record<LogoVariante, { src: string; ratio: string }> = {
  horizontal: { src: '/logo-ns-horizontal.svg', ratio: 'aspect-[498/100]' },
  apilado: { src: '/logo-ns.svg', ratio: 'aspect-[140/100]' },
  monograma: { src: '/logo-ns-monograma.svg', ratio: 'aspect-[109/100]' },
};

/** El apilado arranca más alto: su nombre va debajo y necesita cuerpo. */
const LOGO_ALTO: Record<LogoVariante, Record<'sm' | 'md' | 'lg', string>> = {
  horizontal: { sm: 'h-6', md: 'h-8', lg: 'h-10' },
  apilado: { sm: 'h-12', md: 'h-14', lg: 'h-20' },
  monograma: { sm: 'h-7', md: 'h-9', lg: 'h-12' },
};

export function Logo({
  size = 'md',
  light,
  variante = 'horizontal',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  /** Va sobre la losa de contraste (el pie), no sobre una superficie normal. */
  light?: boolean;
  variante?: LogoVariante;
  className?: string;
}) {
  const { src, ratio } = LOGO_ARCHIVO[variante];

  return (
    <span
      role="img"
      aria-label="Natalia Sánchez"
      className={cn(
        'inline-block shrink-0 bg-current',
        LOGO_ALTO[variante][size],
        ratio,
        light ? 'text-on-slab' : 'text-clay',
        className,
      )}
      style={{
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
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
