import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Img } from './Primitives';

export interface FeatureCard {
  /** Etiqueta corta en versalitas sobre el título. */
  kicker: string;
  title: string;
  /** Línea de apoyo opcional; aparece bajo el título. */
  detail?: string;
  image?: string;
  /** Si se indica, la tarjeta entera navega ahí. */
  to?: string;
  icon?: ReactNode;
}

/**
 * Rejilla de tarjetas con foto a sangre, velo degradado y texto abajo.
 *
 * El degradado no es decorativo: es lo único que garantiza contraste del texto
 * sobre una foto arbitraria, así que va siempre y no sólo al pasar el cursor.
 */
export function FeatureCards({ items, className, ratio = 'aspect-[4/5]' }: {
  items: FeatureCard[];
  className?: string;
  ratio?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {items.map((it) => {
        const inner = (
          <>
            <div className="absolute inset-0 transition-transform duration-500 ease-soft group-hover:scale-[1.05]">
              <Img src={it.image} alt="" label={it.title} />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-transparent to-70%" />
            {/* Tinta translúcida, no blanco: un chip claro desaparece sobre las
                fotos de fondo claro, y aquí las hay de los dos tipos. */}
            {it.icon && (
              <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink/45 text-white ring-1 ring-white/20 backdrop-blur-sm">
                {it.icon}
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3.5">
              <span className="text-meta font-semibold uppercase tracking-[.12em] text-white/60">{it.kicker}</span>
              <span className="display text-h5 leading-tight text-white text-balance">{it.title}</span>
              {it.detail && <span className="text-cap leading-snug text-white/65">{it.detail}</span>}
            </div>
          </>
        );

        const cls = cn(
          'group relative overflow-hidden rounded-lg bg-sand ring-1 ring-white/10 transition-transform duration-300 ease-soft',
          ratio,
          it.to && 'hover:-translate-y-1',
        );

        return it.to
          ? <Link key={it.kicker + it.title} to={it.to} className={cls}>{inner}</Link>
          : <div key={it.kicker + it.title} className={cls}>{inner}</div>;
      })}
    </div>
  );
}
