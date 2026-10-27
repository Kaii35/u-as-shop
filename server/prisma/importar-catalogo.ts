/**
 * Carga el catálogo real (catalogo-real.json) en la base.
 *
 *   npm --prefix server run catalog:import
 *
 * Qué hace y por qué:
 *
 *   - Categorías, marcas y productos reales llevan ids con prefijo `ns-`. Así
 *     se distinguen de los de la demo (`c1`, `p1`…) sin columna extra.
 *   - Lo de la demo NO se borra: los pedidos de ejemplo apuntan a esos
 *     productos y el panel perdería su historia. Se apagan (`active: false`),
 *     y la tienda deja de mostrarlos.
 *   - Precio, costo y stock solo se escriben al CREAR un producto (en 0). Si
 *     la dueña ya los llenó desde el panel, volver a importar no los pisa.
 *     Lo que sí se actualiza es lo que sale del PDF: nombre, fotos,
 *     descripción, categoría, marca, presentación, tonos y tallas.
 *
 * Las fotos las genera scripts/exportar-fotos-catalogo.py.
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';

interface RawCategory {
  id: string;
  nombre: string;
  descripcion: string;
}

interface RawProduct {
  id: string;
  nombre: string;
  marca: string;
  cat: string;
  contenido: string;
  fotos: number[];
  uso: string;
  desc: string;
  tonos?: Array<[string, string]>;
  tallas?: string[];
  revisar?: boolean;
}

interface RawCatalog {
  usos: Record<string, string>;
  categorias: RawCategory[];
  productos: RawProduct[];
}

export const REAL_PREFIX = 'ns-';
/** Marca para lo que no trae marca visible en el empaque. No se destaca en portada. */
const GENERIC_BRAND = 'Línea profesional';

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function loadCatalog(): RawCatalog {
  const file = fileURLToPath(new URL('./catalogo-real.json', import.meta.url));
  const data = JSON.parse(readFileSync(file, 'utf-8')) as RawCatalog;

  for (const p of data.productos) {
    if (!data.usos[p.uso]) throw new Error(`${p.id}: uso "${p.uso}" no existe.`);
    if (!data.categorias.some((c) => c.id === p.cat)) throw new Error(`${p.id}: categoría "${p.cat}" no existe.`);
    if (!p.id.startsWith(REAL_PREFIX)) throw new Error(`${p.id}: el id debe empezar por "${REAL_PREFIX}".`);
  }
  return data;
}

export async function importRealCatalog(prisma: PrismaClient): Promise<{ products: number; review: string[] }> {
  const data = loadCatalog();

  // Una categoría de la demo puede llamarse igual que una real ("Pestañas y
  // cejas") y el slug es único. La demo va escondida, así que cede el suyo.
  const realCatSlugs = data.categorias.map((c) => slugify(c.nombre));
  const clashes = await prisma.category.findMany({
    where: { slug: { in: realCatSlugs }, NOT: { id: { startsWith: REAL_PREFIX } } },
    select: { id: true, slug: true },
  });
  for (const c of clashes) {
    await prisma.category.update({ where: { id: c.id }, data: { slug: `demo-${c.slug}` } });
  }

  for (const [i, c] of data.categorias.entries()) {
    const fields = {
      slug: slugify(c.nombre),
      name: c.nombre,
      description: c.descripcion,
      image: `/images/categories/${c.id}.webp`,
      order: i + 1,
      active: true,
    };
    await prisma.category.upsert({ where: { id: c.id }, create: { id: c.id, ...fields }, update: fields });
  }

  const brandNames = [...new Set(data.productos.map((p) => p.marca))].sort((a, b) => a.localeCompare(b, 'es'));
  const brandId = (name: string) => `${REAL_PREFIX}${slugify(name)}`;
  for (const [i, name] of brandNames.entries()) {
    const fields = {
      slug: slugify(name),
      name,
      featured: name !== GENERIC_BRAND,
      order: i + 1,
      active: true,
    };
    await prisma.brand.upsert({ where: { id: brandId(name) }, create: { id: brandId(name), ...fields }, update: fields });
  }

  for (const p of data.productos) {
    const fromPdf = {
      slug: slugify(p.nombre),
      name: p.nombre,
      categoryId: p.cat,
      brandId: brandId(p.marca),
      content: p.contenido,
      description: p.desc,
      usage: data.usos[p.uso] as string,
      images: p.fotos.map((_, n) => `/images/products/catalogo/${p.id}-${n + 1}.webp`),
      shades: p.tonos?.length ? p.tonos.map(([name, hex]) => ({ name, hex })) : Prisma.DbNull,
      sizes: p.tallas?.length ? p.tallas.map((label) => ({ label })) : Prisma.DbNull,
      active: true,
    };
    await prisma.product.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        sku: p.id.slice(REAL_PREFIX.length).toUpperCase(),
        ...fromPdf,
        // Sin precio todavía: la tienda lo muestra como "Precio por confirmar"
        // y no deja agregarlo al carrito.
        price: 0,
        cost: 0,
        stock: 0,
        tags: [],
      },
      update: fromPdf,
    });
  }

  // Productos reales que ya no están en el JSON: se apagan, no se borran, por
  // si alguno ya tiene ventas.
  const realIds = data.productos.map((p) => p.id);
  await prisma.product.updateMany({
    where: { id: { startsWith: REAL_PREFIX, notIn: realIds } },
    data: { active: false },
  });

  // La demo se esconde de la tienda (ver cabecera).
  const notReal = { NOT: { id: { startsWith: REAL_PREFIX } } };
  await prisma.product.updateMany({ where: notReal, data: { active: false } });
  await prisma.category.updateMany({ where: notReal, data: { active: false } });
  await prisma.brand.updateMany({ where: notReal, data: { active: false } });

  return {
    products: data.productos.length,
    review: data.productos.filter((p) => p.revisar).map((p) => p.nombre),
  };
}

// Ejecución directa: `tsx prisma/importar-catalogo.ts`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prisma = new PrismaClient({ log: ['warn', 'error'] });
  importRealCatalog(prisma)
    .then(({ products, review }) => {
      console.log(`Catálogo real: ${products} productos cargados.`);
      if (review.length) console.log(`Nombre deducido de la foto, conviene revisar (${review.length}):\n  - ${review.join('\n  - ')}`);
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
