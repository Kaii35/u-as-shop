import type { OrderStatus } from '../../lib/admin-types';
import type { Tone } from '../../components/admin/Primitives';

/**
 * Espejo de la tabla de transiciones del servidor (`server/src/routes/orders.ts`).
 *
 * Existe para que el panel ofrezca SOLO lo que la API acepta: un desplegable
 * con los siete estados invitaría a intentar cosas que terminan en 400 después
 * de que la dueña ya decidió. Si la tabla del servidor cambia, esta cambia con
 * ella; el servidor sigue siendo el que manda, esto solo evita el viaje en balde.
 */

export type StockEffect = 'none' | 'consume' | 'restore';

export interface Transition {
  readonly to: OrderStatus;
  /** Lo que hace la dueña, no el nombre del estado. */
  readonly action: string;
  readonly effect: StockEffect;
  /** Qué le pasa al stock, en palabras, con las unidades de ESTE pedido. */
  readonly note: (units: number, refs: number) => string;
  readonly danger?: boolean;
}

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('es-CO')} ${n === 1 ? one : many}`;

const units = (n: number): string => plural(n, 'unidad', 'unidades');
const refs = (n: number): string => plural(n, 'referencia', 'referencias');

const consume: Transition['note'] = (u, r) =>
  `Se van a descontar ${units(u)} de bodega, de ${refs(r)}. Si alguna no alcanza, el pedido se queda como está y no se descuenta nada.`;

const restore: Transition['note'] = (u, r) =>
  `Las ${units(u)} de ${refs(r)} vuelven a bodega y quedan otra vez disponibles para vender.`;

const alreadyOut: Transition['note'] = (u) =>
  `El stock no cambia: las ${units(u)} ya salieron de bodega cuando el pedido se marcó como pagado.`;

/** Cierra la venta saltandose alistamiento y despacho. */
const handedOver: Transition['note'] = (u) =>
  `Cierra la venta sin pasar por alistamiento ni despacho. El stock no cambia: las ${units(u)} ya salieron cuando se marco como pagado.`;

const neverOut: Transition['note'] = () =>
  'El stock no se toca: este pedido nunca descontó nada porque todavía no se había pagado.';

export const TRANSITIONS: Readonly<Record<OrderStatus, readonly Transition[]>> = {
  PENDING: [
    { to: 'PAID', action: 'Marcar como pagado', effect: 'consume', note: consume },
    { to: 'CANCELLED', action: 'Anular pedido', effect: 'none', note: neverOut, danger: true },
  ],
  PAID: [
    { to: 'PREPARING', action: 'Empezar a alistar', effect: 'none', note: alreadyOut },
    // Atajo para la entrega en mano del mismo dia: cierra la venta sin pasar
    // por dos estados que en ese caso nunca ocurrieron.
    { to: 'DELIVERED', action: 'Entregado ya', effect: 'none', note: handedOver },
    { to: 'CANCELLED', action: 'Anular pedido', effect: 'restore', note: restore, danger: true },
  ],
  PREPARING: [
    { to: 'SHIPPED', action: 'Marcar como despachado', effect: 'none', note: alreadyOut },
    { to: 'DELIVERED', action: 'Entregado ya', effect: 'none', note: handedOver },
    { to: 'CANCELLED', action: 'Anular pedido', effect: 'restore', note: restore, danger: true },
  ],
  SHIPPED: [
    { to: 'DELIVERED', action: 'Marcar como entregado', effect: 'none', note: alreadyOut },
    { to: 'REFUNDED', action: 'Registrar devolución', effect: 'restore', note: restore, danger: true },
  ],
  DELIVERED: [
    { to: 'REFUNDED', action: 'Registrar devolución', effect: 'restore', note: restore, danger: true },
  ],
  // Cerrados. El contrato es explícito: no se reabren, se crea un pedido nuevo.
  CANCELLED: [],
  REFUNDED: [],
};

/** Color del distintivo de estado. El texto ya dice cuál es; esto solo ordena la vista. */
export const STATUS_TONE: Readonly<Record<OrderStatus, Tone>> = {
  PENDING: 'warn',
  PAID: 'clay',
  PREPARING: 'clay',
  SHIPPED: 'info',
  DELIVERED: 'ok',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
};

/** Cuántas unidades mueve el pedido: es lo que se empaca y lo que descuenta stock. */
export const countUnits = (items: ReadonlyArray<{ quantity: number }>): number =>
  items.reduce((sum, item) => sum + item.quantity, 0);
