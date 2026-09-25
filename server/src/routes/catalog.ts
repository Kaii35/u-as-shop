import type { FastifyInstance } from 'fastify';
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

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/catalog', async () => {
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
