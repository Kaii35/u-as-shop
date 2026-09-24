import type { CartLine, ShippingMethod } from '../types';
import { getProduct } from '../data/products';
import { unitPrice } from './format';

export const FREE_SHIPPING_THRESHOLD = 250000;

/** Cupones de demostración: código => porcentaje de descuento */
export const COUPONS: Record<string, number> = { PRO10: 0.1 };

export const SHIPPING_OPTIONS: { id: ShippingMethod; label: string; description: string }[] = [
  { id: 'standard', label: 'Estándar', description: '3 a 5 días hábiles · Servientrega' },
  { id: 'express', label: 'Express', description: '24 a 48 horas en ciudades principales' },
  { id: 'pickup', label: 'Recoger en showroom', description: 'Bogotá · Usaquén, disponible en 2 horas' },
];

export function shippingCost(method: ShippingMethod, net: number) {
  if (method === 'pickup') return 0;
  if (method === 'express') return 24900;
  return net >= FREE_SHIPPING_THRESHOLD ? 0 : 12900;
}

export function computeTotals(lines: CartLine[], coupon: string | null, method: ShippingMethod = 'standard') {
  const subtotal = lines.reduce((acc, l) => {
    const p = getProduct(l.productId);
    return p ? acc + unitPrice(p, l.sizeIndex) * l.qty : acc;
  }, 0);
  const discount = coupon ? Math.round(subtotal * (COUPONS[coupon] ?? 0)) : 0;
  const net = subtotal - discount;
  const shipping = subtotal > 0 ? shippingCost(method, net) : 0;
  return {
    subtotal,
    discount,
    net,
    shipping,
    total: net + shipping,
    count: lines.reduce((a, l) => a + l.qty, 0),
    remainingForFree: Math.max(0, FREE_SHIPPING_THRESHOLD - net),
    freeProgress: Math.min(1, net / FREE_SHIPPING_THRESHOLD),
  };
}

export type Totals = ReturnType<typeof computeTotals>;
