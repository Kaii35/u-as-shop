import { Prisma, type PrismaClient } from '@prisma/client';
import { InsufficientStockError, decrementStock } from './inventory.js';

/**
 * Reserva de unidades mientras se cobra.
 *
 * El problema que resuelve: entre que la clienta abre el checkout y su banco
 * aprueba pueden pasar minutos. Sin apartar nada, otra clienta compra la
 * última unidad en ese hueco y acabamos con un pago aprobado de algo que ya no
 * existe — lo peor que puede pasar en una tienda, porque hay que devolver el
 * dinero y dar explicaciones.
 *
 * Por eso `Product` tiene dos columnas y no una:
 *
 *   stock    = unidades que hay FÍSICAMENTE en la bodega
 *   reserved = unidades ya comprometidas con un cobro sin resolver
 *   vendible = stock − reserved
 *
 * `stock` no baja al reservar. Baja cuando el pago se aprueba, y ahí sí deja
 * su movimiento de inventario. Así el historial sigue contando solo ventas de
 * verdad, y una reserva abandonada no ensucia nada.
 */

type Tx = Prisma.TransactionClient;
export type Client = PrismaClient | Tx;

export interface ReservationLine {
  readonly productId: string;
  readonly quantity: number;
}

/**
 * Aparta unidades. Lanza `InsufficientStockError` si no alcanzan.
 *
 * La condición `stock - reserved >= cantidad` va DENTRO del UPDATE a
 * propósito. Leer primero y escribir después deja una rendija entre las dos
 * consultas por la que se cuelan dos compras simultáneas de la última unidad;
 * dentro del UPDATE, Postgres lo resuelve de forma atómica y la segunda
 * simplemente no afecta ninguna fila.
 */
export async function holdStock(tx: Tx, lines: readonly ReservationLine[]): Promise<void> {
  for (const line of lines) {
    if (line.quantity <= 0) throw new Error('La cantidad a reservar debe ser mayor que cero.');

    const affected = await tx.$executeRaw`
      UPDATE products
         SET reserved = reserved + ${line.quantity}
       WHERE id = ${line.productId}
         AND stock - reserved >= ${line.quantity}`;

    if (affected === 0) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { sku: true, stock: true, reserved: true },
      });
      throw new InsufficientStockError(
        product?.sku ?? line.productId,
        line.quantity,
        Math.max(0, (product?.stock ?? 0) - (product?.reserved ?? 0)),
      );
    }
  }
}

/**
 * Devuelve las unidades apartadas sin tocar el stock físico: nunca salieron de
 * la bodega.
 *
 * El `GREATEST(0, …)` es una red, no un adorno. Si por un fallo el contador
 * quedara descuadrado, restar a ciegas lo dejaría negativo y entonces
 * `stock − reserved` daría MÁS de lo que hay, que es justo el error que toda
 * esta mecánica existe para evitar.
 */
export async function releaseStock(tx: Tx, lines: readonly ReservationLine[]): Promise<void> {
  for (const line of lines) {
    await tx.$executeRaw`
      UPDATE products
         SET reserved = GREATEST(0, reserved - ${line.quantity})
       WHERE id = ${line.productId}`;
  }
}

/**
 * El pago se aprobó: las unidades dejan de estar apartadas y salen de bodega.
 *
 * Las dos cosas van juntas y en la misma transacción. Soltar la reserva sin
 * descontar dejaría el producto a la venta cuando ya se vendió; descontar sin
 * soltar lo contaría dos veces y lo escondería del catálogo teniéndolo.
 *
 * El descuento pasa por `decrementStock`, el mismo servicio que usa el resto
 * del sistema, para que la venta deje su movimiento `SALE` y el historial
 * siga cuadrando con la columna.
 */
export async function consumeReservation(
  tx: Tx,
  lines: readonly ReservationLine[],
  context: { readonly orderId: string; readonly reason?: string },
): Promise<void> {
  await releaseStock(tx, lines);
  for (const line of lines) {
    await decrementStock(tx, {
      productId: line.productId,
      quantity: line.quantity,
      type: 'SALE',
      orderId: context.orderId,
      reason: context.reason ?? null,
    });
  }
}

/** Las líneas de un pedido en la forma que espera este módulo. */
export async function orderLines(
  client: Client,
  orderId: string,
): Promise<readonly ReservationLine[]> {
  const items = await client.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  return items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
}

/**
 * Cuántas unidades se pueden vender hoy de cada producto.
 *
 * Es `stock − reserved`, y es el número que debería mirar cualquier cosa que
 * decida si se puede comprar algo. El catálogo público sigue mostrando `stock`
 * a propósito: a la clienta le importa que haya, no cuántas están en el
 * carrito de otra persona a medio pagar.
 */
export async function availableStock(
  client: Client,
  productIds: readonly string[],
): Promise<Map<string, number>> {
  const products = await client.product.findMany({
    where: { id: { in: [...productIds] } },
    select: { id: true, stock: true, reserved: true },
  });
  return new Map(products.map((p) => [p.id, Math.max(0, p.stock - p.reserved)]));
}
