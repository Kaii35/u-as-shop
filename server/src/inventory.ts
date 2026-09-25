import { MovementType, type Prisma } from '@prisma/client';

/**
 * Servicio de inventario. TODO cambio de stock pasa por aquí.
 *
 * El punto crítico es no vender lo que no hay. Dos clientas pueden pedir la
 * última unidad en el mismo milisegundo, así que la resta no se hace leyendo
 * el stock y escribiendo después: se hace con un UPDATE condicional
 * (`WHERE stock >= cantidad`), que Postgres resuelve de forma atómica. Si la
 * condición no se cumple, `count` vuelve en 0 y la venta se rechaza — en vez
 * de dejar el stock en negativo y descubrirlo cuando falte mercancía.
 */

export class InsufficientStockError extends Error {
  constructor(
    readonly sku: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Stock insuficiente para ${sku}: pediste ${requested} y hay ${available}.`);
    this.name = 'InsufficientStockError';
  }
}

/** Obliga a usar el servicio dentro de una transacción. */
type Tx = Prisma.TransactionClient;

interface MovementArgs {
  readonly productId: string;
  readonly type: MovementType;
  readonly reason?: string | null;
  readonly orderId?: string | null;
  readonly userId?: string | null;
  readonly unitCost?: number | null;
  /** Fecha del movimiento. Solo el seed la fija; en el panel es siempre ahora. */
  readonly createdAt?: Date;
}

/**
 * Descuenta unidades de forma segura y devuelve el stock resultante.
 * Lanza `InsufficientStockError` si no alcanza.
 */
export async function decrementStock(
  tx: Tx,
  args: MovementArgs & { readonly quantity: number },
): Promise<number> {
  const { productId, quantity } = args;
  if (quantity <= 0) throw new Error('La cantidad a descontar debe ser mayor que cero.');

  // Atómico: nadie puede colarse entre la comprobación y la resta.
  const updated = await tx.product.updateMany({
    where: { id: productId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });

  if (updated.count === 0) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { sku: true, stock: true },
    });
    throw new InsufficientStockError(product?.sku ?? productId, quantity, product?.stock ?? 0);
  }

  const product = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stock: true },
  });

  await tx.inventoryMovement.create({
    data: {
      productId,
      type: args.type,
      quantity: -quantity,
      stockAfter: product.stock,
      reason: args.reason ?? null,
      orderId: args.orderId ?? null,
      userId: args.userId ?? null,
      unitCost: args.unitCost ?? null,
      ...(args.createdAt ? { createdAt: args.createdAt } : {}),
    },
  });

  return product.stock;
}

/** Suma unidades: compra al proveedor, devolución o anulación de un pedido. */
export async function incrementStock(
  tx: Tx,
  args: MovementArgs & { readonly quantity: number },
): Promise<number> {
  const { productId, quantity } = args;
  if (quantity <= 0) throw new Error('La cantidad a ingresar debe ser mayor que cero.');

  const product = await tx.product.update({
    where: { id: productId },
    data: { stock: { increment: quantity } },
    select: { stock: true },
  });

  await tx.inventoryMovement.create({
    data: {
      productId,
      type: args.type,
      quantity,
      stockAfter: product.stock,
      reason: args.reason ?? null,
      orderId: args.orderId ?? null,
      userId: args.userId ?? null,
      unitCost: args.unitCost ?? null,
      ...(args.createdAt ? { createdAt: args.createdAt } : {}),
    },
  });

  return product.stock;
}

/**
 * Deja el stock en un valor exacto: es el conteo físico del panel.
 *
 * Registra la DIFERENCIA como movimiento, no el valor nuevo, para que la suma
 * del historial siga cuadrando con el stock actual.
 */
export async function setStock(
  tx: Tx,
  args: MovementArgs & { readonly newStock: number },
): Promise<number> {
  const { productId, newStock } = args;
  if (newStock < 0) throw new Error('El stock no puede quedar negativo.');

  const current = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stock: true },
  });

  const delta = newStock - current.stock;
  // Un ajuste que no cambia nada no es un movimiento: solo ensuciaría el
  // historial y haría dudar de los que sí dicen algo.
  if (delta === 0) return current.stock;

  await tx.product.update({ where: { id: productId }, data: { stock: newStock } });

  await tx.inventoryMovement.create({
    data: {
      productId,
      type: MovementType.ADJUSTMENT,
      quantity: delta,
      stockAfter: newStock,
      reason: args.reason ?? 'Ajuste manual de inventario',
      userId: args.userId ?? null,
    },
  });

  return newStock;
}
