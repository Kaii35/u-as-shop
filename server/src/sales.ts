import { OrderStatus } from '@prisma/client';

/**
 * Qué cuenta como venta. Vive en un solo sitio porque lo usan el dashboard,
 * el listado de pedidos y las estadísticas de promociones, y si cada uno
 * decidiera por su cuenta el panel mostraría tres ingresos distintos para el
 * mismo mes — que es la forma más rápida de que nadie vuelva a creerle.
 *
 * PENDING queda fuera: todavía no se pagó. CANCELLED y REFUNDED también:
 * esa plata no entró o se devolvió, y sumarla infla el reporte.
 */
export const SOLD_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
] as const;

/** Filtro listo para meter en un `where` de Prisma. */
export const soldWhere = { status: { in: [...SOLD_STATUSES] } };

/**
 * Margen de un pedido.
 *
 * El envío se resta porque no es venta de mercancía: se le cobra a la clienta
 * y se le paga a la transportadora, así que dejarlo dentro haría parecer más
 * rentable justo al pedido que más costó despachar.
 */
export const orderMargin = (o: { total: number; shipping: number; cost: number }): number =>
  o.total - o.shipping - o.cost;

/**
 * Variación porcentual con un decimal.
 *
 * Devuelve `null` cuando el periodo anterior fue cero: no existe el porcentaje
 * de crecimiento sobre nada, y poner 100 % le haría creer a la dueña que
 * duplicó algo cuando en realidad empezó de cero.
 */
export function changePct(value: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((value - previous) / previous) * 1000) / 10;
}

/** KPI con su comparación contra el periodo anterior de la misma duración. */
export interface Kpi {
  value: number;
  previous: number;
  changePct: number | null;
}

export const kpi = (value: number, previous: number): Kpi => ({
  value,
  previous,
  changePct: changePct(value, previous),
});
