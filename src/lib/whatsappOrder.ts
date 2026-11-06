import { whatsappUrl } from '../data/business';
import type { Product } from '../types';
import { formatCOP, hasPriceBySize, unitPrice } from './utils';

/**
 * Lo que se elige antes de "Comprar ahora". `shade` y `size` solo vienen de
 * la ficha, donde la clienta los escoge; desde una tarjeta no hay elección y
 * el mensaje no inventa una.
 */
export interface OrderChoice {
  shade?: number;
  size?: number;
  qty?: number;
}

/**
 * El mensaje que llega al WhatsApp del negocio. Lleva lo justo para
 * responder sin preguntar de vuelta: qué, qué variante, cuántas, a qué
 * precio y el enlace para verlo.
 */
export function orderMessage(p: Product, { shade, size, qty = 1 }: OrderChoice, origin: string): string {
  const variant = [
    shade !== undefined && p.shades?.[shade] ? `Tono: ${p.shades[shade].name}` : null,
    size !== undefined && p.sizes?.[size] ? `Presentación: ${p.sizes[size].label}` : null,
  ].filter(Boolean).join(' / ');

  const unit = unitPrice(p, size ?? 0);
  const price = unit <= 0
    ? 'por confirmar'
    : size === undefined && hasPriceBySize(p)
      // Sin presentación elegida, el precio depende de cuál sea.
      ? `desde ${formatCOP(p.price)}`
      : qty > 1
        ? `${formatCOP(unit)} c/u (total ${formatCOP(unit * qty)})`
        : formatCOP(unit);

  return [
    `Hola, quiero comprar: ${p.name} (${p.brand})`,
    variant || null,
    `Cantidad: ${qty}`,
    `Precio: ${price}`,
    `${origin}/producto/${p.slug}`,
  ].filter(Boolean).join('\n');
}

/** Enlace wa.me listo para abrir en una pestaña nueva. */
export const orderWhatsappUrl = (p: Product, choice: OrderChoice = {}) =>
  whatsappUrl(orderMessage(p, choice, window.location.origin));
