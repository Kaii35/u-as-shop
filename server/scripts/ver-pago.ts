/**
 * Mira un cobro de cerca: estado, pedido, avisos recibidos y movimientos de
 * inventario que provoco.
 *
 *     npm run payments:show -- AU-11682-b7c7
 *
 * Es la herramienta para contestar "¿que paso con este pago?" sin abrir la
 * base a mano. Muestra `checksumOk` de cada aviso, que es lo que dice si la
 * verificacion de la firma lo acepto o lo rechazo.
 */
import { prisma } from '../src/db.js';
const ref = process.argv[2] ?? '';
const pago = await prisma.payment.findUnique({
  where: { reference: ref },
  select: {
    id: true, orderId: true, status: true, providerTransactionId: true, methodType: true, statusMessage: true,
    order: { select: { number: true, status: true } },
    events: { select: { source: true, status: true, applied: true, checksumOk: true }, orderBy: { createdAt: 'asc' } },
  },
});
if (!pago) { console.log('  no existe el pago', ref); process.exit(0); }
console.log('  pago        :', pago.status, '| pedido', pago.order.number, pago.order.status);
console.log('  tx de Wompi :', pago.providerTransactionId, '| metodo', pago.methodType, '|', pago.statusMessage ?? '');
console.log('  eventos registrados:');
for (const e of pago.events) console.log(`      ${e.source}  ${e.status}  aplicado=${e.applied}  checksumOk=${e.checksumOk}`);
const movs = await prisma.inventoryMovement.findMany({
  where: { orderId: pago.orderId },
  select: { type: true, quantity: true, stockAfter: true, productId: true, reason: true },
});
console.log('  movimientos de inventario:');
for (const m of movs) console.log(`      ${m.productId}  ${m.type}  ${m.quantity}  -> stock ${m.stockAfter}  | ${m.reason ?? ''}`);
const p = await prisma.product.findUnique({ where: { id: 'p1' }, select: { stock: true, reserved: true } });
console.log('  p1 ahora    : stock', p?.stock, '| reservado', p?.reserved);
await prisma.$disconnect();
