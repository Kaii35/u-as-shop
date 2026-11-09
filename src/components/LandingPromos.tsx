import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { api, assetUrl } from '../lib/api';
import type { LandingPromotion } from '../lib/admin-types';
import { usesApi } from '../config/features';
import { cn } from '../lib/utils';

/**
 * Las promociones de la tienda que se crean en el panel, además del pop-up:
 *
 * - La **franja**: una línea de texto arriba de todas las páginas. Si hay
 *   varias, se turnan.
 * - Los **banners**: tarjetas con foto dentro de la portada.
 *
 * Sin API, o sin promociones, no se pinta nada.
 */

export interface PromoBarItem {
  id: string;
  text: string;
  url: string | null;
}

interface LandingData {
  bars: PromoBarItem[];
  banners: LandingPromotion[];
}

// ---------------------------------------------------------------------------
// Datos: una sola petición compartida por la franja y los banners
// ---------------------------------------------------------------------------

let data: LandingData = { bars: [], banners: [] };
const listeners = new Set<() => void>();
let controller: AbortController | null = null;

function load(): void {
  if (!usesApi || document.visibilityState !== 'visible') return;
  controller?.abort();
  const current = new AbortController();
  controller = current;
  api
    .publicGet<LandingData>('/api/promotions/landing', current.signal)
    .then((r) => {
      if (current.signal.aborted || !r) return;
      data = {
        bars: r.bars ?? [],
        banners: (r.banners ?? []).map((p) => ({ ...p, image: assetUrl(p.image) })),
      };
      for (const listener of listeners) listener();
    })
    .catch(() => undefined);
}

/**
 * Se pide al montar el primero que la necesita y otra vez al volver a la
 * pestaña: lo que se publica en el panel aparece sin recargar.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    load();
    document.addEventListener('visibilitychange', load);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) document.removeEventListener('visibilitychange', load);
  };
}

export const useLandingPromotions = (): LandingData => useSyncExternalStore(subscribe, () => data);

const trackClick = (id: string): void => {
  void api.publicPost<void>(`/api/promotions/${id}/track`, { event: 'click' }).catch(() => undefined);
};

// ---------------------------------------------------------------------------
// Franja
// ---------------------------------------------------------------------------

/**
 * Texto con formato mínimo: `**negrita**` y `_cursiva_`. El asterisco suelto
 * queda tal cual, porque se usa para notas ("*No aplica envíos express").
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/** Cada cuánto cambia de mensaje cuando hay más de uno. */
const BAR_MS = 5000;

export function PromoBar() {
  const { bars } = useLandingPromotions();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const count = bars.length;

  useEffect(() => {
    setIndex(0);
    if (count < 2 || reduce) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), BAR_MS);
    return () => window.clearInterval(timer);
  }, [count, reduce]);

  if (count === 0) return null;
  const current = bars[Math.min(index, count - 1)];
  if (!current) return null;

  const content = (
    <p key={current.id} className="animate-fade-up text-balance">
      <RichText text={current.text} />
    </p>
  );

  return (
    <div
      role="region"
      aria-label="Avisos de la tienda"
      aria-live="polite"
      className="border-b border-line bg-surface px-4 py-2 text-center text-cap text-ink"
    >
      {current.url ? (
        <Link to={current.url} onClick={() => trackClick(current.id)} className="block hover:underline">
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

/** El enlace de la promoción: interno con el router, externo en otra pestaña, o nada. */
function PromoLink({ promo, className, children }: { promo: LandingPromotion; className: string; children: ReactNode }) {
  const url = promo.ctaUrl;
  if (!url) return <div className={className}>{children}</div>;
  if (/^https?:\/\//i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" onClick={() => trackClick(promo.id)} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={url} onClick={() => trackClick(promo.id)} className={className}>
      {children}
    </Link>
  );
}

function PromoArt({ promo }: { promo: LandingPromotion }) {
  return (
    <>
      <div className="absolute inset-0 bg-sand transition-transform duration-700 ease-soft group-hover:scale-[1.03]">
        {promo.image && <img src={promo.image} alt="" className="photo h-full w-full object-cover" />}
      </div>
      {/* El velo es oscuro en los dos temas: el texto encima siempre es blanco. */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/35 to-transparent dark:from-canvas/85 dark:via-canvas/45 md:bg-gradient-to-r md:from-ink/80 md:via-ink/40 md:to-transparent md:dark:from-canvas/85 md:dark:via-canvas/45" />
      <div className="relative flex h-full flex-col justify-end gap-1.5 p-5 md:max-w-[58%] md:justify-center md:p-6">
        {/* tema-ok: etiqueta y título en blanco sobre el velo oscuro. */}
        {promo.badge && (
          <span className="text-meta font-semibold uppercase tracking-[.12em] text-white/75">{promo.badge}</span>
        )}
        <h3 className="display text-balance text-h5 text-white md:text-h4">{promo.title}</h3>
        {/* tema-ok: texto y botón en blanco sobre el velo oscuro de la foto. */}
        {promo.subtitle && <p className="line-clamp-3 whitespace-pre-line text-cap text-white/80">{promo.subtitle}</p>}
        {promo.ctaUrl && promo.ctaLabel && (
          <span className="mt-1 inline-flex w-fit items-center gap-1.5 text-body font-semibold text-white underline-offset-4 group-hover:underline">
            {promo.ctaLabel} <ArrowRight size={15} strokeWidth={2} />
          </span>
        )}
      </div>
    </>
  );
}

/** Banners con foto dentro de la portada: uno a lo ancho o dos en fila. */
export function PromoBanners() {
  const { banners } = useLandingPromotions();
  if (banners.length === 0) return null;
  return (
    <section className="container-x pb-section md:pb-section-lg">
      <div className={cn('grid gap-3', banners.length > 1 && 'md:grid-cols-2')}>
        {banners.map((promo) => (
          <PromoLink
            key={promo.id}
            promo={promo}
            className={cn(
              'group relative aspect-[3/2] overflow-hidden rounded-lg border border-line bg-sand',
              banners.length > 1 ? 'md:aspect-[5/2]' : 'md:aspect-[3/1]',
            )}
          >
            <PromoArt promo={promo} />
          </PromoLink>
        ))}
      </div>
    </section>
  );
}
