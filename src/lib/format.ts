import type { Product } from '../types';
import type { BadgeTone } from '../components/ui/Badge';

export const formatCOP = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

export const discountPct = (p: Product) => (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);

export const unitPrice = (p: Product, sizeIndex = 0) => p.sizes?.[sizeIndex]?.price ?? p.price;

export const hasPriceBySize = (p: Product) => !!p.sizes?.some((s) => s.price !== undefined);

export const variantLabel = (p: Product, shadeIndex = 0, sizeIndex = 0) =>
  [p.shades?.[shadeIndex]?.name, p.sizes?.[sizeIndex]?.label].filter(Boolean).join(' / ');

export type StockTone = 'ok' | 'low' | 'out';

export function stockInfo(stock: number): { label: string; tone: StockTone } {
  if (stock === 0) return { label: 'Agotado', tone: 'out' };
  if (stock <= 6) return { label: `Últimas ${stock} unidades`, tone: 'low' };
  return { label: 'Disponible', tone: 'ok' };
}

export const stockDot: Record<StockTone, string> = {
  ok: 'bg-success',
  low: 'bg-warning',
  out: 'bg-muted/50',
};

export function primaryBadge(p: Product): { tone: BadgeTone; label: string } | null {
  if (p.oldPrice) return { tone: 'sale', label: 'Oferta' };
  if (p.tags.includes('new')) return { tone: 'new', label: 'Nuevo' };
  if (p.tags.includes('best')) return { tone: 'best', label: 'Más vendido' };
  return null;
}
