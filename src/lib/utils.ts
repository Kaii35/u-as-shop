import { useEffect, useState } from 'react';
import type { CartLine, Product, ShippingMethod } from '../types';

export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export const FREE_SHIPPING_FROM = 250_000;
export const SHIPPING_COST: Record<ShippingMethod, number> = { std: 12_900, exp: 24_900, pick: 0 };
export const COUPONS: Record<string, number> = { PRO10: 0.1 };

export const formatCOP = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
export const discountPct = (p: Product) => (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
export const unitPrice = (p: Product, size = 0) => p.sizes?.[size]?.price ?? p.price;
export const hasPriceBySize = (p: Product) => !!p.sizes?.some((s) => s.price);
export const variantLabel = (p: Product, shade = 0, size = 0) =>
  [p.shades?.[shade]?.name, p.sizes?.[size]?.label].filter(Boolean).join(' / ');

export function stockInfo(stock: number) {
  if (stock === 0) return { label: 'Agotado', dot: 'bg-[#B9AEB2]' };
  if (stock <= 6) return { label: `Últimas ${stock} unidades`, dot: 'bg-warn' };
  return { label: 'Disponible', dot: 'bg-ok' };
}

export function computeTotals(
  lines: CartLine[],
  getProduct: (id: string) => Product | undefined,
  discountRate: number,
  method: ShippingMethod = 'std',
) {
  const subtotal = lines.reduce((a, l) => {
    const p = getProduct(l.productId);
    return p ? a + unitPrice(p, l.size) * l.qty : a;
  }, 0);
  const discount = Math.round(subtotal * discountRate);
  const net = subtotal - discount;
  const shipping = !subtotal ? 0 : method === 'std' ? (net >= FREE_SHIPPING_FROM ? 0 : SHIPPING_COST.std) : SHIPPING_COST[method];
  return { subtotal, discount, net, shipping, total: net + shipping, count: lines.reduce((a, l) => a + l.qty, 0) };
}
export type Totals = ReturnType<typeof computeTotals>;

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const digits = (v: string) => v.replace(/\D/g, '');

export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useLockBody(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [locked]);
}

export function useEscape(active: boolean, fn: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && fn();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, fn]);
}
