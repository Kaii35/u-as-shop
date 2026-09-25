import 'dotenv/config';
import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { prisma } from './db.js';
import { InsufficientStockError } from './inventory.js';
import { catalogRoutes } from './routes/catalog.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { productRoutes } from './routes/products.js';
import { inventoryRoutes } from './routes/inventory.js';
import { orderRoutes } from './routes/orders.js';
import { promotionRoutes } from './routes/promotions.js';
import { settingRoutes } from './routes/settings.js';
import { paymentRoutes } from './routes/payments.js';
import { adminPaymentRoutes } from './routes/admin-payments.js';
import { assertPaymentsReady } from './payments/index.js';

const app = Fastify({
  logger: env.isProduction
    ? true
    : {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      },
});

await app.register(cors, { origin: env.corsOrigins, credentials: true });

app.get('/health', async () => {
  // Comprueba la base de verdad: un 200 sin base no le sirve a nadie, y es
  // justo el caso que se da cuando el contenedor de Postgres no arrancó.
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok', time: new Date().toISOString() };
});

/**
 * El manejador de errores va ANTES de registrar las rutas, y el orden importa
 * de verdad.
 *
 * Fastify propaga a cada plugin el manejador que existia en el momento de
 * cargarlo. Con los `await app.register(...)` por delante, los plugins se
 * quedaban con el manejador por defecto: un `InsufficientStockError` salia
 * como 500 "Internal Server Error" en vez del 409 con el mensaje que dice que
 * referencia falta, y todo error viajaba con la forma de Fastify
 * ({statusCode, error, message}) en vez de la del contrato ({ error }).
 * El panel enseñaba "Error interno del servidor" justo cuando mas concreto
 * tenia que ser.
 */
app.setErrorHandler((error: FastifyError, _request, reply) => {
  if (error instanceof InsufficientStockError) {
    return reply.code(409).send({ error: error.message, code: 'INSUFFICIENT_STOCK' });
  }

  // P2002 = choque de índice único. Casi siempre es un SKU o un cupón
  // repetido, y decirlo así evita un 500 que no explica nada.
  if ((error as { code?: string }).code === 'P2002') {
    const target = (error as unknown as { meta?: { target?: string[] } }).meta?.target ?? [];
    return reply.code(409).send({
      error: `Ya existe un registro con ese ${target.join(', ') || 'valor único'}.`,
      code: 'DUPLICATE',
    });
  }
  if ((error as { code?: string }).code === 'P2025') {
    return reply.code(404).send({ error: 'No se encontró el registro.', code: 'NOT_FOUND' });
  }

  app.log.error(error);
  const status = error.statusCode ?? 500;
  return reply.code(status).send({
    error: status >= 500 ? 'Error interno del servidor' : error.message,
  });
});

// Públicas: las consume la tienda.
await app.register(catalogRoutes);
// Del panel: todas exigen sesión salvo el login.
await app.register(authRoutes);
await app.register(dashboardRoutes);
await app.register(productRoutes);
await app.register(inventoryRoutes);
await app.register(orderRoutes);
await app.register(promotionRoutes);
await app.register(settingRoutes);
// Pagos: el intento y el webhook son publicos; el webhook se autentica con su
// propia firma, no con el token del panel.
await app.register(paymentRoutes);
await app.register(adminPaymentRoutes);

// Arrancar con la pasarela mal configurada es peor que no arrancar: la tienda
// pareceria sana y fallaria justo al cobrar. En produccion se niega.
assertPaymentsReady((msg) => app.log.warn(msg));


const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`${signal} recibido, cerrando…`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.port, host: env.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
