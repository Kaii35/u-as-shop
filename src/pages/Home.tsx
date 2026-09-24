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
import { Component as StackInteractor } from '@/components/ui/connoisseur-stack-interactor';
import { FeatureCards } from '@/components/ui/feature-cards';
import type { ProductTag } from '../types';

const TABS: Array<{ id: string; label: string; test: (p: (typeof products)[number]) => boolean }> = [
  { id: 'best', label: 'Más vendidos', test: (p) => p.tags.includes('best' as ProductTag) },
  { id: 'new', label: 'Novedades', test: (p) => p.tags.includes('new') },
  { id: 'pro', label: 'Uso profesional', test: (p) => p.tags.includes('pro') },
  { id: 'sale', label: 'En oferta', test: (p) => !!p.oldPrice },
];

const PROMISES = [
  { kicker: 'Envíos', title: 'Gratis desde $250.000', detail: 'A toda Colombia · Express en ciudades principales', image: '/images/promesas/envios.jpg', Icon: Truck },
  { kicker: 'Pagos', title: 'Paga como prefieras', detail: 'Tarjeta, PSE, Nequi, Daviplata o contra entrega', image: '/images/promesas/pagos.jpg', Icon: CreditCard },
  { kicker: 'Garantía', title: 'Producto original', detail: 'Distribuidor autorizado · 12 meses', image: '/images/promesas/garantia.jpg', Icon: ShieldCheck },
  { kicker: 'Asesoría', title: 'Soporte técnico real', detail: 'Por WhatsApp, de lunes a sábado', image: '/images/promesas/asesoria.jpg', Icon: Headset },
];

export default function Home() {
  return (
    <>
      <Hero />
      <Promises />
      <Categories />
      <Collections />
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

/**
 * Sección de promesas de la tienda. Sustituye a la tira de iconos, que era
 * una fila de texto pequeño sin jerarquía ni peso visual.
 *
 * Va sobre fondo oscuro a propósito: es el único corte de contraste entre el
 * banner y el catálogo, y hace que las garantías se lean como una declaración
 * de marca y no como un pie de página.
 */
function Promises() {
  return (
    <section className="bg-ink text-white">
      <div className="container-x section-y">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 md:mb-7">
          <div className="flex max-w-xl flex-col gap-1.5">
            <span className="text-meta font-semibold uppercase tracking-[.12em] text-clay-soft">Por qué Aurelle</span>
            <h2 className="display text-h4 text-white md:text-h3">Comprar aquí es otra cosa</h2>
          </div>
          <p className="max-w-[46ch] text-body text-white/60">
            Cuatro cosas que damos por sentadas para que tú solo pienses en el servicio.
          </p>
        </div>
        <FeatureCards
          items={PROMISES.map(({ kicker, title, detail, image, Icon }) => ({
            kicker, title, detail, image,
            icon: <Icon size={15} strokeWidth={2} />,
          }))}
        />
      </div>
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

/**
 * Colecciones destacadas (componente StackInteractor). Tres categorías reales
 * del catálogo; el componente sólo admite tres porque sus clipId están
 * cableados a los tres <clipPath> de su SVG.
 */
function Collections() {
  const navigate = useNavigate();
  return (
    <section className="bg-sand">
      <div className="container-x section-y">
        <SectionHeading
          eyebrow="Colecciones"
          title="Explora por especialidad"
          action={<Link to="/tienda" className="link-arrow">Ver toda la tienda <ArrowRight size={14} strokeWidth={2} /></Link>}
        />
        <StackInteractor
          items={[
            { num: '01', name: 'Esmaltes semipermanentes', clipId: 'clip-original', image: '/images/collections/semipermanentes.jpg', href: '/tienda?cat=esmaltes-semipermanentes' },
            { num: '02', name: 'Nail art y decoración', clipId: 'clip-hexagons', image: '/images/collections/nail-art.jpg', href: '/tienda?cat=nail-art-y-decoracion' },
            { num: '03', name: 'Herramientas y equipos', clipId: 'clip-pixels', image: '/images/collections/herramientas.jpg', href: '/tienda?cat=herramientas-y-equipos' },
          ]}
          onSelect={(item) => item.href && navigate(item.href)}
        />
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
