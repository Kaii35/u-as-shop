import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CreditCard, Headset, ShieldCheck, Truck } from 'lucide-react';
import { brands, categories, media, products } from '../data/catalog';
import { cn, isEmail } from '../lib/utils';
import { CategoryCard } from '../components/CategoryCard';
import { ProductGrid } from '../components/ProductCard';
import { Button } from '../components/ui/Button';
import { Reveal } from '../components/ui/Overlays';
import { Img, SectionHeading } from '../components/ui/Primitives';
import { MinimalistHero } from '@/components/ui/minimalist-hero';
import type { ProductTag } from '../types';

const TABS: Array<{ id: string; label: string; test: (p: (typeof products)[number]) => boolean }> = [
  { id: 'best', label: 'Más vendidos', test: (p) => p.tags.includes('best' as ProductTag) },
  { id: 'new', label: 'Novedades', test: (p) => p.tags.includes('new') },
  { id: 'pro', label: 'Uso profesional', test: (p) => p.tags.includes('pro') },
  { id: 'sale', label: 'En oferta', test: (p) => !!p.oldPrice },
];

const BENEFITS = [
  { Icon: Truck, title: 'Envío gratis desde $250.000', text: 'A toda Colombia · Express en ciudades principales' },
  { Icon: CreditCard, title: 'Paga como prefieras', text: 'Tarjeta, PSE, Nequi, Daviplata o contra entrega' },
  { Icon: ShieldCheck, title: 'Producto original', text: 'Distribuidor autorizado · Garantía de 12 meses' },
  { Icon: Headset, title: 'Asesoría técnica', text: 'Por WhatsApp, de lunes a sábado' },
];

export default function Home() {
  return (
    <>
      <Hero />
      <BenefitStrip />
      <Categories />
      <Featured />
      <Promos />
      <Brands />
      <Newsletter />
    </>
  );
}

/**
 * Banner de entrada (componente MinimalistHero).
 *
 * Se apagan su cabecera y su pie: la tienda ya tiene header con buscador,
 * carrito y cuenta, y footer propio, así que mostrarlos duplicaría el menú.
 * El círculo va en terracota de marca en vez del amarillo del original, y la
 * foto se enmascara en círculo porque el catálogo son fotos rectangulares,
 * no recortes PNG con fondo transparente.
 */
function Hero() {
  const navigate = useNavigate();
  return (
    <div className="container-x">
      <MinimalistHero
        className="h-auto min-h-[520px] px-0 py-8 md:min-h-[600px] md:px-0 md:py-10"
        showHeader={false}
        showFooter={false}
        logoText="Aurelle"
        navLinks={[]}
        socialLinks={[]}
        locationText=""
        mainText="Esmaltes, geles, herramientas y nail art de las marcas que usan las profesionales. Envíos a toda Colombia."
        readMoreLink="/tienda"
        readMoreLabel="Ver catálogo"
        onReadMore={() => navigate('/tienda')}
        imageSrc="/images/editorial/hero-portrait.jpg"
        imageAlt="Manos con manicura profesional"
        imageShape="circle"
        accentClassName="bg-clay-soft"
        overlayText={{ part1: 'menos', part2: 'es más.' }}
      />
    </div>
  );
}

function BenefitStrip() {
  return (
    <section className="container-x pt-4">
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line lg:grid-cols-4">
        {BENEFITS.map(({ Icon, title, text }) => (
          <li key={title} className="flex items-start gap-2.5 bg-white p-3">
            <Icon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-clay" />
            <span className="flex min-w-0 flex-col">
              <span className="text-cap font-semibold leading-tight">{title}</span>
              <span className="text-meta text-mist">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Categories() {
  return (
    <section id="categorias" className="container-x section-y scroll-mt-24">
      <SectionHeading
        eyebrow="Categorías"
        title="Compra por categoría"
        action={<Link to="/tienda" className="link-arrow">Ver toda la tienda <ArrowRight size={14} strokeWidth={2} /></Link>}
      />
      {/* Nueve categorías en una retícula uniforme de 3×3; todas las fotos
          comparten proporción 4:3 para que ninguna se recorte de más. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {categories.map((c, i) => (
          <CategoryCard key={c.id} category={c} large={i === 0} className="aspect-[4/3]" />
        ))}
      </div>
    </section>
  );
}

function Featured() {
  const [tab, setTab] = useState(TABS[0].id);
  const list = products.filter(TABS.find((t) => t.id === tab)!.test).slice(0, 8);
  return (
    <section className="container-x section-y pt-0">
      <SectionHeading eyebrow="Selección" title="Lo más pedido" />
      <div role="tablist" className="mb-5 flex gap-1.5 overflow-x-auto border-b border-line pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 pb-2 text-body transition-colors',
              tab === t.id ? 'border-clay font-medium text-ink' : 'border-transparent text-mist hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ProductGrid products={list} />
      <div className="mt-6 flex justify-center">
        <Link to="/tienda"><Button variant="secondary">Ver todos los productos</Button></Link>
      </div>
    </section>
  );
}

/** Dos banners promocionales en fila. Sustituyen al mural de campaña anterior. */
function Promos() {
  const tiles = [
    { img: media.editMain, kicker: 'Colección cápsula', title: 'The Nail Art Edit', text: 'Foils cromados, cristales y pinceles de detalle.', to: '/tienda?cat=nail-art-y-decoracion', cta: 'Explorar' },
    { img: media.editDetail, kicker: 'Hasta 25% menos', title: 'Ofertas del mes', text: 'Selección de esmaltes y bases con descuento.', to: '/tienda?oferta=1', cta: 'Ver ofertas' },
  ];
  return (
    <section className="container-x pb-section md:pb-section-lg">
      <div className="grid gap-3 md:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.title} to={t.to} className="group relative aspect-[3/2] overflow-hidden rounded-lg border border-line bg-sand md:aspect-[5/2]">
            <div className="absolute inset-0 transition-transform duration-500 ease-soft group-hover:scale-[1.03]">
              <Img src={t.img} alt="" label="Promoción" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/45 to-transparent" />
            <div className="relative flex h-full max-w-[60%] flex-col items-start justify-center gap-1.5 p-5">
              <span className="text-meta font-semibold uppercase tracking-[.1em] text-white/70">{t.kicker}</span>
              <h3 className="display text-h5 text-white md:text-h4">{t.title}</h3>
              <p className="text-cap text-white/75">{t.text}</p>
              <span className="mt-1 inline-flex items-center gap-1.5 text-body font-medium text-white underline-offset-4 group-hover:underline">
                {t.cta} <ArrowRight size={14} strokeWidth={2} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Brands() {
  return (
    <section id="marcas" className="container-x pb-section scroll-mt-24 md:pb-section-lg">
      <SectionHeading
        eyebrow="Marcas"
        title="Marcas que distribuimos"
        action={<Link to="/tienda" className="link-arrow">Ver todas <ArrowRight size={14} strokeWidth={2} /></Link>}
      />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-4">
        {brands.map((b) => (
          <Link
            key={b.slug}
            to={`/tienda?marca=${b.slug}`}
            className="flex h-20 flex-col items-center justify-center gap-0.5 bg-white transition-colors hover:bg-sand"
          >
            <span className="display text-body">{b.name}</span>
            <span className="tnum text-meta text-mist">{products.filter((p) => p.brand === b.name).length} productos</span>
          </Link>
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
    <section className="container-x pb-section md:pb-section-lg">
      <Reveal className="grid items-center overflow-hidden rounded-lg border border-line md:grid-cols-[1fr_220px]">
        <div className="flex flex-col gap-2.5 p-5 md:p-8">
          <span className="kicker">Newsletter</span>
          <h2 className="display text-h4 text-balance">10% en tu primera compra</h2>
          <p className="max-w-[52ch] text-body text-ash">
            Lanzamientos antes que nadie, tutoriales de técnica y precios exclusivos para profesionales.
          </p>
          {done ? (
            <div className="mt-1 flex items-center gap-2.5 rounded border border-ok/25 bg-ok/5 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok text-white"><Check size={15} strokeWidth={2.5} /></span>
              <span className="flex flex-col">
                <span className="text-body font-medium">Ya eres parte de Aurelle</span>
                <span className="text-meta text-mist">Revisa tu correo: te enviamos tu código.</span>
              </span>
            </div>
          ) : (
            <div className="mt-1 flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="tu@correo.com"
                  aria-label="Correo electrónico"
                  aria-invalid={!!error}
                  className={cn(
                    'h-11 min-w-[200px] flex-1 rounded border bg-white px-3 text-body outline-none transition-colors',
                    error ? 'border-danger' : 'border-line focus:border-clay',
                  )}
                />
                <Button size="lg" onClick={submit}>Suscribirme</Button>
              </div>
              {error && <span role="alert" className="text-cap text-danger">{error}</span>}
              <span className="text-meta text-mist">Sin spam. Puedes darte de baja cuando quieras.</span>
            </div>
          )}
        </div>
        <div className="relative hidden h-full min-h-[200px] bg-sand md:block">
          <Img src={media.heroDetail} alt="" label="Detalle" />
        </div>
      </Reveal>
    </section>
  );
}
