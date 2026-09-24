import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart, RotateCcw, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { getCategory, getProductBySlug, products, ratingDistribution, reviews, slugify } from '../data/catalog';
import { cn, discountPct, formatCOP, stockInfo, unitPrice } from '../lib/utils';
import { useStore } from '../store/StoreContext';
import { ProductGallery } from '../components/ProductGallery';
import { ProductGrid } from '../components/ProductCard';
import { Button } from '../components/ui/Button';
import { PriceDisplay, QuantitySelector, RatingStars } from '../components/ui/Primitives';
import type { Product } from '../types';

export default function ProductPage() {
  const { slug } = useParams();
  const product = getProductBySlug(slug);
  if (!product) {
    return (
      <div className="flex flex-col items-center gap-4 px-5 py-24 text-center">
        <h1 className="font-display text-[40px]">No encontramos este producto</h1>
        <Link to="/tienda"><Button>Volver a la tienda</Button></Link>
      </div>
    );
  }
  return <ProductDetail key={product.id} product={product} />;
}

const TABS = [
  { id: 'desc', label: 'Descripción' },
  { id: 'spec', label: 'Características' },
  { id: 'use', label: 'Modo de uso' },
  { id: 'ship', label: 'Envíos y devoluciones' },
] as const;

function ProductDetail({ product: p }: { product: Product }) {
  const { addToCart, isFav, toggleFav } = useStore();
  const navigate = useNavigate();
  const [shade, setShade] = useState(0);
  const [size, setSize] = useState(0);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('desc');
  const category = getCategory(p.categoryId);
  const stock = stockInfo(p.stock);
  const price = unitPrice(p, size);
  const fav = isFav(p.id);

  const related = [...products.filter((x) => x.id !== p.id && (x.categoryId === p.categoryId || x.brand === p.brand)), ...products.filter((x) => x.tags.includes('best') && x.id !== p.id)]
    .filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);

  const buyNow = () => { if (addToCart(p.id, { shade, size, qty })) navigate('/checkout'); };

  const specs: Array<[string, string]> = [
    ['Marca', p.brand], ['Referencia', p.ref], ['Contenido', p.content], ['Categoría', category?.name ?? ''],
    ['Uso', p.tags.includes('pro') ? 'Profesional' : 'Profesional y personal'], ['Registro', 'Notificación sanitaria INVIMA vigente'],
  ];

  return (
    <div className="container-x pb-[clamp(64px,7vw,110px)] pt-[clamp(20px,3vw,36px)]">
      <nav aria-label="Migas de pan" className="mb-6 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        <Link to="/" className="hover:text-wine">Inicio</Link><span>/</span>
        <Link to={`/tienda?cat=${category?.slug}`} className="hover:text-wine">{category?.name}</Link><span>/</span>
        <span className="text-ink">{p.name}</span>
      </nav>

      <div className="flex flex-wrap items-start gap-[clamp(32px,4.4vw,72px)]">
        <ProductGallery product={p} />

        <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-[22px] lg:sticky lg:top-[150px]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Link to={`/tienda?marca=${slugify(p.brand)}`} className="text-[11.5px] font-medium uppercase tracking-[.22em] text-wine">{p.brand}</Link>
              <span className="text-xs text-muted">Ref. {p.ref}</span>
            </div>
            <h1 className="font-display text-[clamp(34px,3.6vw,52px)] font-normal leading-[1.04] tracking-[-.025em] text-balance">{p.name}</h1>
            <a href="#resenas" className="flex items-center gap-2.5 text-[13.5px]"><RatingStars rating={p.rating} size={15} />{p.rating.toFixed(1)} <span className="text-muted">· {p.reviewCount} reseñas</span></a>
          </div>

          <div className="flex flex-wrap items-baseline gap-3.5">
            <PriceDisplay price={price} oldPrice={p.oldPrice} size="lg" />
            {p.oldPrice && <span className="rounded-full bg-nude px-2.5 py-[5px] text-xs font-semibold text-wine">-{discountPct(p)}%</span>}
            <span className="text-[12.5px] text-muted">IVA incluido</span>
          </div>

          {p.shades && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-[11px] font-medium uppercase tracking-[.14em]">Tono <span className="ml-1.5 text-sm font-normal normal-case tracking-normal text-muted">{p.shades[shade].name}</span></legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {p.shades.map((s, i) => (
                  <button key={s.name} role="radio" aria-checked={i === shade} aria-label={s.name} title={s.name} onClick={() => setShade(i)}
                    className={cn('h-11 w-11 rounded-full border-[1.5px] p-[3px] transition-colors', i === shade ? 'border-wine' : 'border-transparent hover:border-ink/20')}>
                    <span className="block h-full w-full rounded-full shadow-[inset_0_0_0_1px_rgba(36,33,36,.12)]" style={{ background: s.hex }} />
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {p.sizes && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-[11px] font-medium uppercase tracking-[.14em]">Presentación <span className="ml-1.5 text-sm font-normal normal-case tracking-normal text-muted">{p.sizes[size].label}</span></legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {p.sizes.map((s, i) => (
                  <button key={s.label} role="radio" aria-checked={i === size} onClick={() => setSize(i)}
                    className={cn('h-11 min-w-[76px] rounded-full border px-[18px] text-sm transition-colors', i === size ? 'border-ink bg-ink text-ivory' : 'border-ink/20 hover:border-ink')}>
                    {s.label}{s.price ? <span className="ml-1.5 opacity-70">{formatCOP(s.price)}</span> : null}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <span className="flex items-center gap-2 text-sm"><span className={cn('h-2 w-2 rounded-full', stock.dot)} />{stock.label}<span className="text-muted">· Despacho en 24 h hábiles</span></span>

          <div className="flex flex-wrap gap-2.5">
            <QuantitySelector value={qty} onChange={setQty} max={Math.max(p.stock, 1)} />
            <Button size="lg" className="flex-[1_1_220px]" disabled={!p.stock} onClick={() => addToCart(p.id, { shade, size, qty })}>
              <ShoppingBag size={16} strokeWidth={1.5} /> {p.stock ? `Agregar al carrito · ${formatCOP(price * qty)}` : 'Agotado'}
            </Button>
            <button onClick={() => toggleFav(p.id)} aria-pressed={fav} aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'} className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/20 text-wine transition-colors hover:border-wine">
              <Heart size={20} strokeWidth={1.5} fill={fav ? 'currentColor' : 'none'} />
            </button>
          </div>
          <Button size="lg" variant="secondary" disabled={!p.stock} onClick={buyNow}>Comprar ahora</Button>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded border border-ink/10 bg-ink/10">
            {[[Truck, 'Envío gratis desde $250.000'], [RotateCcw, 'Cambios hasta 30 días'], [ShieldCheck, 'Producto original garantizado']].map(([Icon, text]) => {
              const I = Icon as typeof Truck;
              return <div key={text as string} className="flex flex-col gap-2 bg-ivory p-3.5 text-[12.5px] leading-snug"><I size={20} strokeWidth={1.5} className="text-wine" />{text as string}</div>;
            })}
          </div>
        </div>
      </div>

      <section className="mt-[clamp(56px,6vw,96px)] max-w-[980px]">
        <div role="tablist" className="flex gap-[clamp(18px,3vw,40px)] overflow-x-auto border-b border-ink/10">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn('-mb-px shrink-0 whitespace-nowrap border-b-[1.5px] pb-4 font-display text-[clamp(18px,1.8vw,22px)] transition-colors', tab === t.id ? 'border-wine text-ink' : 'border-transparent text-muted')}>
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="max-w-[720px] pt-[30px] text-[16.5px] font-light leading-[1.7]">
          {tab === 'desc' && <p>{p.description}</p>}
          {tab === 'use' && <p>{p.usage}</p>}
          {tab === 'spec' && (
            <dl className="grid grid-cols-[minmax(120px,200px)_1fr] border-t border-ink/10">
              {specs.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="border-b border-ink/10 py-3 text-[13px] font-medium uppercase tracking-[.08em]">{k}</dt>
                  <dd className="border-b border-ink/10 py-3">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab === 'ship' && (
            <>
              <p className="mb-3">Despachamos a todos los municipios de Colombia. Envío estándar de 3 a 5 días hábiles ($12.900, gratis desde $250.000) y express de 24 a 48 horas en ciudades principales.</p>
              <p>Tienes 30 días para cambios en productos sin abrir. Los equipos eléctricos tienen garantía oficial de 12 meses.</p>
            </>
          )}
        </div>
      </section>

      <section id="resenas" className="mt-[clamp(56px,6vw,96px)] flex scroll-mt-32 flex-wrap gap-[clamp(32px,5vw,80px)]">
        <div className="flex flex-[0_1_300px] flex-col gap-4">
          <h2 className="h-display text-[clamp(32px,3.4vw,48px)]">Reseñas</h2>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[64px] leading-none text-wine">{p.rating.toFixed(1)}</span>
            <span className="flex flex-col gap-1.5 text-[13px] text-muted"><RatingStars rating={p.rating} size={15} />{p.reviewCount} reseñas</span>
          </div>
          <div className="flex flex-col gap-2">
            {ratingDistribution.map(([n, pc]) => (
              <div key={n} className="flex items-center gap-2.5 text-[13px]">
                <span className="w-3">{n}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10"><span className="block h-full bg-wine" style={{ width: `${pc}%` }} /></span>
                <span className="w-[34px] text-right text-muted">{pc}%</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="mt-2 self-start">Escribir una reseña</Button>
        </div>
        <div className="flex flex-[1_1_460px] flex-col">
          {reviews.map((r) => (
            <article key={r.author} className="flex flex-col gap-2.5 border-t border-ink/10 py-[26px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush font-display text-lg italic text-wine">{r.author[0]}</span>
                  <span className="flex flex-col gap-0.5"><span className="text-[14.5px] font-medium">{r.author}</span><span className="text-[12.5px] text-muted">{r.role}</span></span>
                </div>
                <span className="flex items-center gap-2.5 text-[12.5px] text-muted"><RatingStars rating={r.rating} size={13} />{r.date}</span>
              </div>
              <h3 className="font-display text-xl">{r.title}</h3>
              <p className="text-[15.5px] font-light leading-relaxed">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-[clamp(56px,6vw,96px)]">
        <h2 className="h-display mb-8 text-[clamp(32px,3.4vw,48px)]">Completa tu <em className="text-wine">ritual</em></h2>
        <ProductGrid products={related} />
      </section>
    </div>
  );
}
