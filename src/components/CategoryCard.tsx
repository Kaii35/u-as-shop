import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Category } from '../types';
import { Img } from './ui/Primitives';

export function CategoryCard({ category, index, large, className }: {
  category: Category; index: number; large?: boolean; className?: string;
}) {
  const [hover, setHover] = useState(false);
  const showDesc = hover || large;
  return (
    <Link
      to={`/tienda?cat=${category.slug}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={cn('group relative block overflow-hidden rounded bg-nude', className)}
    >
      <div className="absolute inset-0 transition-transform duration-[1100ms] ease-silk group-hover:scale-105">
        <Img src={category.image} alt="" label="Foto de categoría" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-35% to-ink/75" />
      <span className="absolute left-[18px] top-4 font-display text-[15px] italic text-ivory">{String(index + 1).padStart(2, '0')}</span>
      <div className="absolute inset-x-[clamp(14px,1.6vw,26px)] bottom-[clamp(14px,1.6vw,24px)] flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className={cn('font-display leading-[1.02] tracking-[-.015em] text-ivory text-balance', large ? 'text-[clamp(28px,3vw,44px)]' : 'text-[clamp(20px,1.9vw,28px)]')}>
            {category.name}
          </h3>
          <p className={cn('max-w-[340px] overflow-hidden text-sm font-light leading-snug text-ivory transition-all duration-500', showDesc ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0', large && 'max-md:max-h-0 max-md:opacity-0')}>
            {category.description}
          </p>
        </div>
        <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-ivory/70 text-ivory transition-colors duration-300 group-hover:bg-ivory group-hover:text-wine">
          <ArrowUpRight size={20} strokeWidth={1.5} />
        </span>
      </div>
    </Link>
  );
}
