import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Category } from '../types';
import { Img } from './ui/Primitives';

/**
 * Tarjeta de categoría. El degradado inferior es lo único que garantiza contraste
 * del texto sobre foto, así que va siempre, no sólo al pasar el cursor.
 */
export function CategoryCard({ category, large, className }: {
  category: Category; index?: number; large?: boolean; className?: string;
}) {
  return (
    <Link
      to={`/tienda?cat=${category.slug}`}
      className={cn('group relative block overflow-hidden rounded border border-line bg-sand', className)}
    >
      <div className="absolute inset-0 transition-transform duration-500 ease-soft group-hover:scale-[1.04]">
        <Img src={category.image} alt="" label="Foto de categoría" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className={cn('display leading-tight text-white text-balance', large ? 'text-h5' : 'text-body')}>
            {category.name}
          </h3>
          {large && <p className="line-clamp-2 max-w-[30ch] text-cap text-white/75">{category.description}</p>}
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/15 text-white backdrop-blur-sm transition-colors group-hover:bg-white group-hover:text-ink">
          <ArrowRight size={14} strokeWidth={2} />
        </span>
      </div>
    </Link>
  );
}
