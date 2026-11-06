import type { Brand, Category, Product } from '../types';

/**
 * Convierte `server/prisma/catalogo-real.json` en el catálogo público de la
 * tienda, sin pasar por la base.
 *
 * Replica, campo por campo, lo que hacen `server/prisma/importar-catalogo.ts`
 * (cómo se carga cada producto) y `serializeProduct` de
 * `server/src/serializers.ts` (qué ve la clienta). Si cambia uno de esos dos,
 * hay que cambiar esto. Nunca lleva costo ni campos internos.
 *
 * Es una función pura y sin imports de ejecución a propósito: la usan la
 * tienda, la validación del build (`vite.config.ts`) y la prueba
 * (`tests/realCatalog.test.ts`), que corre en Node sin compilar.
 *
 * Cualquier inconsistencia LANZA: es preferible que el build falle a publicar
 * una tienda vacía o con el catálogo de ejemplo.
 */

export interface RawCategory {
  id: string;
  nombre: string;
  descripcion: string;
}

export interface RawProduct {
  id: string;
  nombre: string;
  marca: string;
  cat: string;
  contenido: string;
  fotos: number[];
  uso: string;
  desc: string;
  tonos?: Array<[string, string]>;
  tallas?: string[];
  precio?: number;
  opciones?: Array<[string, number]>;
  revisar?: boolean;
}

export interface RawCatalog {
  usos: Record<string, string>;
  categorias: RawCategory[];
  productos: RawProduct[];
}

export interface StoreCatalog {
  categories: Category[];
  brands: Brand[];
  products: Product[];
}

export const REAL_PREFIX = 'ns-';

/** Igual que el `slugify` de `importar-catalogo.ts` (sin recorte a 80). */
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function mapRealCatalog(data: RawCatalog): StoreCatalog {
  if (!data || !Array.isArray(data.categorias) || !Array.isArray(data.productos) || !data.usos) {
    throw new Error('catalogo-real.json no tiene la forma esperada (usos, categorias, productos).');
  }
  if (!data.categorias.length || !data.productos.length) {
    throw new Error('catalogo-real.json está vacío.');
  }

  // Mismas comprobaciones que `loadCatalog()` del importador, más las
  // restricciones únicas de la base (slug, sku), que aquí nadie haría cumplir.
  const catIds = new Set(data.categorias.map((c) => c.id));
  const slugs = new Set<string>();
  for (const p of data.productos) {
    if (!p.id.startsWith(REAL_PREFIX)) throw new Error(`${p.id}: el id debe empezar por "${REAL_PREFIX}".`);
    if (!data.usos[p.uso]) throw new Error(`${p.id}: uso "${p.uso}" no existe.`);
    if (!catIds.has(p.cat)) throw new Error(`${p.id}: categoría "${p.cat}" no existe.`);
    if (!p.nombre?.trim() || !p.marca?.trim()) throw new Error(`${p.id}: falta nombre o marca.`);
    if (!p.fotos?.length) throw new Error(`${p.id}: no tiene fotos.`);
    const slug = slugify(p.nombre);
    if (slugs.has(slug)) throw new Error(`${p.id}: slug "${slug}" repetido.`);
    slugs.add(slug);
  }

  // La API ordena por `order` (posición en el JSON) y la tienda recibe eso.
  const categories: Category[] = data.categorias.map((c) => ({
    id: c.id,
    slug: slugify(c.nombre),
    name: c.nombre,
    description: c.descripcion,
    image: `/images/categories/${c.id}.webp`,
  }));

  // El importador las numera en orden alfabético español.
  const brands: Brand[] = [...new Set(data.productos.map((p) => p.marca))]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((name) => ({ slug: slugify(name), name }));

  // La API ordena por fecha de creación: el orden en que el importador los
  // recorre, que es el del JSON.
  const products: Product[] = data.productos.map((p) => {
    const sizes = p.opciones?.length
      ? p.opciones.map(([label, price]) => ({ label, price }))
      : p.tallas?.length
        ? p.tallas.map((label) => ({ label }))
        : undefined;
    // Precio base = el de lista, que en el JSON ya es el menor de las
    // opciones. Sin él queda en 0, que la tienda pinta como "Precio por
    // confirmar". Igual que el importador.
    const price = p.precio ?? 0;
    return {
      id: p.id,
      slug: slugify(p.nombre),
      name: p.nombre,
      brand: p.marca,
      categoryId: p.cat,
      price,
      oldPrice: undefined,
      rating: 0,
      reviewCount: 0,
      // El importador crea todo con stock 0: el inventario vive en el panel.
      stock: 0,
      content: p.contenido,
      ref: p.id.slice(REAL_PREFIX.length).toUpperCase(),
      tags: [],
      shades: p.tonos?.length ? p.tonos.map(([name, hex]) => ({ name, hex })) : undefined,
      sizes,
      images: p.fotos.map((_, n) => `/images/products/catalogo/${p.id}-${n + 1}.webp`),
      description: p.desc,
      usage: data.usos[p.uso] as string,
    };
  });

  return { categories, brands, products };
}
