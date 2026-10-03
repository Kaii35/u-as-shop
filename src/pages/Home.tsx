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
import { TypePortal } from '../components/TypePortal';
import { BrandLogo } from '../components/ui/BrandLogo';
import type { ProductTag } from '../types';

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
    <section className="relative isolate overflow-hidden">
      {/* Fondo en tres capas, todas decorativas y por detras del contenido:
          un degradado calido que arranca en el tinte de marca, dos halos
          difusos que dan profundidad, y una reticula de puntos muy tenue
          con mascara para que se desvanezca por los bordes en vez de
          cortarse en seco.

          El degradado cierra en `canvas`, no en blanco: tiene que fundirse con
          el fondo de pagina, y en oscuro ese fondo es carbon. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-clay-soft via-sand to-canvas" />
      {/* El halo de acento se mide sobre lo que hay detras: en oscuro `clay`
          sube de luminosidad y al 20% se convertia en una mancha naranja que
          competia con el titular, asi que ahi pesa la mitad. */}
      <div className="absolute -left-24 top-0 -z-10 h-[420px] w-[420px] rounded-full bg-clay/20 blur-[130px] dark:bg-clay/10" />
      {/* El segundo halo va en `clay-soft`, que en oscuro ya es un marron
          profundo: aporta temperatura sin aclarar la zona. */}
      <div className="absolute -right-20 bottom-0 -z-10 h-[380px] w-[380px] rounded-full bg-clay-soft blur-[110px]" />
      {/*
         La reticula llevaba el hex `#141110` incrustado y en oscuro eran puntos
         negros sobre carbon: invisibles. Un valor arbitrario no acepta un token
         de Tailwind, pero si acepta la variable CSS en crudo, asi que el punto
         es `rgb(var(--ink))` y cambia de tema solo, sin variante `dark:`.
         La opacidad si sube un punto: un punto claro al 7% sobre carbon se
         percibe mas tenue que uno oscuro al 7% sobre crema.
      */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(circle,rgb(var(--ink))_1px,transparent_1px)] [background-size:20px_20px] [-webkit-mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_78%)] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_78%)] dark:opacity-[0.1]"
      />

      <div className="container-x">
        <MinimalistHero
          className="h-auto min-h-[520px] px-0 py-8 md:min-h-[600px] md:px-0 md:py-10"
          showHeader={false}
          showFooter={false}
          logoText="Natalia Sánchez"
          navLinks={[]}
          socialLinks={[]}
          locationText=""
          mainText="Esmaltes, geles, herramientas y nail art de las marcas que usan las profesionales. Envíos a toda Colombia."
          readMoreLink="/tienda"
          imageSrc="/images/editorial/hero-portrait.jpg"
          imageAlt="Manos con manicura profesional"
          imageShape="circle"
          // El disco de acento es una superficie, no un blanco literal: en
          // oscuro tiene que quedar un escalon por encima del fondo, no brillar.
          accentClassName="bg-surface/70"
          overlayText={{ part1: 'menos', part2: 'es más.' }}
          actions={
            <div className="mt-5 flex flex-col items-center gap-5 md:items-start">
              <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                <Link to="/tienda"><Button size="lg">Ver catálogo <ArrowRight size={15} strokeWidth={2} /></Button></Link>
                <Link to="/tienda?oferta=1"><Button size="lg" variant="secondary">Ofertas</Button></Link>
              </div>
              <dl className="flex gap-6">
                {[[`${products.length}`, 'productos'], [`${categories.length}`, 'categorías'], [`${brands.length}`, 'marcas']].map(([n, l]) => (
                  <div key={l} className="flex flex-col">
                    <dt className="tnum display text-h5 leading-none">{n}</dt>
                    <dd className="text-meta text-mist">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
          }
          onReadMore={() => navigate('/tienda')}
        />
      </div>
    </section>
  );
}

/**
 * Sección de promesas de la tienda, con el portal tipográfico por delante.
 *
 * Va sobre fondo oscuro a propósito: es el único corte de contraste entre el
 * banner y el catálogo, y hace que las garantías se lean como una declaración
 * de marca y no como un pie de página.
 *
 * El portal vive aquí y no en el banner precisamente por ese corte. La palabra
 * se recorta sobre el fondo de página y por el hueco de las letras asoma esta
 * misma franja, así que la cámara entra al sitio al que la portada ya iba, sin
 * costura de luminancia. En el banner habría metido dos pantallas de scroll
 * fijado por delante de los botones de compra; aquí no le quita el sitio a nada.
 *
 * La palabra es «OFICIO» por medida: rasterizando la Bodoni Moda 700 real y
 * corriendo sobre ella el mismo algoritmo del componente, su O da la apertura
 * más grande de las candidatas (53 px en escritorio, 14 px en móvil, zoom 48×).
 * «CONFIANZA» se quedaba en 8 px en móvil, que es un pinchazo, no una puerta.
 */
function Promises() {
  return (
    /* La franja va sobre `slab`, que es el relleno por defecto del portal: un
       bloque a sangre oscuro en los DOS temas. No usa `ink` porque `ink` se
       invierte, y una banda crema a lo ancho en mitad de una pagina de carbon
       es el mayor salto de luminancia que puede tener la portada. */
    <TypePortal word="OFICIO" focusChar="O" eyebrow="Por qué Natalia Sánchez" enterLabel="Ver las garantías">
      {/* El rótulo de sección sube al marco de apertura del portal, donde hace
          de contexto de la palabra, así que aquí no se repite. */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 md:mb-7">
        <h2 className="display max-w-xl text-h4 text-on-slab md:text-h3">Comprar aquí es otra cosa</h2>
        <p className="max-w-[46ch] text-body text-on-slab/60">
          Cuatro cosas que damos por sentadas para que tú solo pienses en el servicio.
        </p>
      </div>
      <FeatureCards
        items={PROMISES.map(({ kicker, title, detail, image, Icon }) => ({
          kicker, title, detail, image,
          icon: <Icon size={15} strokeWidth={2} />,
        }))}
      />
    </TypePortal>
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

/**
 * Solo los más vendidos y como mucho cuatro: una fila exacta en la retícula
 * de escritorio. Se quitan las pestañas (novedades, uso profesional, oferta)
 * porque ya hay accesos a esos filtros en el menú y en los banners.
 */
function Featured() {
  const list = products.filter((p) => p.tags.includes('best' as ProductTag)).slice(0, 4);
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
    { img: media.editMain, kicker: 'Colección cápsula', title: 'The Nail Art Edit', text: 'Foils cromados, cristales y pinceles de detalle.', to: '/tienda?cat=nail-art-y-decoracion', cta: 'Explorar' },
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
 * Muro de logos. Los wordmarks viven en BrandLogo y van en currentColor, así
 * que el estado de reposo (gris) y el de foco (tinta) son una sola clase.
 */
function Brands() {
  return (
    <section id="marcas" className="container-x pb-section scroll-mt-24 md:pb-section-lg">
      <SectionHeading
        eyebrow="Marcas"
        title="Marcas que distribuimos"
        action={<Link to="/tienda" className="link-arrow">Ver todas <ArrowRight size={14} strokeWidth={2} /></Link>}
      />
      {/* Sin cuadrícula ni recuentos: solo los wordmarks, centrados en su celda. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
        {brands.map((b) => (
          <Link
            key={b.slug}
            to={`/tienda?marca=${b.slug}`}
            title={b.name}
            className="flex h-[72px] items-center justify-center px-2 text-mist transition-colors duration-300 hover:text-ink"
          >
            {/* A dos columnas en movil la celda deja ~149px utiles y los
                wordmarks mas anchos (Solenne, Lumiere) rozan ese limite:
                se reducen en bloque en vez de arriesgar un recorte. */}
            <BrandLogo name={b.name} className="scale-[0.78] sm:scale-100" />
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
