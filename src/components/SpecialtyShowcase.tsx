import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Category, Product } from '../types';

/**
 * "Explora por especialidad": una tarjeta por especialidad, cada una con un
 * producto protagonista, tres miniaturas de otros productos y su recuento.
 *
 * En escritorio van las cinco en fila; en celular son un carrusel horizontal
 * con "scroll-snap" que deja asomar la siguiente tarjeta, así se entiende que
 * se desliza. Movimiento discreto: entrada en cascada y zoom suave al pasar.
 */

interface Specialty {
  id: string;
  name: string;
  tagline: string;
  /** Ids de categoría del catálogo real (prefijo ns-). */
  cats: string[];
  /** Producto protagonista preferido; si no existe se usa el primero. */
  hero: string;
}

const SPECIALTIES: Specialty[] = [
  { id: 'gel', name: 'Manicura en gel', tagline: 'Rubber, builder, polygel y tips.', cats: ['ns-geles', 'ns-tips'], hero: 'ns-rubber-gel-ilu' },
  { id: 'art', name: 'Nail art', tagline: 'Glitter, cristales y pinceles de detalle.', cats: ['ns-decoracion', 'ns-pinceles'], hero: 'ns-torre-glitter' },
  { id: 'tools', name: 'Herramientas', tagline: 'Alicates, fresas, limas y lámparas.', cats: ['ns-instrumental', 'ns-fresas', 'ns-limas', 'ns-equipos'], hero: 'ns-alicate-opalo' },
  { id: 'lash', name: 'Pestañas y cejas', tagline: 'Extensiones, pinzas y adhesivo.', cats: ['ns-pestanas'], hero: 'ns-pestanas-w-5d-bplus' },
  { id: 'spa', name: 'Spa y cuidado', tagline: 'Exfoliantes, mantequillas y velas.', cats: ['ns-spa'], hero: 'ns-mantequilla-vive' },
];

/** Intercala productos de varias categorías para que la muestra sea variada. */
function interleave(groups: Product[][]): Product[] {
  const out: Product[] = [];
  for (let i = 0; groups.some((g) => i < g.length); i += 1) {
    for (const g of groups) if (g[i]) out.push(g[i]);
  }
  return out;
}

export function SpecialtyShowcase({ categories, products }: { categories: Category[]; products: Product[] }) {
  const reduce = useReducedMotion();

  const data = useMemo(
    () =>
      SPECIALTIES.map((s) => {
        const all = interleave(s.cats.map((c) => products.filter((p) => p.categoryId === c)));
        const hero = all.find((p) => p.id === s.hero) ?? all[0];
        const thumbs = all.filter((p) => p !== hero).slice(0, 3);
        const slugs = s.cats.map((c) => categories.find((x) => x.id === c)?.slug).filter(Boolean).join(',');
        return { ...s, hero, thumbs, count: all.length, href: `/tienda?cat=${slugs}` };
      }).filter((s) => s.hero),
    [categories, products],
  );

  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
      {data.map((s, i) => (
        <motion.div
          key={s.id}
          className="w-[72%] shrink-0 snap-start sm:w-[44%] md:w-auto"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1], delay: i * 0.07 }}
        >
          <Link to={s.href} className="group flex h-full flex-col gap-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-line bg-sand">
              <img
                src={s.hero.images[0]}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.05]"
              />
              <span className="absolute left-2.5 top-2.5 rounded-full bg-surface/90 px-2.5 py-1 text-meta font-semibold text-ink backdrop-blur-sm">
                {s.count} productos
              </span>
            </div>

            <div className="flex flex-col gap-1 px-0.5">
              <h3 className="display text-h5 leading-tight text-ink">{s.name}</h3>
              <p className="text-cap text-mist">{s.tagline}</p>
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 px-0.5">
              <span className="flex items-center">
                {s.thumbs.map((p, k) => (
                  <span
                    key={p.id}
                    className="h-8 w-8 overflow-hidden rounded-full border-2 border-canvas-sunk bg-sand"
                    style={{ marginLeft: k ? -8 : 0, zIndex: 3 - k }}
                  >
                    <img src={p.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </span>
                ))}
                {s.count > s.thumbs.length + 1 && (
                  <span className="ml-1.5 text-meta font-medium text-mist">+{s.count - s.thumbs.length - 1}</span>
                )}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink transition-colors duration-300 group-hover:border-ink group-hover:bg-ink group-hover:text-canvas">
                <ArrowRight size={14} strokeWidth={2} />
              </span>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
