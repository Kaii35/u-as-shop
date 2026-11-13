import type { FastifyInstance, onSendAsyncHookHandler } from 'fastify';
import { prisma } from '../db.js';
import {
  productInclude,
  serializeBrand,
  serializeCategory,
  serializeProduct,
} from '../serializers.js';

/**
 * Catálogo público. Es lo primero que pide la tienda al arrancar y lo único
 * que necesita para pintarse entera, así que va sin sesión y en una sola
 * llamada: tres viajes a la API para dibujar la portada se notan en el móvil.
 */

/**
 * Caché compartida para lo público que la tienda consulta cada 20 s.
 *
 * Cada pestaña abierta pide el catálogo entero (~110 KB) cada 20 s. Sin esto,
 * en Vercel cada petición es una invocación de la función y una consulta a
 * Neon, y con pocas visitas se gastan las cuotas gratis (y la base nunca se
 * duerme). Así el CDN de Vercel responde por la API durante 10 s: la función
 * y la base se tocan como mucho unas pocas veces por minuto, tenga la tienda
 * una visita o cien.
 *
 * Va en `CDN-Cache-Control` y NO en `Cache-Control` a propósito: el navegador
 * no lee la primera. Con `stale-while-revalidate` en `Cache-Control`, el
 * navegador mismo devolvía la copia vieja en cada sondeo y la pestaña abierta
 * de la tienda no veía nunca un cambio del panel (medido en local: el precio
 * no cambiaba ni a los 40 s). El navegador queda como antes, sin caché propia.
 *
 * Detrás de un VPS sin CDN no cambia nada. La respuesta ya lleva
 * `Vary: Origin` (lo pone CORS), así que la caché guarda una copia por origen
 * y no mezcla cabeceras CORS.
 */
export const CDN_CACHE = 'max-age=10, stale-while-revalidate=30';

/** `onSend` de las rutas públicas: solo se cachea una respuesta buena, nunca un error. */
export const publicCache: onSendAsyncHookHandler = async (_request, reply, payload) => {
  if (reply.statusCode === 200) reply.header('CDN-Cache-Control', CDN_CACHE);
  return payload;
};

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/catalog', { onSend: publicCache }, async () => {
    const [categories, brands, products] = await Promise.all([
      prisma.category.findMany({
        where: { active: true },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      prisma.brand.findMany({
        where: { active: true },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      prisma.product.findMany({
        // También se exige categoría y marca activas: un producto cuya
        // categoría está oculta llegaría con un `categoryId` que no viene en
        // `categories`, y la tienda lo pintaría en una sección fantasma.
        where: { active: true, category: { active: true }, brand: { active: true } },
        include: productInclude,
        // Por antigüedad: mantiene el orden con el que se sembró el catálogo
        // (p1…p16), que es el que la portada ya daba por bueno.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      categories: categories.map(serializeCategory),
      brands: brands.map(serializeBrand),
      products: products.map(serializeProduct),
    };
  });
}
