import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, MessageCircle, User, X } from 'lucide-react';
import { categories, products } from '../data/catalog';
import { BUSINESS, whatsappUrl } from '../data/business';
import { cn, useEscape, useLockBody } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { Logo } from './ui/Primitives';
import { ThemeToggle } from './ui/ThemeToggle';

export interface NavItem { label: string; to: string; highlight?: boolean }

/**
 * Menú principal: panel que entra desde la izquierda.
 *
 * En escritorio va partido: los enlaces en grande a la izquierda y, a la
 * derecha, una foto de productos reales de la opción sobre la que está el
 * cursor (o el foco), con su recuento. En celular es solo la columna de
 * enlaces, a pantalla completa.
 */

/** Foto y recuento de cada opción, sacados de las categorías que filtra su enlace. */
function usePreviews(items: NavItem[]) {
  return useMemo(
    () =>
      items.map((n) => {
        const slugs = new URLSearchParams(n.to.split('?')[1] ?? '').get('cat')?.split(',') ?? [];
        const ids = categories.filter((c) => slugs.includes(c.slug)).map((c) => c.id);
        const list = ids.length ? products.filter((p) => ids.includes(p.categoryId)) : products;
        // Novedades: lo último del catálogo; el resto, lo primero de su grupo.
        const pick = n.to.includes('orden=new') ? [...list].reverse() : list;
        const images = pick.slice(0, 3).map((p) => p.images[0]).filter(Boolean);
        const sub = n.to.includes('oferta=1')
          ? 'Precios especiales'
          : n.to.includes('orden=new')
            ? 'Lo último en llegar'
            : `${list.length} productos`;
        return { images, sub };
      }),
    [items],
  );
}

/** Botón hamburguesa: las tres líneas se cruzan en una X al abrir. */
export function MenuButton({ open, onClick, className }: { open: boolean; onClick: () => void; className?: string }) {
  const line = 'absolute left-1/2 h-[2px] w-[18px] -translate-x-1/2 rounded-full bg-current transition-all duration-300 ease-soft';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
      aria-expanded={open}
      className={cn('group relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-ink hover:bg-sand', className)}
    >
      <span className={cn(line, open ? 'top-1/2 rotate-45' : 'top-[13px] group-hover:w-[14px]')} />
      <span className={cn(line, 'top-1/2 -translate-y-1/2', open && 'opacity-0')} />
      <span className={cn(line, open ? 'top-1/2 -rotate-45' : 'bottom-[13px] group-hover:w-[22px]')} />
    </button>
  );
}

export function MegaMenu({ open, onClose, items }: { open: boolean; onClose: () => void; items: NavItem[] }) {
  const { user } = useStore();
  const reduce = useReducedMotion();
  const previews = usePreviews(items);
  const [hover, setHover] = useState(1);
  useLockBody(open);
  useEscape(open, onClose);

  const link = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, x: -28 },
          animate: { opacity: 1, x: 0, transition: { delay: 0.12 + i * 0.05, duration: 0.45, ease: [0.2, 0.7, 0.2, 1] } },
        };
  const cur = previews[hover] ?? previews[0];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <motion.div
            className="absolute inset-0 bg-ink/45 dark:bg-canvas/75"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className="absolute inset-y-0 left-0 flex w-full overflow-hidden bg-surface shadow-drawer md:w-[min(960px,92vw)] md:rounded-r-2xl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: reduce ? 0 : 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {/* Columna de enlaces */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-3 px-5 py-4 md:px-8">
                <Logo size="sm" />
                <button
                  type="button"
                  onClick={onClose}
                  autoFocus
                  aria-label="Cerrar menú"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-line text-ink transition-transform duration-300 hover:rotate-90 hover:border-ink"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-5 pb-4 md:px-8" aria-label="Principal">
                <motion.div {...link(0)}>
                  <Link
                    to="/tienda"
                    className="mb-3 flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-canvas transition-transform duration-300 hover:scale-[1.01]"
                  >
                    <span className="flex flex-col">
                      <span className="text-meta font-semibold uppercase tracking-[.16em] text-canvas/60">Catálogo</span>
                      <span className="display text-h5">Todos los productos</span>
                    </span>
                    <ArrowUpRight size={20} strokeWidth={2} />
                  </Link>
                </motion.div>
                <ul className="flex flex-col">
                  {items.map((n, i) => (
                    <motion.li key={n.label} {...link(i + 1)}>
                      <Link
                        to={n.to}
                        onMouseEnter={() => setHover(i)}
                        onFocus={() => setHover(i)}
                        className="group flex items-baseline gap-4 border-b border-line py-3 md:py-3.5"
                      >
                        <span className="tnum w-6 text-meta font-semibold tracking-[.14em] text-mist">{String(i + 1).padStart(2, '0')}</span>
                        <span
                          className={cn(
                            'display flex-1 text-h4 leading-none transition-[color,transform] duration-300 group-hover:translate-x-1.5 md:text-h3',
                            n.highlight ? 'text-clay' : 'text-ink group-hover:text-clay',
                          )}
                        >
                          {n.label}
                        </span>
                        <span className="hidden text-cap text-mist sm:block">{previews[i]?.sub}</span>
                        <ArrowUpRight size={18} strokeWidth={2} className="self-center text-mist opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-clay group-hover:opacity-100" />
                      </Link>
                    </motion.li>
                  ))}
                </ul>

                <motion.div {...link(items.length + 1)} className="mt-6 flex flex-col gap-2.5">
                  <span className="kicker">Todas las categorías</span>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((c) => (
                      <Link
                        key={c.id}
                        to={`/tienda?cat=${c.slug}`}
                        className="rounded-full border border-line px-3 py-1.5 text-cap text-ash transition-colors hover:border-ink hover:bg-ink hover:text-canvas"
                      >
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </motion.div>
              </nav>

              <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 md:px-8">
                <Link
                  to={user ? '/cuenta' : '/ingresar'}
                  className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-body font-medium transition-colors hover:border-ink"
                >
                  <User size={16} strokeWidth={2} /> {user ? `Hola, ${user.firstName}` : 'Ingresar'}
                </Link>
                <a
                  href={whatsappUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-body font-medium transition-colors hover:border-ink"
                >
                  <MessageCircle size={16} strokeWidth={2} /> {BUSINESS.whatsapp}
                </a>
                <ThemeToggle size="md" className="ml-auto" />
              </div>
            </div>

            {/* Vista previa (solo escritorio) */}
            <div className="relative hidden w-[40%] shrink-0 overflow-hidden bg-sand md:block">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={hover}
                  className="absolute inset-0"
                  initial={reduce ? false : { opacity: 0, scale: 1.06 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                >
                  {cur?.images[0] && <img src={cur.images[0]} alt="" className="h-full w-full object-cover" />}
                  {/* Dos miniaturas flotando sobre la foto principal. */}
                  <div className="absolute bottom-24 left-6 flex gap-2">
                    {cur?.images.slice(1).map((src, k) => (
                      <motion.span
                        key={src}
                        className="h-24 w-20 overflow-hidden rounded-lg border-[3px] border-surface shadow-card"
                        initial={reduce ? false : { opacity: 0, y: 16, rotate: k ? 6 : -6 }}
                        animate={{ opacity: 1, y: 0, rotate: k ? 4 : -4 }}
                        transition={{ delay: 0.15 + k * 0.08, duration: 0.45 }}
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </motion.span>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
              <div className="absolute inset-x-6 bottom-6 rounded-xl bg-surface/90 px-4 py-3 backdrop-blur-sm">
                <span className="label-xs">{cur?.sub}</span>
                <span className="display block text-h5 text-ink">{items[hover]?.label}</span>
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
