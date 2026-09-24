import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Award, Check, Gift, Layers, MessageCircle, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { brands, categories, getProduct, media, products } from '../data/catalog';
import { cn, formatCOP, isEmail } from '../lib/utils';
import { CategoryCard } from '../components/CategoryCard';
import { ProductGrid } from '../components/ProductCard';
import { Button } from '../components/ui/Button';
import { Reveal } from '../components/ui/Overlays';
import { Img, SectionHeading } from '../components/ui/Primitives';
import type { ProductTag } from '../types';

/** Composición bento: clase de grid por índice de categoría. */
const CAT_LAYOUT = [
  'col-span-2 row-span-2 md:col-span-6',
  'md:col-span-3',
  'md:col-span-3',
  'col-span-2 md:col-span-6',
  'row-span-2 md:col-span-4',
  'md:col-span-4',
  'md:col-span-4',
  'md:col-span-4',
  'md:col-span-4',
];

const TABS: Array<{ id: string; label: string; test: (p: (typeof products)[number]) => boolean }> = [
  { id: 'best', label: 'Más vendidos', test: (p) => p.tags.includes('best' as ProductTag) },
  { id: 'new', label: 'Nuevos', test: (p) => p.tags.includes('new') },
  { id: 'pro', label: 'Favoritos de profesionales', test: (p) => p.tags.includes('pro') },
  { id: 'sale', label: 'Ofertas especiales', test: (p) => !!p.oldPrice },
];

/** Tratamientos tipográficos para simular logotipos de marca. Reemplázalos por SVG reales. */
const BRAND_TYPE = [
  'font-display italic text-[30px]',
  'font-sans font-light uppercase tracking-[.32em] text-lg',
  'font-display font-medium tracking-[.04em] text-[28px]',
  'font-sans font-medium uppercase tracking-[.12em] text-xl',
  'font-display italic font-medium text-[32px]',
  'font-sans font-semibold uppercase tracking-[.5em] text-base',
  'font-display uppercase tracking-[.18em] text-[19px]',
  'font-sans lowercase tracking-[.06em] text-2xl',
];

const BENEFITS = [
  { Icon: Award, title: 'Selección profesional', text: 'Productos probados en cabina por nail artists y cosmetólogas.' },
  { Icon: Layers, title: 'Variedad de marcas', text: 'Nueve categorías y las marcas líderes del sector.' },
  { Icon: ShieldCheck, title: 'Compra segura', text: 'Pagos cifrados con tarjeta, PSE, Nequi y contra entrega.' },
  { Icon: Truck, title: 'Envíos a toda Colombia', text: 'Gratis desde $250.000. Express en ciudades principales.' },
  { Icon: MessageCircle, title: 'Atención personalizada', text: 'Asesoría técnica por WhatsApp de lunes a sábado.' },
  { Icon: Gift, title: 'Promociones y novedades', text: 'Lanzamientos y precios exclusivos cada mes.' },
];

export default function Home() {
  return (
    <>
      <Hero />
      <Categories />
      <Featured />
      <Campaign />
      <Brands />
      <Benefits />
      <Newsletter />
    </>
  );
}

function Hero() {
  const star = getProduct('p1')!;
  return (
    <section className="container-x pb-14 pt-[18px] md:pb-[clamp(64px,7vw,110px)] md:pt-[clamp(20px,2.4vw,36px)]">
      {/* Desktop: composición editorial en 12 columnas */}
      <div className="hidden min-h-[min(780px,calc(100vh-150px))] grid-cols-12 grid-rows-[auto_1fr_auto] gap-x-6 md:grid">
        <div className="relative col-start-5 col-end-13 row-span-3 min-h-[640px] overflow-hidden rounded rounded-tl-[380px]">
          <Img src={media.heroMain} alt="Campaña Aurelle" label="Foto editorial de campaña" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[48%] bg-gradient-to-r from-ivory/90 to-transparent" />
          <div className="absolute bottom-[34px] left-[34px] aspect-square w-[clamp(96px,10vw,150px)] rounded-full bg-ivory p-[7px]">
            <div className="h-full w-full overflow-hidden rounded-full"><Img src={media.heroDetail} label="Detalle" /></div>
          </div>
          <div className="pointer-events-none absolute right-9 top-9 flex flex-col items-end gap-1 rounded-[14px] bg-ivory/90 px-4 py-3 backdrop-blur">
            <span className="text-[10px] font-medium uppercase tracking-[.24em] text-wine">Campaña Nº 07</span>
            <span className="font-display text-[15px] italic">Otoño · Invierno 2026</span>
          </div>
          <StarCard className="absolute bottom-8 right-8 w-[300px]" />
        </div>
        <div className="z-[2] col-start-1 col-end-5 row-start-1 self-start pt-2.5">
          <span className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-wine/25 px-4 py-[9px] text-[10.5px] font-medium uppercase tracking-[.16em] text-wine">
            <Sparkles size={15} strokeWidth={1.5} /> Beauty essentials for professionals
          </span>
        </div>
        <h1 className="pointer-events-none z-[2] col-start-1 col-end-10 row-start-2 self-center font-display text-[clamp(64px,7.4vw,124px)] font-normal leading-[.94] tracking-[-.035em] text-balance">
          Tu talento merece <span className="block pl-[1.1em]">herramientas</span>
          <em className="text-wine">extraordinarias.</em>
        </h1>
        <div className="z-[2] col-start-1 col-end-5 row-start-3 flex flex-col gap-[26px] self-end pb-1.5">
          <p className="max-w-[360px] text-lg font-light leading-relaxed text-pretty">Descubre los productos que transforman cada detalle en una obra de arte.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/tienda"><Button size="lg">Explorar productos <ArrowRight size={16} strokeWidth={1.5} /></Button></Link>
            <Link to="/#categorias"><Button size="lg" variant="secondary">Descubrir categorías</Button></Link>
          </div>
        </div>
      </div>

      {/* Móvil */}
      <div className="flex flex-col gap-[22px] md:hidden">
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-wine/25 px-3.5 py-2 text-[9.5px] font-medium uppercase tracking-[.2em] text-wine">
          <Sparkles size={14} strokeWidth={1.5} /> Beauty essentials for professionals
        </span>
        <h1 className="font-display text-[clamp(44px,12vw,64px)] font-normal leading-[.96] tracking-[-.03em]">
          Tu talento merece herramientas <em className="text-wine">extraordinarias.</em>
        </h1>
        <div className="relative mb-14 h-[clamp(380px,110vw,520px)]">
          <div className="absolute inset-0 overflow-hidden rounded rounded-t-[200px]"><Img src={media.heroMain} alt="Campaña Aurelle" label="Foto editorial de campaña" /></div>
          <StarCard className="absolute inset-x-3.5 -bottom-12" compact />
        </div>
        <p className="text-[17px] font-light leading-relaxed">Descubre los productos que transforman cada detalle en una obra de arte.</p>
        <div className="flex flex-col gap-2.5">
          <Link to="/tienda"><Button size="lg" block>Explorar productos</Button></Link>
          <Link to="/#categorias"><Button size="lg" block variant="secondary">Descubrir categorías</Button></Link>
        </div>
      </div>
    </section>
  );

  function StarCard({ className, compact }: { className?: string; compact?: boolean }) {
    return (
      <Link to={`/producto/${star.slug}`} className={cn('flex items-center gap-3.5 rounded-[20px] bg-white/95 p-3.5 shadow-soft backdrop-blur transition-transform hover:-translate-y-0.5', className)}>
        <div className={cn('shrink-0 overflow-hidden rounded-xl', compact ? 'h-[76px] w-16' : 'h-[100px] w-[84px]')}><Img src={star.images[0]} alt={star.name} /></div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[9.5px] font-medium uppercase tracking-[.2em] text-wine"><Sparkles size={13} strokeWidth={1.5} /> Producto estrella</span>
          <span className="font-display text-[17px] leading-tight">{star.name}</span>
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-medium text-wine">{formatCOP(star.price)}</span>
            {star.oldPrice && <span className="text-xs text-muted line-through">{formatCOP(star.oldPrice)}</span>}
          </span>
          {!compact && <span className="mt-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[.16em]">Ver producto <ArrowRight size={14} strokeWidth={1.5} /></span>}
        </div>
      </Link>
    );
  }
}

function Categories() {
  return (
    <section id="categorias" className="container-x scroll-mt-28 bg-white py-[clamp(56px,7vw,110px)]">
      <Reveal>
        <SectionHeading
          eyebrow="01 — Categorías"
          title={<>Todo para tu estación, <em className="text-wine">en un solo lugar.</em></>}
          action={<Link to="/tienda" className="link-underline">Ver toda la tienda <ArrowUpRight size={16} strokeWidth={1.5} /></Link>}
        />
      </Reveal>
      <div className="grid grid-flow-dense auto-rows-[clamp(170px,17vw,250px)] grid-cols-2 gap-[clamp(10px,1.2vw,16px)] md:grid-cols-12">
        {categories.map((c, i) => (
          <CategoryCard key={c.id} category={c} index={i} className={CAT_LAYOUT[i]} large={i === 0 || i === 3 || i === 4} />
        ))}
      </div>
    </section>
  );
}

function Featured() {
  const [tab, setTab] = useState(TABS[0].id);
  const list = products.filter(TABS.find((t) => t.id === tab)!.test).slice(0, 8);
  return (
    <section className="container-x py-[clamp(56px,7vw,110px)]">
      <Reveal>
        <SectionHeading
          eyebrow="02 — Selección"
          title={<>Los esenciales de <em className="text-wine">la temporada</em></>}
          action={
            <div role="tablist" className="flex max-w-full gap-2 overflow-x-auto pb-0.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn('h-[42px] shrink-0 whitespace-nowrap rounded-full border px-[18px] text-[13.5px] transition-colors duration-300',
                    tab === t.id ? 'border-ink bg-ink text-ivory' : 'border-ink/20 hover:border-ink')}
                >
                  {t.label}
                </button>
              ))}
            </div>
          }
        />
      </Reveal>
      <ProductGrid products={list} />
      <div className="mt-[clamp(36px,4vw,56px)] flex justify-center">
        <Link to="/tienda"><Button variant="secondary">Ver todos los productos</Button></Link>
      </div>
    </section>
  );
}

function Campaign() {
  return (
    <section className="container-x overflow-hidden bg-wine py-[clamp(64px,8vw,130px)] text-ivory">
      <div className="grid items-center gap-[clamp(40px,5vw,80px)] lg:grid-cols-2">
        <Reveal className="relative h-[clamp(420px,52vw,680px)]">
          <div className="absolute left-0 top-0 h-[86%] w-[62%] overflow-hidden rounded rounded-t-full"><Img src={media.editMain} alt="The Nail Art Edit" label="Foto de campaña" /></div>
          <div className="absolute bottom-0 right-0 h-[52%] w-[44%] overflow-hidden rounded border-8 border-wine"><Img src={media.editDetail} label="Detalle" /></div>
          <div className="pointer-events-none absolute right-[6%] top-[6%] flex aspect-square w-[clamp(90px,10vw,140px)] items-center justify-center rounded-full border border-ivory/40 text-center font-display text-[clamp(13px,1.2vw,16px)] italic leading-tight">Edición<br />limitada</div>
        </Reveal>
        <Reveal className="flex flex-col gap-7" delay={0.1}>
          <span className="eyebrow text-blush">Colección cápsula</span>
          <h2 className="font-display text-[clamp(56px,8.6vw,150px)] font-normal leading-[.86] tracking-[-.04em]">THE<br /><em className="text-blush">Nail Art</em><br />EDIT</h2>
          <p className="max-w-[440px] text-lg font-light leading-relaxed text-pretty">
            Una colección de productos para profesionales que buscan llevar su creatividad al siguiente nivel: foils cromados, cristales, pinceles de detalle y pigmentos de acabado espejo.
          </p>
          <Link to="/tienda?cat=nail-art-y-decoracion" className="self-start"><Button size="lg" variant="light">Explorar la colección <ArrowRight size={16} strokeWidth={1.5} /></Button></Link>
        </Reveal>
      </div>
    </section>
  );
}

function Brands() {
  return (
    <section id="marcas" className="container-x scroll-mt-28 py-[clamp(56px,7vw,110px)]">
      <Reveal>
        <SectionHeading
          eyebrow="03 — Marcas"
          title={<>Las marcas que eligen <em className="text-wine">las profesionales</em></>}
          action={<Link to="/tienda" className="link-underline">Explorar todas las marcas <ArrowUpRight size={16} strokeWidth={1.5} /></Link>}
        />
      </Reveal>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,42vw),1fr))] border-l border-t border-ink/10">
        {brands.map((b, i) => (
          <Link key={b.slug} to={`/tienda?marca=${b.slug}`} className="flex h-[clamp(120px,11vw,160px)] flex-col items-center justify-center gap-2.5 border-b border-r border-ink/10 transition-colors duration-300 hover:bg-nude">
            <span className={cn('leading-none', BRAND_TYPE[i % BRAND_TYPE.length])}>{b.name}</span>
            <span className="text-[11px] uppercase tracking-[.12em] text-muted">{products.filter((p) => p.brand === b.name).length} productos</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section className="container-x bg-nude py-[clamp(48px,5vw,80px)]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-[clamp(28px,3vw,40px)]">
        {BENEFITS.map(({ Icon, title, text }) => (
          <div key={title} className="flex flex-col gap-3">
            <Icon size={28} strokeWidth={1.2} className="text-wine" />
            <h3 className="font-display text-xl leading-tight">{title}</h3>
            <p className="text-[14.5px] font-light leading-normal">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const submit = () => (isEmail(email) ? setDone(true) : setError('Escribe un correo válido'));
  return (
    <section className="container-x py-[clamp(56px,7vw,110px)]">
      <Reveal className="grid items-center gap-[clamp(32px,5vw,72px)] rounded bg-blush p-[clamp(32px,5vw,72px)] lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <span className="eyebrow">Newsletter</span>
          <h2 className="h-display text-[clamp(36px,4.4vw,62px)] leading-[1.02]">Un mundo de belleza, <em className="text-wine">directamente en tu inbox.</em></h2>
          <p className="max-w-[460px] text-[16.5px] font-light leading-relaxed">
            Recibe lanzamientos antes que nadie, tutoriales de técnica, invitaciones a masterclasses y un 10% de descuento en tu primera compra.
          </p>
        </div>
        {done ? (
          <div className="flex items-center gap-4 rounded-[20px] bg-ivory px-6 py-[22px]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wine text-ivory"><Check size={20} strokeWidth={1.5} /></span>
            <div className="flex flex-col gap-1">
              <span className="font-display text-xl">Ya eres parte de Aurelle</span>
              <span className="text-sm text-muted">Revisa tu correo: te enviamos tu código de bienvenida.</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 rounded-full bg-ivory p-1.5">
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="tu@correo.com" aria-label="Correo electrónico" aria-invalid={!!error} className="h-[50px] min-w-[180px] flex-1 bg-transparent px-5 text-[15.5px] outline-none" />
              <Button onClick={submit} className="h-[50px]">Suscribirme</Button>
            </div>
            {error && <span role="alert" className="pl-5 text-[13px] text-[#7A1D2E]">{error}</span>}
            <span className="pl-5 text-[12.5px]">Sin spam. Puedes darte de baja cuando quieras.</span>
          </div>
        )}
      </Reveal>
    </section>
  );
}
