import 'dotenv/config';
import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
  /**
   * Si se cree o no la cabecera X-Forwarded-For.
   *
   * Decide de quién es la IP que ve el límite de peticiones, así que es una
   * decisión de seguridad y no de despliegue, y va en las dos direcciones:
   *
   * - Encendido sin un proxy delante, cualquiera manda `X-Forwarded-For: lo
   *   que sea` y se salta el límite cambiando el valor en cada petición.
   * - Apagado CON un proxy delante, todas las peticiones parecen venir del
   *   proxy, el límite las cuenta juntas y basta un visitante activo para
   *   dejar fuera a toda la tienda.
   *
   * Por eso es explícito y por defecto no. Quien ponga la API detrás de un
   * balanceador tiene que encenderlo a mano, que es el momento en que sabe que
   * hay un proxy.
   */
  trustProxy: env.trustProxy,
  /**
   * Tope de cuerpo. Un intento de pago con 50 líneas no llega a 20 KB y un
   * aviso de Wompi son unos pocos. 256 KB deja margen de sobra y corta el
   * envío de cuerpos enormes contra rutas públicas, que no exigen cuenta.
   */
  bodyLimit: 256 * 1024,
});

await app.register(cors, { origin: env.corsOrigins, credentials: true });

/**
 * Límite de peticiones.
 *
 * No es precaución genérica: sin él, las rutas públicas de pago permiten
 * AGOTAR EL INVENTARIO SIN PAGAR NADA. Crear un intento de pago aparta stock
 * durante `RESERVATION_MINUTES`, no pide cuenta y no costaba nada repetirlo.
 * Medido sobre esta misma tienda antes del arreglo: 10 reservas aceptadas en
 * 355 ms desde una sola IP, dejando el producto sin unidades disponibles un
 * cuarto de hora. Repetido sobre el catálogo apaga la tienda entera.
 *
 * El límite se declara global pero cada ruta pública fija el suyo; las del
 * panel van con sesión y no necesitan este freno.
 */
await app.register(rateLimit, {
  global: false,
  // La respuesta sale con la forma del contrato ({ error }), no con la del
  // plugin, para que el frontend no tenga que distinguir dos formatos.
  errorResponseBuilder: (_request, contexto) => ({
    statusCode: 429,
    error: `Demasiadas peticiones. Espera ${Math.ceil(contexto.ttl / 1000)} segundos e inténtalo de nuevo.`,
  }),
});

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
