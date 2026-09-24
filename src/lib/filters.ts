import type { Product } from '../types';
import { getCategory } from '../data/categories';
import { formatCOP } from './format';

export const MAX_PRICE = 400000;

export interface Filters {
  categories: string[];
  brands: string[];
  maxPrice: number;
  inStock: boolean;
  minRating: number;
  onSale: boolean;
  query: string;
}

export const emptyFilters: Filters = {
  categories: [],
  brands: [],
  maxPrice: MAX_PRICE,
  inStock: false,
  minRating: 0,
  onSale: false,
  query: '',
};

export function filtersFromParams(params: URLSearchParams): Filters {
  return {
    ...emptyFilters,
    categories: params.getAll('categoria'),
    brands: params.getAll('marca'),
    onSale: params.get('ofertas') === '1',
    query: params.get('q') ?? '',
  };
}

export function applyFilters(list: Product[], f: Filters) {
  const q = f.query.trim().toLowerCase();
  return list.filter((p) => {
    if (q && !`${p.name} ${p.brand} ${getCategory(p.categoryId)?.name ?? ''}`.toLowerCase().includes(q)) return false;
    if (f.categories.length && !f.categories.includes(p.categoryId)) return false;
    if (f.brands.length && !f.brands.includes(p.brand)) return false;
    if (p.price > f.maxPrice) return false;
    if (f.inStock && p.stock === 0) return false;
    if (p.rating < f.minRating) return false;
    if (f.onSale && !p.oldPrice) return false;
    return true;
  });
}

export type SortKey = 'relevance' | 'popular' | 'newest' | 'price-asc' | 'price-desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'popular', label: 'Popularidad' },
  { value: 'newest', label: 'Novedades' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
];

const n = (b: boolean) => Number(b);

export function sortProducts(list: Product[], key: SortKey) {
  const arr = [...list];
  switch (key) {
    case 'price-asc': return arr.sort((a, b) => a.price - b.price);
    case 'price-desc': return arr.sort((a, b) => b.price - a.price);
    case 'newest': return arr.sort((a, b) => n(b.tags.includes('new')) - n(a.tags.includes('new')));
    case 'popular': return arr.sort((a, b) => b.reviews - a.reviews);
    default: return arr.sort((a, b) => n(b.tags.includes('best')) - n(a.tags.includes('best')) || b.reviews - a.reviews);
  }
}

export interface FilterChip {
  id: string;
  label: string;
  remove: (f: Filters) => Filters;
}

export function activeChips(f: Filters): FilterChip[] {
  const chips: FilterChip[] = [];
  f.categories.forEach((c) => chips.push({ id: `c-${c}`, label: getCategory(c)?.name ?? c, remove: (x) => ({ ...x, categories: x.categories.filter((v) => v !== c) }) }));
  f.brands.forEach((b) => chips.push({ id: `b-${b}`, label: b, remove: (x) => ({ ...x, brands: x.brands.filter((v) => v !== b) }) }));
  if (f.maxPrice < MAX_PRICE) chips.push({ id: 'price', label: `Hasta ${formatCOP(f.maxPrice)}`, remove: (x) => ({ ...x, maxPrice: MAX_PRICE }) });
  if (f.inStock) chips.push({ id: 'stock', label: 'Disponibles', remove: (x) => ({ ...x, inStock: false }) });
  if (f.minRating) chips.push({ id: 'rating', label: `${f.minRating}★ o más`, remove: (x) => ({ ...x, minRating: 0 }) });
  if (f.onSale) chips.push({ id: 'sale', label: 'En oferta', remove: (x) => ({ ...x, onSale: false }) });
  if (f.query) chips.push({ id: 'q', label: `“${f.query}”`, remove: (x) => ({ ...x, query: '' }) });
  return chips;
}
