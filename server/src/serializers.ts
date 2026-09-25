import type { Brand, Category, Prisma, Product } from '@prisma/client';

/**
 * Traductores entre la base y lo que espera cada consumidor.
 *
 * Hay dos formas de producto a propósito. La pública es, campo por campo, el
 * `Product` de `src/types.ts` que ya usaba la tienda con datos estáticos: así
 * el catálogo pudo pasar a la base sin tocar ni una página. La de admin es más
 * ancha y enseña costo, margen y mínimos, que a la clienta no le incumben.
 */

export type ProductWithRelations = Product & {
  category: Pick<Category, 'id' | 'name' | 'slug'>;
  brand: Pick<Brand, 'id' | 'name' | 'slug'>;
};

/** Quita tildes y baja a minúsculas. Para slugs y para buscar. */
export const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const slugify = (s: string): string =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

/** Decimal de Prisma a number. Los precios son enteros; esto es para tasas. */
const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d === null || d === undefined ? 0 : Number(d);

/** `shades` y `sizes` son Json: vienen como `unknown` y hay que afirmar forma. */
const jsonArray = <T>(value: Prisma.JsonValue | null): T[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value as T[];
};

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

export const serializeCategory = (c: Category) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  description: c.description,
  image: c.image ?? undefined,
});

export const serializeBrand = (b: Brand) => ({ slug: b.slug, name: b.name });

/**
 * Forma exacta de `Product` en `src/types.ts`. No añadir campos aquí sin
 * mirar ese archivo: la tienda entera tipa contra él.
 */
export const serializeProduct = (p: ProductWithRelations) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  brand: p.brand.name,
  categoryId: p.categoryId,
  price: p.price,
  oldPrice: p.compareAtPrice ?? undefined,
  rating: num(p.rating),
  reviewCount: p.reviewCount,
  stock: p.stock,
  content: p.content,
  ref: p.sku,
  tags: p.tags,
  shades: jsonArray<{ name: string; hex: string }>(p.shades),
  sizes: jsonArray<{ label: string; price?: number }>(p.sizes),
  images: p.images,
  description: p.description,
  usage: p.usage,
});

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export type StockStatus = 'ok' | 'low' | 'out';

export const stockStatus = (stock: number, minStock: number): StockStatus =>
  stock <= 0 ? 'out' : stock <= minStock ? 'low' : 'ok';

export const serializeAdminProduct = (
  p: ProductWithRelations,
  extra: { unitsSold30d?: number } = {},
) => {
  const margin = p.price - p.cost;
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    categoryId: p.categoryId,
    category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
    brandId: p.brandId,
    brand: { id: p.brand.id, name: p.brand.name, slug: p.brand.slug },
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    cost: p.cost,
    taxRate: num(p.taxRate),
    margin,
    // Sobre precio de venta, no sobre costo: es como se lee un margen en
    // retail, y con costo 0 (producto sin costear) daría infinito.
    marginPct: p.price > 0 ? Math.round((margin / p.price) * 1000) / 10 : 0,
    stock: p.stock,
    reserved: p.reserved,
    available: p.stock - p.reserved,
    minStock: p.minStock,
    stockStatus: stockStatus(p.stock, p.minStock),
    active: p.active,
    featured: p.featured,
    tags: p.tags,
    content: p.content,
    description: p.description,
    usage: p.usage,
    images: p.images,
    shades: jsonArray<{ name: string; hex: string }>(p.shades) ?? [],
    sizes: jsonArray<{ label: string; price?: number }>(p.sizes) ?? [],
    rating: num(p.rating),
    reviewCount: p.reviewCount,
    ...(extra.unitsSold30d === undefined ? {} : { unitsSold30d: extra.unitsSold30d }),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

/** `include` que deja un producto listo para cualquiera de los dos. */
export const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
} as const;
