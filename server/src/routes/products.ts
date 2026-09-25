import type { FastifyInstance } from 'fastify';
import { MovementType, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { incrementStock } from '../inventory.js';
import { soldWhere } from '../sales.js';
import {
  productInclude,
  serializeAdminProduct,
  slugify,
  type ProductWithRelations,
} from '../serializers.js';

/**
 * Productos, categorías y marcas del panel.
 *
 * El stock no se toca desde aquí: entra y sale por el servicio de inventario,
 * que deja el movimiento que explica cada unidad. Esta ruta solo lo lee, con
 * una excepción — el alta — donde las unidades iniciales también entran como
 * movimiento dentro de la misma transacción.
 */

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

// Los mensajes que trae zod vienen en inglés y este 400 lo lee la dueña en el
// panel, no quien escribió el cliente: cada campo lleva su propio texto.
const texto = (campo: string) =>
  z.string({ required_error: `Falta ${campo}.`, invalid_type_error: `${campo} debe ser texto.` });

const numero = (campo: string) =>
  z.number({ required_error: `Falta ${campo}.`, invalid_type_error: `${campo} debe ser un número.` });

// El dinero son enteros en pesos. Un decimal que llega aquí es un error de
// quien llama, y redondearlo en silencio descuadra el total que ve la clienta.
const entero = (campo: string) => numero(campo).int(`${campo} debe ser un número entero.`);

const booleano = (campo: string) =>
  z.boolean({ invalid_type_error: `${campo} debe ser verdadero o falso.` });

const opciones = <T extends readonly [string, ...string[]]>(campo: string, valores: T) =>
  z.enum(valores, { errorMap: () => ({ message: `${campo} solo acepta: ${valores.join(', ')}.` }) });

const enteroQuery = (campo: string) =>
  z.coerce
    .number({ invalid_type_error: `${campo} debe ser un número.` })
    .int(`${campo} debe ser un número entero.`);

/** Un solo texto con todo lo que falló, para el `{ error }` del contrato. */
const zodError = (error: z.ZodError): string =>
  error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join(' ');

const shadeSchema = z.object({
  name: texto('el nombre del tono').trim().min(1, 'El tono necesita nombre.').max(80),
  hex: texto('el color del tono')
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color del tono va en formato #RRGGBB.'),
});

const sizeSchema = z.object({
  label: texto('la etiqueta de la presentación').trim().min(1, 'La presentación necesita etiqueta.').max(80),
  price: entero('el precio de la presentación')
    .min(1, 'El precio de la presentación debe ser mayor que cero.')
    .optional(),
});

const createProductSchema = z.object({
  sku: texto('el SKU').trim().min(1, 'El SKU no puede ir vacío.').max(60),
  name: texto('el nombre').trim().min(3, 'El nombre necesita al menos 3 caracteres.').max(200),
  slug: texto('el slug').trim().min(1).max(120).optional(),
  categoryId: texto('la categoría').trim().min(1, 'Falta la categoría.'),
  brandId: texto('la marca').trim().min(1, 'Falta la marca.'),
  price: entero('el precio').min(1, 'El precio debe ser mayor que cero.'),
  compareAtPrice: entero('el precio tachado').min(1).nullable().optional(),
  cost: entero('el costo').min(0, 'El costo no puede ser negativo.').default(0),
  taxRate: numero('el IVA').min(0).max(1, 'El IVA va entre 0 y 1 (0.19 = 19 %).').default(0.19),
  initialStock: entero('el stock inicial').min(0, 'El stock inicial no puede ser negativo.').default(0),
  unitCost: entero('el costo unitario de la entrada').min(0).optional(),
  minStock: entero('el stock mínimo').min(0, 'El stock mínimo no puede ser negativo.').default(5),
  active: booleano('activo').default(true),
  featured: booleano('destacado').default(false),
  tags: z.array(texto('la etiqueta').trim().min(1).max(30)).max(10).default([]),
  content: texto('la presentación').trim().max(120).default(''),
  description: texto('la descripción').trim().max(4000).default(''),
  usage: texto('el modo de uso').trim().max(4000).default(''),
  images: z.array(texto('la imagen').trim().min(1).max(500)).max(12).default([]),
  shades: z.array(shadeSchema).max(40).optional(),
  sizes: z.array(sizeSchema).max(20).optional(),
});

const updateProductSchema = z.object({
  sku: texto('el SKU').trim().min(1).max(60).optional(),
  name: texto('el nombre').trim().min(3, 'El nombre necesita al menos 3 caracteres.').max(200).optional(),
  slug: texto('el slug').trim().min(1).max(120).optional(),
  categoryId: texto('la categoría').trim().min(1).optional(),
  brandId: texto('la marca').trim().min(1).optional(),
  price: entero('el precio').min(1, 'El precio debe ser mayor que cero.').optional(),
  compareAtPrice: entero('el precio tachado').min(1).nullable().optional(),
  cost: entero('el costo').min(0, 'El costo no puede ser negativo.').optional(),
  taxRate: numero('el IVA').min(0).max(1, 'El IVA va entre 0 y 1 (0.19 = 19 %).').optional(),
  minStock: entero('el stock mínimo').min(0, 'El stock mínimo no puede ser negativo.').optional(),
  active: booleano('activo').optional(),
  featured: booleano('destacado').optional(),
  tags: z.array(texto('la etiqueta').trim().min(1).max(30)).max(10).optional(),
  content: texto('la presentación').trim().max(120).optional(),
  description: texto('la descripción').trim().max(4000).optional(),
  usage: texto('el modo de uso').trim().max(4000).optional(),
  images: z.array(texto('la imagen').trim().min(1).max(500)).max(12).optional(),
  shades: z.array(shadeSchema).max(40).optional(),
  sizes: z.array(sizeSchema).max(20).optional(),
});

const listQuerySchema = z.object({
  search: texto('la búsqueda').trim().min(1).max(120).optional(),
  category: texto('la categoría').trim().min(1).optional(),
  brand: texto('la marca').trim().min(1).optional(),
  stock: opciones('stock', ['all', 'low', 'out', 'ok'] as const).default('all'),
  status: opciones('status', ['all', 'active', 'inactive'] as const).default('all'),
  sort: opciones('sort', ['name', 'price', 'stock', 'created', 'sales'] as const).default('created'),
  dir: opciones('dir', ['asc', 'desc'] as const).default('desc'),
  page: enteroQuery('page').min(1, 'La página empieza en 1.').default(1),
  limit: enteroQuery('limit').min(1).max(200, 'El límite máximo es 200.').default(25),
});

// `z.coerce.boolean()` no sirve aquí: convertiría la cadena "false" en true,
// justo lo contrario de lo que pide quien escribe ?hard=false.
const hardQuerySchema = z.object({
  hard: opciones('hard', ['true', 'false'] as const).optional(),
});

const categoryCreateSchema = z.object({
  name: texto('el nombre').trim().min(2, 'El nombre necesita al menos 2 caracteres.').max(120),
  slug: texto('el slug').trim().min(1).max(120).optional(),
  description: texto('la descripción').trim().max(2000).default(''),
  image: texto('la imagen').trim().max(500).nullable().optional(),
  order: entero('el orden').min(0, 'El orden no puede ser negativo.').default(0),
  active: booleano('activa').default(true),
});

const categoryUpdateSchema = z.object({
  name: texto('el nombre').trim().min(2, 'El nombre necesita al menos 2 caracteres.').max(120).optional(),
  slug: texto('el slug').trim().min(1).max(120).optional(),
  description: texto('la descripción').trim().max(2000).optional(),
  image: texto('la imagen').trim().max(500).nullable().optional(),
  order: entero('el orden').min(0, 'El orden no puede ser negativo.').optional(),
  active: booleano('activa').optional(),
});

const brandCreateSchema = z.object({
  name: texto('el nombre').trim().min(2, 'El nombre necesita al menos 2 caracteres.').max(120),
  slug: texto('el slug').trim().min(1).max(120).optional(),
  featured: booleano('destacada').default(true),
  order: entero('el orden').min(0, 'El orden no puede ser negativo.').default(0),
  active: booleano('activa').default(true),
});

const brandUpdateSchema = z.object({
  name: texto('el nombre').trim().min(2, 'El nombre necesita al menos 2 caracteres.').max(120).optional(),
  slug: texto('el slug').trim().min(1).max(120).optional(),
  featured: booleano('destacada').optional(),
  order: entero('el orden').min(0, 'El orden no puede ser negativo.').optional(),
  active: booleano('activa').optional(),
});

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * Slug libre a partir de un nombre.
 *
 * El SKU desempata porque dos productos pueden llamarse igual pero nunca
 * compartir referencia. Si aun así choca se numera: es mejor un `-2` feo que
 * un 500 por índice único en mitad del alta.
 */
async function uniqueSlug(
  base: string,
  tiebreaker: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || slugify(tiebreaker) || 'sin-nombre';
  const desempate = slugify(tiebreaker);
  const candidatos = desempate && desempate !== root ? [root, `${root}-${desempate}`] : [root];

  for (const candidato of candidatos) {
    if (!(await isTaken(candidato))) return candidato;
  }
  for (let n = 2; n <= 50; n += 1) {
    const candidato = `${root}-${n}`;
    if (!(await isTaken(candidato))) return candidato;
  }
  return `${root}-${Date.now().toString(36)}`;
}

const productSlugTaken =
  (excludeId?: string) =>
  async (slug: string): Promise<boolean> =>
    (await prisma.product.count({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    })) > 0;

/** Unidades vendidas por producto en una ventana, con el criterio único de venta. */
async function unitsSoldByProduct(
  productIds: readonly string[],
  since: Date,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  const rows = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { productId: { in: [...productIds] }, order: { ...soldWhere, createdAt: { gte: since } } },
    _sum: { quantity: true },
  });

  return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]));
}

/**
 * Búsqueda por nombre, SKU y slug, ciega a mayúsculas y tildes.
 *
 * `mode: 'insensitive'` de Postgres ignora las mayúsculas pero no las tildes, y
 * `unaccent()` obligaría a instalar la extensión y a bajar todo el filtro a un
 * `$queryRaw`, reconstruyendo a mano el resto del `where` y la paginación. Sale
 * más barato apoyarse en el slug: `slugify` ya lo guardó sin tildes, así que
 * "uñas", "UÑAS" y "unas" se reducen a la misma cadena al compararlas.
 */
function searchFilter(term: string): Prisma.ProductWhereInput {
  const slugTerm = slugify(term);
  return {
    OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
      ...(slugTerm ? [{ slug: { contains: slugTerm } }] : []),
    ],
  };
}

function stockFilter(stock: 'all' | 'low' | 'out' | 'ok'): Prisma.ProductWhereInput {
  // Contra el umbral propio de cada referencia, no contra un 5 fijo: un torno
  // de 390.000 no se repone como un esmalte de 32.000.
  if (stock === 'out') return { stock: { lte: 0 } };
  if (stock === 'low') return { stock: { gt: 0, lte: prisma.product.fields.minStock } };
  if (stock === 'ok') return { stock: { gt: prisma.product.fields.minStock } };
  return {};
}

interface Facet {
  id: string;
  name: string;
  count: number;
}

/**
 * Las facetas se calculan SIN el filtro de su propia dimensión: si al elegir
 * una categoría la lista de categorías se quedara con esa sola, no habría
 * forma de saltar a otra sin limpiar el filtro primero.
 */
async function categoryFacets(where: Prisma.ProductWhereInput): Promise<Facet[]> {
  const rows = await prisma.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } });
  const names = await prisma.category.findMany({
    where: { id: { in: rows.map((row) => row.categoryId) } },
    select: { id: true, name: true },
  });
  const byId = new Map(names.map((c) => [c.id, c.name]));

  return rows
    .map((row) => ({ id: row.categoryId, name: byId.get(row.categoryId) ?? '', count: row._count._all }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

async function brandFacets(where: Prisma.ProductWhereInput): Promise<Facet[]> {
  const rows = await prisma.product.groupBy({ by: ['brandId'], where, _count: { _all: true } });
  const names = await prisma.brand.findMany({
    where: { id: { in: rows.map((row) => row.brandId) } },
    select: { id: true, name: true },
  });
  const byId = new Map(names.map((b) => [b.id, b.name]));

  return rows
    .map((row) => ({ id: row.brandId, name: byId.get(row.brandId) ?? '', count: row._count._all }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** `shades` y `sizes` viven en columnas Json y Prisma exige su propio tipo. */
const toJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

export async function productRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (secured) => {
    secured.addHook('preHandler', requireAuth);

    secured.get('/api/admin/products', async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: zodError(parsed.error) });
      const { search, category, brand, stock, status, sort, dir, page, limit } = parsed.data;

      const categoryFilter: Prisma.ProductWhereInput = category ? { categoryId: category } : {};
      const brandFilter: Prisma.ProductWhereInput = brand ? { brandId: brand } : {};
      const restFilter: Prisma.ProductWhereInput = {
        ...(status === 'all' ? {} : { active: status === 'active' }),
        ...stockFilter(stock),
        ...(search ? searchFilter(search) : {}),
      };
      const where: Prisma.ProductWhereInput = { ...restFilter, ...categoryFilter, ...brandFilter };

      const since = daysAgo(30);
      const skip = (page - 1) * limit;
      let total: number;
      let items: ProductWithRelations[];
      let sold: Map<string, number>;

      if (sort === 'sales') {
        // Las unidades vendidas no son una columna sino una agregación sobre
        // OrderItem, y Prisma no sabe ordenar por eso. Con un catálogo de
        // cientos de referencias sale más barato traer los ids y ordenarlos
        // aquí que sostener una vista materializada.
        const candidates = await prisma.product.findMany({ where, select: { id: true, name: true } });
        total = candidates.length;
        sold = await unitsSoldByProduct(
          candidates.map((c) => c.id),
          since,
        );

        const pageIds = [...candidates]
          .sort((a, b) => {
            const diff = (sold.get(a.id) ?? 0) - (sold.get(b.id) ?? 0);
            const byUnits = dir === 'asc' ? diff : -diff;
            return byUnits !== 0 ? byUnits : a.name.localeCompare(b.name, 'es');
          })
          .slice(skip, skip + limit)
          .map((c) => c.id);

        const rows = await prisma.product.findMany({
          where: { id: { in: pageIds } },
          include: productInclude,
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        items = pageIds
          .map((id) => byId.get(id))
          .filter((product): product is ProductWithRelations => product !== undefined);
      } else {
        const column: Prisma.ProductOrderByWithRelationInput =
          sort === 'name'
            ? { name: dir }
            : sort === 'price'
              ? { price: dir }
              : sort === 'stock'
                ? { stock: dir }
                : { createdAt: dir };

        const [count, rows] = await Promise.all([
          prisma.product.count({ where }),
          prisma.product.findMany({
            where,
            include: productInclude,
            // El id desempata: sin un orden total, dos productos con el mismo
            // precio pueden cambiar de sitio entre páginas y salir repetidos.
            orderBy: [column, { id: 'asc' }],
            skip,
            take: limit,
          }),
        ]);
        total = count;
        items = rows;
        sold = await unitsSoldByProduct(
          rows.map((row) => row.id),
          since,
        );
      }

      const [categories, brands] = await Promise.all([
        categoryFacets({ ...restFilter, ...brandFilter }),
        brandFacets({ ...restFilter, ...categoryFilter }),
      ]);

      return {
        items: items.map((product) =>
          serializeAdminProduct(product, { unitsSold30d: sold.get(product.id) ?? 0 }),
        ),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        facets: { categories, brands },
      };
    });

    secured.get('/api/admin/products/:id', async (request, reply) => {
      const { id } = request.params as { id: string };

      const product = await prisma.product.findUnique({ where: { id }, include: productInclude });
      if (!product) {
        return reply.code(404).send({ error: 'El producto no existe.', code: 'NOT_FOUND' });
      }

      const [movements, sales] = await Promise.all([
        prisma.inventoryMovement.findMany({
          where: { productId: id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { name: true } }, order: { select: { number: true } } },
        }),
        prisma.orderItem.aggregate({
          where: { productId: id, order: { ...soldWhere, createdAt: { gte: daysAgo(90) } } },
          _sum: { quantity: true, lineTotal: true },
        }),
      ]);

      // Sin `unitsSold30d`: esa cifra existe para ordenar el listado. En la
      // ficha manda la ventana de 90 días, que es la que deja ver una racha.
      return {
        ...serializeAdminProduct(product),
        movements: movements.map((movement) => ({
          id: movement.id,
          type: movement.type,
          quantity: movement.quantity,
          stockAfter: movement.stockAfter,
          unitCost: movement.unitCost,
          reason: movement.reason,
          userName: movement.user?.name ?? null,
          orderNumber: movement.order?.number ?? null,
          createdAt: movement.createdAt,
        })),
        sales: {
          days: 90,
          units: sales._sum.quantity ?? 0,
          revenue: sales._sum.lineTotal ?? 0,
        },
      };
    });

    /**
     * Alta de producto.
     *
     * Nace con stock 0 y las unidades iniciales entran como movimiento INITIAL
     * dentro de la misma transacción: si la entrada falla no queda un producto
     * con stock inventado, y el historial explica desde la primera unidad de
     * dónde salió cada una.
     */
    secured.post('/api/admin/products', async (request, reply) => {
      const parsed = createProductSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: zodError(parsed.error) });
      const input = parsed.data;

      if (input.compareAtPrice != null && input.compareAtPrice <= input.price) {
        return reply
          .code(400)
          .send({ error: 'El precio tachado tiene que ser mayor que el precio de venta.' });
      }

      const [category, brand, duplicate] = await Promise.all([
        prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }),
        prisma.brand.findUnique({ where: { id: input.brandId }, select: { id: true } }),
        prisma.product.findUnique({ where: { sku: input.sku }, select: { name: true } }),
      ]);
      if (!category) return reply.code(400).send({ error: 'La categoría indicada no existe.' });
      if (!brand) return reply.code(400).send({ error: 'La marca indicada no existe.' });
      if (duplicate) {
        return reply
          .code(409)
          .send({ error: `El SKU ${input.sku} ya lo usa "${duplicate.name}".`, code: 'DUPLICATE' });
      }

      let slug: string;
      if (input.slug) {
        // Un slug escrito a mano no se corrige por detrás: es una dirección
        // pública, y quien la eligió tiene que enterarse de que ya está tomada.
        slug = slugify(input.slug);
        if (await productSlugTaken()(slug)) {
          return reply
            .code(409)
            .send({ error: `La dirección /${slug} ya la usa otro producto.`, code: 'DUPLICATE' });
        }
      } else {
        slug = await uniqueSlug(input.name, input.sku, productSlugTaken());
      }

      const created = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            sku: input.sku,
            slug,
            name: input.name,
            categoryId: input.categoryId,
            brandId: input.brandId,
            price: input.price,
            compareAtPrice: input.compareAtPrice ?? null,
            cost: input.cost,
            taxRate: input.taxRate,
            stock: 0,
            minStock: input.minStock,
            active: input.active,
            featured: input.featured,
            tags: input.tags,
            content: input.content,
            description: input.description,
            usage: input.usage,
            images: input.images,
            ...(input.shades ? { shades: toJson(input.shades) } : {}),
            ...(input.sizes ? { sizes: toJson(input.sizes) } : {}),
          },
        });

        if (input.initialStock > 0) {
          await incrementStock(tx, {
            productId: product.id,
            quantity: input.initialStock,
            type: MovementType.INITIAL,
            // Si no mandan el costo de la entrada sirve el del producto: es el
            // mismo dato, y sin él el inventario valorado nace incompleto.
            unitCost: input.unitCost ?? input.cost,
            reason: 'Carga inicial al crear el producto',
            userId: request.admin?.sub ?? null,
          });
        }

        return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
      });

      return reply.code(201).send(serializeAdminProduct(created));
    });

    secured.patch('/api/admin/products/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body: unknown = request.body;

      // Rechazar en vez de ignorar: un `stock` aceptado en silencio dejaría el
      // historial sin el movimiento que explica el cambio, y el cuadre entre
      // inventario y pedidos no volvería a cerrar.
      if (typeof body === 'object' && body !== null && 'stock' in body) {
        return reply.code(400).send({
          error:
            'El stock no se edita desde el producto: usa /api/admin/inventory/movements para una entrada o salida, o /api/admin/inventory/count para un conteo físico.',
        });
      }

      const parsed = updateProductSchema.safeParse(body);
      if (!parsed.success) return reply.code(400).send({ error: zodError(parsed.error) });
      const input = parsed.data;

      const current = await prisma.product.findUnique({
        where: { id },
        select: { id: true, price: true },
      });
      if (!current) {
        return reply.code(404).send({ error: 'El producto no existe.', code: 'NOT_FOUND' });
      }

      // Contra el precio que quedará, no contra el que llega: un PATCH que solo
      // sube el precio podría dejar el tachado por debajo y anunciar un
      // descuento que no existe.
      const price = input.price ?? current.price;
      if (input.compareAtPrice != null && input.compareAtPrice <= price) {
        return reply
          .code(400)
          .send({ error: 'El precio tachado tiene que ser mayor que el precio de venta.' });
      }

      if (input.categoryId !== undefined) {
        const category = await prisma.category.findUnique({
          where: { id: input.categoryId },
          select: { id: true },
        });
        if (!category) return reply.code(400).send({ error: 'La categoría indicada no existe.' });
      }
      if (input.brandId !== undefined) {
        const brand = await prisma.brand.findUnique({
          where: { id: input.brandId },
          select: { id: true },
        });
        if (!brand) return reply.code(400).send({ error: 'La marca indicada no existe.' });
      }

      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (input.sku !== undefined) data.sku = input.sku;
      if (input.name !== undefined) data.name = input.name;
      if (input.categoryId !== undefined) data.categoryId = input.categoryId;
      if (input.brandId !== undefined) data.brandId = input.brandId;
      if (input.price !== undefined) data.price = input.price;
      if (input.compareAtPrice !== undefined) data.compareAtPrice = input.compareAtPrice;
      if (input.cost !== undefined) data.cost = input.cost;
      if (input.taxRate !== undefined) data.taxRate = input.taxRate;
      if (input.minStock !== undefined) data.minStock = input.minStock;
      if (input.active !== undefined) data.active = input.active;
      if (input.featured !== undefined) data.featured = input.featured;
      if (input.tags !== undefined) data.tags = input.tags;
      if (input.content !== undefined) data.content = input.content;
      if (input.description !== undefined) data.description = input.description;
      if (input.usage !== undefined) data.usage = input.usage;
      if (input.images !== undefined) data.images = input.images;
      if (input.shades !== undefined) data.shades = toJson(input.shades);
      if (input.sizes !== undefined) data.sizes = toJson(input.sizes);

      // El slug solo cambia si lo piden explícitamente: renombrar un producto
      // no puede romper el enlace que ya está en Instagram o en un favorito.
      if (input.slug !== undefined) {
        const slug = slugify(input.slug);
        if (await productSlugTaken(id)(slug)) {
          return reply
            .code(409)
            .send({ error: `La dirección /${slug} ya la usa otro producto.`, code: 'DUPLICATE' });
        }
        data.slug = slug;
      }

      const updated = await prisma.product.update({ where: { id }, data, include: productInclude });
      return serializeAdminProduct(updated);
    });

    secured.delete('/api/admin/products/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsedQuery = hardQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) return reply.code(400).send({ error: zodError(parsedQuery.error) });
      const hard = parsedQuery.data.hard === 'true';

      const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
      if (!product) {
        return reply.code(404).send({ error: 'El producto no existe.', code: 'NOT_FOUND' });
      }

      if (!hard) {
        const updated = await prisma.product.update({
          where: { id },
          data: { active: false },
          include: productInclude,
        });
        return serializeAdminProduct(updated);
      }

      const sold = await prisma.orderItem.count({ where: { productId: id } });
      if (sold > 0) {
        return reply.code(409).send({
          error: `No se puede borrar: el producto aparece en ${sold} línea(s) de pedidos y borrarlo dejaría esos pedidos apuntando al vacío. Desactívalo en su lugar.`,
        });
      }

      await prisma.product.delete({ where: { id } });
      return { id, deleted: true };
    });

    // -----------------------------------------------------------------------
    // Categorías
    // -----------------------------------------------------------------------

    secured.get('/api/admin/categories', async () => {
      const categories = await prisma.category.findMany({
        // Aquí sí salen las inactivas: el panel es el único sitio desde donde
        // se pueden volver a encender.
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { products: true } } },
      });

      return categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
        image: category.image,
        order: category.order,
        active: category.active,
        productCount: category._count.products,
      }));
    });

    secured.post('/api/admin/categories', async (request, reply) => {
      const parsed = categoryCreateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: zodError(parsed.error) });
      const input = parsed.data;

      const slug = await uniqueSlug(
        input.slug ?? input.name,
        input.name,
        async (candidate) => (await prisma.category.count({ where: { slug: candidate } })) > 0,
      );

      const created = await prisma.category.create({
        data: {
          slug,
          name: input.name,
          description: input.description,
          image: input.image ?? null,
          order: input.order,
          active: input.active,
        },
      });

      return reply.code(201).send({ ...created, productCount: 0 });
    });

    secured.patch('/api/admin/categories/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = categoryUpdateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: zodError(parsed.error) });
      const input = parsed.data;

      const current = await prisma.category.findUnique({ where: { id }, select: { id: true } });
      if (!current) {
        return reply.code(404).send({ error: 'La categoría no existe.', code: 'NOT_FOUND' });
      }

      const data: Prisma.CategoryUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.image !== undefined) data.image = input.image;
      if (input.order !== undefined) data.order = input.order;
      if (input.active !== undefined) data.active = input.active;

      if (input.slug !== undefined) {
        const slug = slugify(input.slug);
        const taken = await prisma.category.count({ where: { slug, id: { not: id } } });
        if (taken > 0) {
          return reply
            .code(409)
            .send({ error: `La dirección /${slug} ya la usa otra categoría.`, code: 'DUPLICATE' });
        }
        data.slug = slug;
      }

      const updated = await prisma.category.update({
        where: { id },
        data,
        include: { _count: { select: { products: true } } },
      });
      const { _count, ...rest } = updated;
      return { ...rest, productCount: _count.products };
    });

    secured.delete('/api/admin/categories/:id', async (request, reply) => {
      const { id } = request.params as { id: string };

      const category = await prisma.category.findUnique({
        where: { id },
        include: { _count: { select: { products: true } } },
      });
      if (!category) {
        return reply.code(404).send({ error: 'La categoría no existe.', code: 'NOT_FOUND' });
      }
      if (category._count.products > 0) {
        return reply.code(409).send({
          error: `No se puede borrar: ${category._count.products} producto(s) siguen en esta categoría. Muévelos a otra o desactívala.`,
        });
      }

      await prisma.category.delete({ where: { id } });
      return { id, deleted: true };
    });

    // -----------------------------------------------------------------------
    // Marcas
    // -----------------------------------------------------------------------

    secured.get('/api/admin/brands', async () => {
      const brands = await prisma.brand.findMany({
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { products: true } } },
      });

      return brands.map((brand) => ({
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        featured: brand.featured,
        order: brand.order,
        active: brand.active,
        productCount: brand._count.products,
      }));
    });

    secured.post('/api/admin/brands', async (request, reply) => {
      const parsed = brandCreateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: zodError(parsed.error) });
      const input = parsed.data;

      const slug = await uniqueSlug(
        input.slug ?? input.name,
        input.name,
        async (candidate) => (await prisma.brand.count({ where: { slug: candidate } })) > 0,
      );

      const created = await prisma.brand.create({
        data: {
          slug,
          name: input.name,
          featured: input.featured,
          order: input.order,
          active: input.active,
        },
      });

      return reply.code(201).send({ ...created, productCount: 0 });
    });

    secured.patch('/api/admin/brands/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = brandUpdateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: zodError(parsed.error) });
      const input = parsed.data;

      const current = await prisma.brand.findUnique({ where: { id }, select: { id: true } });
      if (!current) return reply.code(404).send({ error: 'La marca no existe.', code: 'NOT_FOUND' });

      const data: Prisma.BrandUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.featured !== undefined) data.featured = input.featured;
      if (input.order !== undefined) data.order = input.order;
      if (input.active !== undefined) data.active = input.active;

      if (input.slug !== undefined) {
        const slug = slugify(input.slug);
        const taken = await prisma.brand.count({ where: { slug, id: { not: id } } });
        if (taken > 0) {
          return reply
            .code(409)
            .send({ error: `La dirección /${slug} ya la usa otra marca.`, code: 'DUPLICATE' });
        }
        data.slug = slug;
      }

      const updated = await prisma.brand.update({
        where: { id },
        data,
        include: { _count: { select: { products: true } } },
      });
      const { _count, ...rest } = updated;
      return { ...rest, productCount: _count.products };
    });

    secured.delete('/api/admin/brands/:id', async (request, reply) => {
      const { id } = request.params as { id: string };

      const brand = await prisma.brand.findUnique({
        where: { id },
        include: { _count: { select: { products: true } } },
      });
      if (!brand) return reply.code(404).send({ error: 'La marca no existe.', code: 'NOT_FOUND' });
      if (brand._count.products > 0) {
        return reply.code(409).send({
          error: `No se puede borrar: ${brand._count.products} producto(s) siguen asociados a esta marca. Reasígnalos o desactívala.`,
        });
      }

      await prisma.brand.delete({ where: { id } });
      return { id, deleted: true };
    });
  });
}
