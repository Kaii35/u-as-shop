import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { brands, categories, media, products } from '../data/catalog';
import type { Brand } from '../types';
import { BRAND_LOGOS, brandLogoSrc } from '../data/brandLogos';
import { bestSellers, cn, isEmail } from '../lib/utils';
import { CategoryBento } from '../components/CategoryBento';
import { ProductGrid } from '../components/ProductCard';
import { Button } from '../components/ui/Button';
import { Reveal } from '../components/ui/Overlays';
import { Img, SectionHeading } from '../components/ui/Primitives';
import HeroAbanico from '../components/HeroAbanico';
import { SpecialtyShowcase } from '../components/SpecialtyShowcase';
import { PromisesBento } from '../components/PromisesBento';


export default function Home() {
  return (
    <>
      <Hero />
      <Collections />
      <Categories />
      <Promises />
      <Featured />
      <Promos />
      <Brands />
      <Newsletter />
    </>
  );
}

/**
 * Banner de entrada: abanico de uñas animado (HeroAbanico). Los números son
 * los del catálogo real, no fijos.
 */
function Hero() {
  return (
    <HeroAbanico
      catalogHref="/tienda"
      offersHref="/tienda?oferta=1"
      stats={[[products.length, 'productos'], [categories.length, 'categorías'], [brands.length, 'marcas']]}
    />
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
    /* La franja va sobre `slab`: un bloque a sangre que es oscuro en los DOS
       temas. No usa `ink` porque `ink` se invierte, y una banda crema a lo
       ancho en mitad de una pagina de carbon es el mayor salto de luminancia
       que puede tener la portada. */
    <section className="bg-slab text-on-slab">
      <div className="container-x section-y">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 md:mb-7">
          <div className="flex max-w-xl flex-col gap-1.5">
            <span className="text-meta font-semibold uppercase tracking-[.12em] text-clay-soft dark:text-clay">Por qué Natalia Sánchez</span>
            <h2 className="display text-h4 text-on-slab md:text-h3">Comprar aquí es otra cosa</h2>
          </div>
          <p className="max-w-[46ch] text-body text-on-slab/60">
            Cuatro cosas que damos por sentadas para que tú solo pienses en el servicio.
          </p>
        </div>
        <PromisesBento />
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
      <CategoryBento categories={categories} products={products} />
    </section>
  );
}

/** Vitrina por especialidad (SpecialtyShowcase), con productos reales. */
function Collections() {
  return (
    // Banda de fondo, no una tarjeta: `sand` es recesiva en claro pero ELEVADA
    // en oscuro, y la seccion acabaria mas clara que la pagina. `canvas-sunk` es
    // el gris hundido en claro y el propio fondo de pagina en oscuro.
    <section className="bg-canvas-sunk">
      <div className="container-x section-y">
        <SectionHeading
          eyebrow="Colecciones"
          title="Explora por especialidad"
          action={<Link to="/tienda" className="link-arrow">Ver toda la tienda <ArrowRight size={14} strokeWidth={2} /></Link>}
        />
        <SpecialtyShowcase categories={categories} products={products} />
      </div>
    </section>
  );
}

/**
 * Solo los más vendidos y como mucho cuatro: una fila exacta en la retícula
 * de escritorio. Se quitan las pestañas (novedades, uso profesional, oferta)
 * porque ya hay accesos a esos filtros en el menú y en los banners.
 */
function Featured() {
  const list = bestSellers(products, 4);
  return (
    <section className="container-x section-y">
      <SectionHeading
        eyebrow="Selección"
        title="Lo más vendido"
        action={<Link to="/tienda" className="link-arrow">Ver todos los productos <ArrowRight size={14} strokeWidth={2} /></Link>}
      />
      <ProductGrid products={list} />
    </section>
  );
}

/** Dos banners promocionales en fila. Sustituyen al mural de campaña anterior. */
function Promos() {
  const tiles = [
    { img: media.editMain, kicker: 'Colección cápsula', title: 'The Nail Art Edit', text: 'Foils cromados, cristales y pinceles de detalle.', to: '/tienda?cat=decoracion-y-glitter', cta: 'Explorar' },
    { img: media.editDetail, kicker: 'Hasta 25% menos', title: 'Ofertas del mes', text: 'Selección de esmaltes y bases con descuento.', to: '/tienda?oferta=1', cta: 'Ver ofertas' },
  ];
  return (
    <section className="container-x pb-section md:pb-section-lg">
      <div className="grid gap-3 md:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.title} to={t.to} className="group relative aspect-[3/2] overflow-hidden rounded-lg border border-line bg-sand md:aspect-[5/2]">
            <div className="absolute inset-0 transition-transform duration-500 ease-soft group-hover:scale-[1.03]">
              {/* Foto real: lleva `.photo` para que en oscuro baje de brillo. */}
              <Img src={t.img} alt="" label="Promoción" className="photo" />
            </div>
            {/*
               El velo existe para que el texto blanco se lea sobre la foto, asi
               que tiene que ser oscuro en los DOS temas. `ink` lo es en claro
               pero se vuelve crema en oscuro, asi que ahi releva `canvas`, que
               es lo mas oscuro del tema. No es un parche de color: es el mismo
               significado con el token que lo cumple en cada tema.
            */}
            <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/45 to-transparent dark:from-canvas/85 dark:via-canvas/50" />
            {/* tema-ok: todo este bloque se queda en blanco: esta sobre el velo, que es
                oscuro en los dos temas. */}
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

/**
 * Corrección óptica: el alto máximo de cada logo dentro de su caja. Un
 * wordmark muy ancho (Cristal Style) llena la caja a lo ancho; un sello
 * redondo (Vive, The Rose) necesita más alto para pesar lo mismo.
 */
const BRAND_HEIGHT: Record<string, string> = {
  'vive-beauty': 'h-[64px] sm:h-[76px]',
  'the-rose-beauty': 'h-[64px] sm:h-[76px]',
  'beauty-plus': 'h-[56px] sm:h-[66px]',
  ilu: 'h-[52px] sm:h-[62px]',
};

/**
 * Muro de logos, a color. Las tarjetas son claras en los dos temas porque los
 * logos oficiales (tinta negra, dorado, naranja) están hechos para fondo
 * claro; en oscuro quedan como etiquetas sobre la página.
 */
function Brands() {
  const list = BRAND_LOGOS.map(({ slug }) => brands.find((b) => b.slug === slug)).filter((b): b is Brand => !!b);
  return (
    <section id="marcas" className="container-x pb-section scroll-mt-24 md:pb-section-lg">
      <SectionHeading
        eyebrow="Marcas"
        title="Marcas que distribuimos"
        action={<Link to="/tienda" className="link-arrow">Ver todas <ArrowRight size={14} strokeWidth={2} /></Link>}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {list.map((b) => (
            <Link
              key={b.slug}
              to={`/tienda?marca=${b.slug}`}
              title={b.name}
              // tema-ok: tarjeta clara en los dos temas, los logos oficiales son para fondo claro
              className="group flex h-[104px] items-center justify-center rounded border border-line bg-white px-5 transition-[border-color,box-shadow] duration-300 hover:border-ink/30 hover:shadow-card sm:h-[120px]"
            >
              <img
                src={brandLogoSrc(b.slug)}
                alt=""
                loading="lazy"
                className={cn('w-auto max-w-[72%] object-contain transition-transform duration-300 group-hover:scale-105', BRAND_HEIGHT[b.slug] ?? 'max-h-[46px] sm:max-h-[54px]')}
              />
              <span className="sr-only">{b.name}</span>
            </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Banda de newsletter a sangre.
 *
 * La versión anterior ocupaba 426px para pedir un correo. Esta baja a ~260:
 * fuera la lista de beneficios y la columna de foto, que era lo que estiraba
 * el bloque. La foto pasa a fondo a todo el ancho con velo, el mismo recurso
 * que ya usan los banners promocionales de la landing.
 *
 * El velo no es decorativo: es lo único que garantiza contraste del texto
 * blanco sobre la foto, así que cubre toda la banda y no solo la mitad.
 */
function Newsletter() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const submit = () => (isEmail(email) ? setDone(true) : setError('Escribe un correo válido'));

  return (
    // La banda es oscura en los dos temas (ver el velo): el fondo base solo se
    // ve si la foto no carga, y tiene que ser oscuro igual.
    <section className="relative isolate overflow-hidden bg-ink dark:bg-canvas">
      <img
        src="/images/editorial/newsletter.jpg"
        alt=""
        aria-hidden
        // Foto editorial: `.photo` le baja el brillo solo en oscuro.
        className="photo absolute inset-0 h-full w-full object-cover"
      />
      {/*
         Mismo caso que los banners promocionales: el velo es lo unico que
         garantiza el contraste del texto blanco, asi que se mantiene oscuro en
         los dos temas. En claro lo cumple `ink`; en oscuro `ink` es crema y
         releva `canvas`.
      */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/25 md:via-ink/70 md:to-ink/10 dark:from-canvas dark:via-canvas/85 dark:to-canvas/30 md:dark:via-canvas/75 md:dark:to-canvas/15" />

      <Reveal className="container-x relative flex min-h-[260px] flex-col justify-center gap-2.5 py-10">
        {/* Sobre un velo oscuro en los dos temas, `clay-soft` solo sirve en
            tema-ok: el titular y el cuerpo van en blanco sobre el velo oscuro.
            El kicker en cambio NO puede quedarse en `clay-soft`, que solo es
            claro en modo claro: en oscuro es un marron profundo que se pierde. Ahi el acento
            legible es `clay`, que sube de luminosidad justo para esto. */}
        <span className="text-meta font-semibold uppercase tracking-[.12em] text-clay-soft dark:text-clay">Newsletter</span>
        <h2 className="display max-w-[20ch] text-h3 text-white text-balance">10% en tu primera compra</h2>
        <p className="max-w-[44ch] text-body text-white/70">
          Lanzamientos antes que nadie y precios de profesional. Uno o dos correos al mes.
        </p>

        {done ? (
          // El lavado y el aro blancos no son una superficie: son un realce
          // tema-ok: realce
          // translucido sobre el velo oscuro, que lo es en los dos temas. Como
          // superficie (`surface/10`) se volveria un rectangulo gris en claro.
          <div className="mt-1 flex max-w-[420px] items-center gap-2.5 rounded-lg bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur-sm">
            {/* `ok` pasa de verde oscuro a verde claro entre temas y un check
                blanco encima baja a 2,21:1. `on-accent` es el texto de los
                rellenos de estado y pasa en los dos.
                tema-ok: el texto del aviso va en blanco sobre el velo oscuro. */}
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok text-on-accent"><Check size={16} strokeWidth={2.5} /></span>
            <span className="flex flex-col">
              <span className="text-body font-medium text-white">Ya eres parte de Natalia Sánchez</span>
              <span className="text-meta text-white/60">Revisa tu correo: te enviamos tu código.</span>
            </span>
          </div>
        ) : (
          <div className="mt-1 flex max-w-[440px] flex-col gap-1.5">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="tu@correo.com"
                aria-label="Correo electrónico"
                aria-invalid={!!error}
                className={cn(
                  // El campo es una superficie, no un blanco: en oscuro no debe
                  // ser un rectangulo brillante sobre la banda.
                  'h-11 min-w-0 flex-1 rounded border bg-surface px-3 text-body outline-none transition-colors',
                  // Sin borde se perdia: en claro el campo blanco ya destaca
                  // sobre el velo, pero en oscuro superficie y velo estan a dos
                  // pasos de tono y hace falta el filo para ver donde se escribe.
                  error ? 'border-danger' : 'border-transparent focus:border-clay dark:border-line',
                )}
              />
              <Button size="lg" variant="accent" className="shrink-0" onClick={submit}>Suscribirme</Button>
            </div>
            {/* Un aviso de error no puede depender del tema: mismo relevo que el
                kicker, porque esta sobre el mismo velo oscuro.
                tema-ok: la nota de baja va en blanco sobre ese mismo velo. */}
            {error && <span role="alert" className="text-cap text-clay-soft dark:text-clay">{error}</span>}
            <span className="text-meta text-white/50">Sin spam. Puedes darte de baja cuando quieras.</span>
          </div>
        )}
      </Reveal>
    </section>
  );
}
