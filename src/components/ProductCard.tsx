import { Link } from 'react-router-dom';
import { Heart, Plus } from 'lucide-react';
import { getCategory } from '../data/catalog';
import { cn, discountPct, hasPriceBySize, stockInfo } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import type { Product } from '../types';
import { Button } from './ui/Button';
import { Badge, Img, PriceDisplay, RatingStars, type BadgeTone } from './ui/Primitives';

export function getBadge(p: Product): { label: string; tone: BadgeTone } | null {
  if (p.oldPrice) return { label: 'Oferta', tone: 'sale' };
  if (p.tags.includes('new')) return { label: 'Nuevo', tone: 'new' };
  if (p.tags.includes('best')) return { label: 'Top ventas', tone: 'light' };
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
      className={cn('flex cursor-pointer items-center justify-center rounded transition-colors', on ? 'text-clay' : 'text-ash hover:text-ink', className)}
    >
      <Heart size={16} strokeWidth={2} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

function StockLine({ stock }: { stock: number }) {
  const s = stockInfo(stock);
  return (
    <span className="flex items-center gap-1.5 text-meta text-mist">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

export function ProductCard({ product: p, layout = 'grid' }: { product: Product; layout?: 'grid' | 'list' }) {
  const { addToCart, openQuickView } = useStore();
  const badge = getBadge(p);
  const href = `/producto/${p.slug}`;

  if (layout === 'list') {
    return (
      <article className="flex gap-4 border-b border-line py-4">
        <Link to={href} className="relative aspect-[4/5] w-[104px] shrink-0 overflow-hidden rounded border border-line bg-sand">
          <Img src={p.images[0]} alt={p.name} label="Foto" />
          {badge && <Badge tone={badge.tone} className="absolute left-1.5 top-1.5">{badge.label}</Badge>}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="label-xs">{p.brand} · {getCategory(p.categoryId)?.name}</span>
          <Link to={href} className="text-body font-medium leading-snug text-pretty hover:text-clay">{p.name}</Link>
          <span className="flex items-center gap-1.5 text-meta text-mist">
            <RatingStars rating={p.rating} size={11} />
            <span className="tnum">{p.rating.toFixed(1)}</span>
            <span>({p.reviewCount})</span>
          </span>
          <StockLine stock={p.stock} />
          <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1.5">
            <PriceDisplay price={p.price} oldPrice={p.oldPrice} from={hasPriceBySize(p)} size="sm" />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => addToCart(p.id)} disabled={p.stock === 0}>Agregar</Button>
              <FavButton product={p} className="h-9 w-9 rounded border border-line" />
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden rounded border border-line bg-sand">
        <Link to={href} aria-label={p.name} className="absolute inset-0">
          <Img src={p.images[0]} alt={p.name} label="Foto de producto" className="transition-transform duration-500 ease-soft group-hover:scale-[1.04]" />
          {p.images[1] && (
            <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Img src={p.images[1]} alt="" />
            </span>
          )}
        </Link>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
          {p.oldPrice && <Badge tone="light">−{discountPct(p)}%</Badge>}
        </div>
        <FavButton product={p} className="absolute right-1.5 top-1.5 h-8 w-8 rounded bg-white/90 backdrop-blur-sm" />
        {/* La vista rápida aparece al enfocar o pasar el cursor; en táctil nunca
            estorba porque no hay hover y la ficha sigue siendo alcanzable. */}
        <div className="absolute inset-x-1.5 bottom-1.5 translate-y-2 opacity-0 transition duration-200 ease-soft group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 max-md:hidden">
          <button
            onClick={() => openQuickView(p.id)}
            className="h-9 w-full cursor-pointer rounded bg-white/95 text-cap font-medium text-ink shadow-card backdrop-blur-sm transition-colors hover:bg-white"
          >
            Vista rápida
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 pt-2.5">
        <span className="label-xs">{p.brand}</span>
        <Link to={href} className="text-body leading-snug text-pretty transition-colors hover:text-clay">{p.name}</Link>
        <span className="flex items-center gap-1 text-meta text-mist">
          <RatingStars rating={p.rating} size={11} />
          <span className="tnum ml-0.5">{p.rating.toFixed(1)}</span>
          <span>({p.reviewCount})</span>
        </span>
        {p.shades && (
          <div className="flex items-center gap-1">
            {p.shades.slice(0, 5).map((s) => (
              <span key={s.name} title={s.name} className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-ink/10" style={{ background: s.hex }} />
            ))}
            <span className="ml-0.5 text-meta text-mist">{p.shades.length > 5 ? `+${p.shades.length - 5}` : `${p.shades.length} tonos`}</span>
          </div>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex flex-col gap-1">
            <PriceDisplay price={p.price} oldPrice={p.oldPrice} from={hasPriceBySize(p)} size="sm" />
            <StockLine stock={p.stock} />
          </div>
          <button
            onClick={() => addToCart(p.id)}
            disabled={p.stock === 0}
            aria-label={`Agregar ${p.name} al carrito`}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-line text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-35"
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, layout = 'grid' }: { products: Product[]; layout?: 'grid' | 'list' }) {
  if (layout === 'list') {
    return <div className="flex flex-col border-t border-line">{products.map((p) => <ProductCard key={p.id} product={p} layout="list" />)}</div>;
  }
  // Cuatro por fila en desktop: es la densidad que pedía el rediseño.
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 md:gap-x-5 xl:grid-cols-4">
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
