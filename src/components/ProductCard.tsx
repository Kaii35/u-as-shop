import { Link } from 'react-router-dom';
import { Heart, ShoppingBag } from 'lucide-react';
import { getCategory } from '../data/catalog';
import { cn, discountPct, hasPriceBySize, stockInfo } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import type { Product } from '../types';
import { Button } from './ui/Button';
import { Badge, Img, PriceDisplay, RatingStars, type BadgeTone } from './ui/Primitives';

export function getBadge(p: Product): { label: string; tone: BadgeTone } | null {
  if (p.oldPrice) return { label: 'Oferta', tone: 'wine' };
  if (p.tags.includes('new')) return { label: 'Nuevo', tone: 'ink' };
  if (p.tags.includes('best')) return { label: 'Más vendido', tone: 'light' };
  return null;
}

function FavButton({ product, className }: { product: Product; className?: string }) {
  const { isFav, toggleFav } = useStore();
  const on = isFav(product.id);
  return (
    <button
      onClick={() => toggleFav(product.id)}
      aria-pressed={on}
      aria-label={on ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      className={cn('flex items-center justify-center rounded-full transition-transform hover:scale-105', on ? 'text-wine' : 'text-ink', className)}
    >
      <Heart size={18} strokeWidth={1.5} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

export function ProductCard({ product: p, layout = 'grid' }: { product: Product; layout?: 'grid' | 'list' }) {
  const { addToCart, openQuickView } = useStore();
  const badge = getBadge(p);
  const stock = stockInfo(p.stock);
  const href = `/producto/${p.slug}`;

  if (layout === 'list') {
    return (
      <article className="flex gap-5 border-b border-ink/10 py-4">
        <Link to={href} className="relative aspect-[4/5] w-[clamp(110px,18vw,170px)] shrink-0 overflow-hidden rounded">
          <Img src={p.images[0]} alt={p.name} label="Foto" />
          {badge && <Badge tone={badge.tone} className="absolute left-2 top-2">{badge.label}</Badge>}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <span className="label-xs">{p.brand} · {getCategory(p.categoryId)?.name}</span>
          <Link to={href} className="font-display text-[clamp(16px,1.6vw,20px)] leading-tight hover:text-wine">{p.name}</Link>
          <span className="flex items-center gap-1.5 text-xs"><RatingStars rating={p.rating} size={12} />{p.rating.toFixed(1)} <span className="text-muted">{p.reviewCount} reseñas</span></span>
          <PriceDisplay price={p.price} oldPrice={p.oldPrice} from={hasPriceBySize(p)} />
          <span className="flex items-center gap-1.5 text-xs text-muted"><span className={cn('h-1.5 w-1.5 rounded-full', stock.dot)} />{stock.label}</span>
          <div className="mt-1 flex gap-2">
            <Button size="sm" onClick={() => addToCart(p.id)}>Agregar</Button>
            <FavButton product={p} className="h-11 w-11 border border-ink/20" />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex flex-col gap-3.5">
      <div className="relative aspect-[4/5] overflow-hidden rounded bg-nude">
        <Link to={href} aria-label={p.name} className="absolute inset-0">
          <Img src={p.images[0]} alt={p.name} label="Foto de producto" className="transition-transform duration-700 ease-silk group-hover:scale-[1.03]" />
          {p.images[1] && (
            <span className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <Img src={p.images[1]} alt="" />
            </span>
          )}
        </Link>
        {badge && (
          <div className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {p.oldPrice && <Badge tone="light">-{discountPct(p)}%</Badge>}
          </div>
        )}
        <FavButton product={p} className="absolute right-2.5 top-2.5 h-[38px] w-[38px] bg-ivory/90" />
        <div className="absolute inset-x-2.5 bottom-2.5 translate-y-[120%] opacity-0 transition duration-300 ease-silk group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100">
          <button onClick={() => openQuickView(p.id)} className="h-[42px] w-full rounded-full bg-ivory/95 text-[11px] font-medium uppercase tracking-[.14em] hover:bg-white">
            Vista rápida
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 px-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="label-xs tracking-[.18em]">{p.brand}</span>
          <span className="flex items-center gap-1 text-xs"><RatingStars rating={5} size={11} className="[&>svg:not(:first-child)]:hidden" />{p.rating.toFixed(1)} <span className="text-muted">({p.reviewCount})</span></span>
        </div>
        <Link to={href} className="min-h-[42px] text-base leading-snug text-pretty hover:text-wine">{p.name}</Link>
        {p.shades && (
          <div className="flex items-center gap-[5px]">
            {p.shades.slice(0, 5).map((s) => <span key={s.name} title={s.name} className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgba(36,33,36,.14)]" style={{ background: s.hex }} />)}
            <span className="ml-0.5 text-[11px] text-muted">{p.shades.length > 5 ? `+${p.shades.length - 5}` : `${p.shades.length} tonos`}</span>
          </div>
        )}
        <div className="mt-1 flex items-end justify-between gap-2.5">
          <div className="flex flex-col gap-1">
            <PriceDisplay price={p.price} oldPrice={p.oldPrice} from={hasPriceBySize(p)} />
            <span className="flex items-center gap-1.5 text-xs text-muted"><span className={cn('h-1.5 w-1.5 rounded-full', stock.dot)} />{stock.label}</span>
          </div>
          <button
            onClick={() => addToCart(p.id)}
            aria-label={`Agregar ${p.name} al carrito`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink transition-colors duration-300 hover:border-wine hover:bg-wine hover:text-ivory"
          >
            <ShoppingBag size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, layout = 'grid' }: { products: Product[]; layout?: 'grid' | 'list' }) {
  if (layout === 'list') {
    return <div className="flex flex-col border-t border-ink/10">{products.map((p) => <ProductCard key={p.id} product={p} layout="list" />)}</div>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(230px,42vw),1fr))] gap-x-[clamp(12px,1.6vw,22px)] gap-y-[clamp(24px,2.4vw,36px)]">
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
