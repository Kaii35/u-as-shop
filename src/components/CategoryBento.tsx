import { Link } from 'react-router-dom';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Category, Product } from '../types';

/**
 * Retícula de categorías tipo "bento": tarjetas de tamaños distintos, cada una
 * con un tinte de marca y tres productos reales de la categoría en abanico
 * (el mismo gesto del hero).
 *
 * Movimiento:
 *  - al entrar en pantalla, las tarjetas suben en cascada y el abanico se abre;
 *  - al pasar el cursor, el abanico se abre más y la tarjeta se eleva.
 * Con "reducir movimiento" todo aparece ya abierto y quieto.
 */

type Size = 'large' | 'wide' | 'sm';

/** Patrón de tamaños, en orden. Cuadra 11 categorías + la tarjeta final en 5 filas de 4. */
const PATTERN: Size[] = ['large', 'sm', 'sm', 'wide', 'sm', 'sm', 'wide', 'sm', 'wide', 'sm', 'wide'];

const SPAN: Record<Size, string> = {
  large: 'col-span-2 row-span-2',
  wide: 'col-span-2',
  sm: 'col-span-1',
};

/** Tintes que rotan entre tarjetas. Son tokens: cambian solos con el tema. */
const TONES = ['bg-clay-soft', 'bg-sand', 'bg-surface'];

/** Abanico: ángulo y desplazamiento de cada carta, cerrado → abierto → hover. */
const FAN = [
  { rotate: -14, x: -46, y: 6 },
  { rotate: 0, x: 0, y: -8 },
  { rotate: 14, x: 46, y: 6 },
];
const CARD_SIZE: Record<Size, string> = {
  large: 'h-[170px] w-[132px] md:h-[236px] md:w-[184px]',
  wide: 'h-[120px] w-[94px] md:h-[136px] md:w-[106px]',
  sm: 'h-[96px] w-[76px] md:h-[118px] md:w-[92px]',
};
const SPREAD: Record<Size, number> = { large: 1.7, wide: 1.1, sm: 0.85 };

const tile: Variants = {
  hidden: { opacity: 0, y: 36 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1], delay: i * 0.06 } }),
  hover: { y: -4, transition: { duration: 0.3 } },
};

const card = (k: number, spread: number): Variants => ({
  hidden: { rotate: 0, x: 0, y: 30, opacity: 0 },
  show: (i: number) => ({
    rotate: FAN[k].rotate,
    x: FAN[k].x * spread,
    y: FAN[k].y,
    opacity: 1,
    transition: { type: 'spring', stiffness: 140, damping: 16, delay: 0.25 + i * 0.06 + k * 0.07 },
  }),
  hover: {
    rotate: FAN[k].rotate * 1.45,
    x: FAN[k].x * spread * 1.35,
    y: FAN[k].y - 10,
    transition: { type: 'spring', stiffness: 220, damping: 18 },
  },
});

function Fan({ images, size }: { images: string[]; size: Size }) {
  const spread = SPREAD[size];
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute flex items-end justify-center',
        size === 'wide' ? 'bottom-[-18px] right-[32%] md:right-[22%]' : 'bottom-[-22px] left-1/2 -translate-x-1/2',
      )}
    >
      {images.map((src, k) => (
        <motion.div
          key={src}
          variants={card(k, spread)}
          // La del centro va encima: es la que se ve entera.
          style={{ zIndex: k === 1 ? 3 : 2, transformOrigin: '50% 100%' }}
          className={cn(
            'absolute bottom-0 overflow-hidden rounded-lg border-[3px] border-surface bg-surface shadow-[0_18px_30px_-12px_rgb(var(--ink)/0.45)]',
            CARD_SIZE[size],
          )}
        >
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        </motion.div>
      ))}
    </div>
  );
}

export function CategoryBento({ categories, products }: { categories: Category[]; products: Product[] }) {
  const reduce = useReducedMotion();
  const anim = reduce
    ? { initial: 'show' as const, animate: 'show' as const }
    : { initial: 'hidden' as const, whileInView: 'show' as const, whileHover: 'hover' as const, viewport: { once: true, margin: '-60px' } };

  return (
    <div className="grid grid-flow-dense auto-rows-[184px] grid-cols-2 gap-3 md:auto-rows-[212px] md:grid-cols-4">
      {categories.map((c, i) => {
        const size = PATTERN[i] ?? 'sm';
        const items = products.filter((p) => p.categoryId === c.id);
        const images = items.slice(0, 3).map((p) => p.images[0]).filter(Boolean);
        return (
          <motion.div key={c.id} custom={i} variants={tile} {...anim} className={cn(SPAN[size], 'min-w-0')}>
            <Link
              to={`/tienda?cat=${c.slug}`}
              className={cn(
                'group relative flex h-full flex-col overflow-hidden rounded-xl border border-line p-4 transition-shadow duration-300 hover:shadow-card md:p-5',
                TONES[i % TONES.length],
              )}
            >
              <div className={cn('relative z-10 flex items-start justify-between gap-3', size === 'wide' && 'max-w-[52%]')}>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="tnum text-meta font-semibold tracking-[.14em] text-clay">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className={cn('display leading-tight text-ink text-balance', size === 'large' ? 'text-h4 md:text-h3' : 'text-body md:text-h5')}>
                    {c.name}
                  </h3>
                  <span className="text-cap text-mist">{items.length} {items.length === 1 ? 'producto' : 'productos'}</span>
                  {size !== 'sm' && (
                    <p className={cn('mt-1 hidden max-w-[34ch] text-cap text-ash md:block', size === 'large' && 'text-body')}>{c.description}</p>
                  )}
                </div>
                {size !== 'wide' && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors duration-300 group-hover:border-ink group-hover:bg-ink group-hover:text-canvas">
                    <ArrowUpRight size={16} strokeWidth={2} />
                  </span>
                )}
              </div>
              {size === 'wide' && (
                <span className="relative z-10 mt-auto inline-flex items-center gap-1.5 text-cap font-medium text-ink">
                  Explorar <ArrowRight size={13} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              )}
              {images.length > 0 && <Fan images={images} size={size} />}
            </Link>
          </motion.div>
        );
      })}

      {/* Cierre: toda la tienda. Tinta sobre lienzo, invierte solo con el tema. */}
      <motion.div custom={categories.length} variants={tile} {...anim} className="col-span-2 min-w-0">
        <Link
          to="/tienda"
          className="group relative flex h-full flex-col justify-between overflow-hidden rounded-xl bg-ink p-5 text-canvas md:p-6"
        >
          <span className="text-meta font-semibold uppercase tracking-[.18em] text-canvas/60">Catálogo completo</span>
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="display text-h3 leading-none md:text-h2">Toda la tienda</span>
              <span className="text-body text-canvas/70">{products.length} productos en {categories.length} categorías</span>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-canvas text-ink transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight size={20} strokeWidth={2} />
            </span>
          </div>
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-clay/25 blur-3xl transition-transform duration-700 group-hover:scale-125" />
        </Link>
      </motion.div>
    </div>
  );
}
