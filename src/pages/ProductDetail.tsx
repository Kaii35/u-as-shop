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
        <h1 className="display text-h4">No encontramos este producto</h1>
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
      <nav aria-label="Migas de pan" className="mb-6 flex flex-wrap items-center gap-2 text-cap text-mist">
        <Link to="/" className="hover:text-clay">Inicio</Link><span>/</span>
        <Link to={`/tienda?cat=${category?.slug}`} className="hover:text-clay">{category?.name}</Link><span>/</span>
        <span className="text-ink">{p.name}</span>
      </nav>

      <div className="flex flex-wrap items-start gap-[clamp(32px,4.4vw,72px)]">
        <ProductGallery product={p} />

        <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-[22px] lg:sticky lg:top-[150px]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Link to={`/tienda?marca=${slugify(p.brand)}`} className="text-meta font-medium uppercase tracking-[.22em] text-clay">{p.brand}</Link>
              <span className="text-cap text-mist">Ref. {p.ref}</span>
            </div>
            <h1 className="display text-h3 leading-[1.04] text-balance">{p.name}</h1>
            <a href="#resenas" className="flex items-center gap-2.5 text-cap"><RatingStars rating={p.rating} size={15} />{p.rating.toFixed(1)} <span className="text-mist">· {p.reviewCount} reseñas</span></a>
          </div>

          <div className="flex flex-wrap items-baseline gap-3.5">
            <PriceDisplay price={price} oldPrice={p.oldPrice} size="lg" />
            {p.oldPrice && <span className="rounded-full bg-sand px-2.5 py-[5px] text-cap font-semibold text-clay">-{discountPct(p)}%</span>}
            <span className="text-cap text-mist">IVA incluido</span>
          </div>

          {p.shades && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-meta font-medium uppercase tracking-[.14em]">Tono <span className="ml-1.5 text-body font-normal normal-case tracking-normal text-mist">{p.shades[shade].name}</span></legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {p.shades.map((s, i) => (
                  <button key={s.name} role="radio" aria-checked={i === shade} aria-label={s.name} title={s.name} onClick={() => setShade(i)}
                    className={cn('h-11 w-11 rounded-full border-[1.5px] p-[3px] transition-colors', i === shade ? 'border-clay' : 'border-transparent hover:border-line')}>
                    <span className="block h-full w-full rounded-full shadow-[inset_0_0_0_1px_rgba(36,33,36,.12)]" style={{ background: s.hex }} />
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {p.sizes && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-meta font-medium uppercase tracking-[.14em]">Presentación <span className="ml-1.5 text-body font-normal normal-case tracking-normal text-mist">{p.sizes[size].label}</span></legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {p.sizes.map((s, i) => (
                  <button key={s.label} role="radio" aria-checked={i === size} onClick={() => setSize(i)}
                    className={cn('h-11 min-w-[76px] rounded-full border px-[18px] text-body transition-colors', i === size ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>
                    {s.label}{s.price ? <span className="ml-1.5 opacity-70">{formatCOP(s.price)}</span> : null}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <span className="flex items-center gap-2 text-body"><span className={cn('h-2 w-2 rounded-full', stock.dot)} />{stock.label}<span className="text-mist">· Despacho en 24 h hábiles</span></span>

          <div className="flex flex-wrap gap-2.5">
            <QuantitySelector value={qty} onChange={setQty} max={Math.max(p.stock, 1)} />
            <Button size="lg" className="flex-[1_1_220px]" disabled={!p.stock} onClick={() => addToCart(p.id, { shade, size, qty })}>
              <ShoppingBag size={16} strokeWidth={1.5} /> {p.stock ? `Agregar al carrito · ${formatCOP(price * qty)}` : 'Agotado'}
            </Button>
            <button onClick={() => toggleFav(p.id)} aria-pressed={fav} aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'} className="flex h-14 w-14 items-center justify-center rounded-full border border-line text-clay transition-colors hover:border-clay">
              <Heart size={20} strokeWidth={1.5} fill={fav ? 'currentColor' : 'none'} />
            </button>
          </div>
          <Button size="lg" variant="secondary" disabled={!p.stock} onClick={buyNow}>Comprar ahora</Button>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded border border-line bg-ink/10">
            {[[Truck, 'Envío gratis desde $250.000'], [RotateCcw, 'Cambios hasta 30 días'], [ShieldCheck, 'Producto original garantizado']].map(([Icon, text]) => {
              const I = Icon as typeof Truck;
              return <div key={text as string} className="flex flex-col gap-2 bg-white p-3.5 text-cap leading-snug"><I size={20} strokeWidth={1.5} className="text-clay" />{text as string}</div>;
            })}
          </div>
        </div>
      </div>

      <section className="mt-[clamp(56px,6vw,96px)] max-w-[980px]">
        <div role="tablist" className="flex gap-[clamp(18px,3vw,40px)] overflow-x-auto border-b border-line">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn('-mb-px shrink-0 whitespace-nowrap border-b-[1.5px] pb-4 display text-h4 transition-colors', tab === t.id ? 'border-clay text-ink' : 'border-transparent text-mist')}>
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="max-w-[720px] pt-[30px] text-lead leading-[1.7]">
          {tab === 'desc' && <p>{p.description}</p>}
          {tab === 'use' && <p>{p.usage}</p>}
          {tab === 'spec' && (
            <dl className="grid grid-cols-[minmax(120px,200px)_1fr] border-t border-line">
              {specs.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="border-b border-line py-3 text-cap font-medium uppercase tracking-[.08em]">{k}</dt>
                  <dd className="border-b border-line py-3">{v}</dd>
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
          <h2 className="display text-h4">Reseñas</h2>
          <div className="flex items-baseline gap-3">
            <span className="display text-h4 leading-none text-clay">{p.rating.toFixed(1)}</span>
            <span className="flex flex-col gap-1.5 text-cap text-mist"><RatingStars rating={p.rating} size={15} />{p.reviewCount} reseñas</span>
          </div>
          <div className="flex flex-col gap-2">
            {ratingDistribution.map(([n, pc]) => (
              <div key={n} className="flex items-center gap-2.5 text-cap">
                <span className="w-3">{n}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10"><span className="block h-full bg-clay" style={{ width: `${pc}%` }} /></span>
                <span className="w-[34px] text-right text-mist">{pc}%</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="mt-2 self-start">Escribir una reseña</Button>
        </div>
        <div className="flex flex-[1_1_460px] flex-col">
          {reviews.map((r) => (
            <article key={r.author} className="flex flex-col gap-2.5 border-t border-line py-[26px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-clay-soft display text-h5 text-clay">{r.author[0]}</span>
                  <span className="flex flex-col gap-0.5"><span className="text-body font-medium">{r.author}</span><span className="text-cap text-mist">{r.role}</span></span>
                </div>
                <span className="flex items-center gap-2.5 text-cap text-mist"><RatingStars rating={r.rating} size={13} />{r.date}</span>
              </div>
              <h3 className="display text-h5">{r.title}</h3>
              <p className="text-body leading-relaxed">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-[clamp(56px,6vw,96px)]">
        <h2 className="display mb-8 text-h4">Completa tu <em className="text-clay">ritual</em></h2>
        <ProductGrid products={related} />
      </section>
    </div>
  );
}
