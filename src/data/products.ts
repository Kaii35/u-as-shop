import type { Product, Shade } from '../types';
import { getCategory } from './categories';

export const brands = [
  'Velours Pro',
  'Nácar Lab',
  'Atelier Nº9',
  'Lumière Gel',
  'Solenne',
  'Kirei',
  'Maré Cosmetics',
  'Oriel Lash',
] as const;

const semi: Shade[] = [
  { name: 'Rosé Silk', hex: '#D9A5AE' },
  { name: 'Nude Veil', hex: '#E3C1B3' },
  { name: 'Milk Bath', hex: '#F1E6DF' },
  { name: 'Cherry Lacquer', hex: '#9E1F36' },
  { name: 'Bordeaux', hex: '#5E2433' },
  { name: 'Mocha', hex: '#7A5347' },
  { name: 'Noir', hex: '#242124' },
];
const rubber: Shade[] = [
  { name: 'Cover Pink', hex: '#EBC3C6' },
  { name: 'Clear', hex: '#F4F1EE' },
  { name: 'Milky White', hex: '#F5EFE8' },
  { name: 'Peach', hex: '#EDBBA6' },
];
const poly: Shade[] = [
  { name: 'Nude Rose', hex: '#E3B7B0' },
  { name: 'Soft Beige', hex: '#E6CDB5' },
  { name: 'Clear', hex: '#F2EFEC' },
  { name: 'Cover Mauve', hex: '#C99AA3' },
];
const skin: Shade[] = [
  { name: 'N10 Porcelana', hex: '#F1D6C6' },
  { name: 'N20 Marfil', hex: '#E6C3A8' },
  { name: 'N30 Miel', hex: '#CFA07C' },
  { name: 'N40 Canela', hex: '#A87555' },
  { name: 'N50 Cacao', hex: '#7A4E36' },
];
const chrome: Shade[] = [
  { name: 'Silver', hex: '#C9CBD0' },
  { name: 'Rosé Gold', hex: '#D4A08E' },
  { name: 'Aurora', hex: '#C7B8E0' },
];

export const products: Product[] = [
  { id: 'p1', slug: 'esmalte-semipermanente-rose-silk', name: 'Esmalte semipermanente Rosé Silk', brand: 'Velours Pro', categoryId: 'semipermanentes', price: 32900, oldPrice: 39900, rating: 4.9, reviews: 312, stock: 24, tags: ['best', 'pro'], content: '15 ml', shades: semi },
  { id: 'p2', slug: 'builder-gel-clear-sculpt', name: 'Builder Gel Clear Sculpt', brand: 'Lumière Gel', categoryId: 'gel-acrilico-polygel', price: 32900, rating: 4.8, reviews: 198, stock: 12, tags: ['best', 'pro'], content: 'Según presentación', sizes: [{ label: '15 g', price: 32900 }, { label: '30 g', price: 49900 }, { label: '50 g', price: 68900 }] },
  { id: 'p3', slug: 'lampara-uv-led-aura-48w', name: 'Lámpara UV/LED Aura 48W', brand: 'Atelier Nº9', categoryId: 'herramientas', price: 219900, oldPrice: 259900, rating: 4.7, reviews: 86, stock: 5, tags: ['pro'], content: '1 unidad' },
  { id: 'p4', slug: 'kit-polygel-nude-collection', name: 'Kit polygel Nude Collection', brand: 'Nácar Lab', categoryId: 'gel-acrilico-polygel', price: 124900, rating: 4.8, reviews: 64, stock: 9, tags: ['new'], content: '4 × 30 g', shades: poly },
  { id: 'p5', slug: 'set-pinceles-nail-art-7', name: 'Set de pinceles Nail Art · 7 piezas', brand: 'Atelier Nº9', categoryId: 'nail-art', price: 45900, rating: 4.9, reviews: 141, stock: 30, tags: ['best'], content: '7 pinceles' },
  { id: 'p6', slug: 'top-coat-no-wipe-glass', name: 'Top coat No-Wipe Glass', brand: 'Velours Pro', categoryId: 'unas-manicura', price: 29900, rating: 4.9, reviews: 405, stock: 50, tags: ['best', 'pro'], content: '15 ml' },
  { id: 'p7', slug: 'extensiones-pestanas-volume-007', name: 'Extensiones de pestañas Volume 0.07', brand: 'Oriel Lash', categoryId: 'pestanas-cejas', price: 54900, oldPrice: 64900, rating: 4.6, reviews: 77, stock: 0, tags: ['pro'], content: '16 líneas', sizes: [{ label: 'Curva C' }, { label: 'Curva D' }, { label: 'Curva CC' }] },
  { id: 'p8', slug: 'aceite-cuticula-almendra-rosa', name: 'Aceite de cutícula Almendra & Rosa', brand: 'Solenne', categoryId: 'manos-pies', price: 24900, rating: 4.8, reviews: 219, stock: 40, tags: ['new'], content: '12 ml' },
  { id: 'p9', slug: 'foils-holograficos-chrome-edit', name: 'Foils holográficos Chrome Edit', brand: 'Kirei', categoryId: 'nail-art', price: 19900, oldPrice: 26900, rating: 4.5, reviews: 58, stock: 18, tags: ['new'], content: '10 rollos', shades: chrome },
  { id: 'p10', slug: 'torno-profesional-silk-35000', name: 'Torno profesional Silk 35.000 RPM', brand: 'Atelier Nº9', categoryId: 'herramientas', price: 389900, rating: 4.8, reviews: 42, stock: 3, tags: ['pro'], content: '1 unidad + 6 fresas' },
  { id: 'p11', slug: 'base-rubber-cover', name: 'Base rubber Cover', brand: 'Lumière Gel', categoryId: 'unas-manicura', price: 36900, rating: 4.9, reviews: 267, stock: 22, tags: ['best', 'pro'], content: '15 ml', shades: rubber },
  { id: 'p12', slug: 'base-maquillaje-skin-veil', name: 'Base de maquillaje Skin Veil', brand: 'Maré Cosmetics', categoryId: 'maquillaje', price: 79900, oldPrice: 94900, rating: 4.6, reviews: 93, stock: 14, tags: ['new'], content: '30 ml', shades: skin },
  { id: 'p13', slug: 'crema-manos-cashmere', name: 'Crema de manos Cashmere', brand: 'Solenne', categoryId: 'manos-pies', price: 42900, rating: 4.7, reviews: 110, stock: 25, tags: [], content: '250 ml' },
  { id: 'p14', slug: 'organizador-acrilico-esmaltes', name: 'Organizador acrílico de esmaltes', brand: 'Kirei', categoryId: 'accesorios', price: 89900, rating: 4.5, reviews: 31, stock: 7, tags: ['new'], content: '48 espacios' },
  { id: 'p15', slug: 'kit-lash-lift-profesional', name: 'Kit Lash Lift profesional', brand: 'Oriel Lash', categoryId: 'pestanas-cejas', price: 139900, rating: 4.8, reviews: 56, stock: 6, tags: ['pro'], content: '12 servicios' },
  { id: 'p16', slug: 'cristales-mix-1440', name: 'Cristales mix · 1.440 unidades', brand: 'Kirei', categoryId: 'nail-art', price: 64900, oldPrice: 74900, rating: 4.7, reviews: 88, stock: 11, tags: [], content: '12 tamaños' },
];

export const getProduct = (id: string) => products.find((p) => p.id === id);
export const getProductBySlug = (slug: string) => products.find((p) => p.slug === slug);

export const productRef = (p: Product) =>
  `${p.brand.replace(/[^A-Z]/g, '').slice(0, 2)}-${1000 + parseInt(p.id.slice(1), 10) * 37}`;

export const productCopy = (p: Product) => getCategory(p.categoryId)?.copy ?? { description: '', usage: '' };

export function searchProducts(term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return products;
  return products.filter((p) =>
    `${p.name} ${p.brand} ${getCategory(p.categoryId)?.name ?? ''}`.toLowerCase().includes(t),
  );
}

export function relatedProducts(p: Product, limit = 4) {
  const near = products.filter((x) => x.id !== p.id && (x.categoryId === p.categoryId || x.brand === p.brand));
  const fill = products.filter((x) => x.id !== p.id && x.tags.includes('best'));
  return [...new Set([...near, ...fill])].slice(0, limit);
}
