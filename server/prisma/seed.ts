/**
 * Siembra de Aurelle.
 *
 * El panel no se puede juzgar con la base vacía: las tres gráficas salen
 * planas, las alertas de stock no tienen a quién avisar y las estadísticas de
 * promociones muestran ceros. Este archivo inventa una tienda que lleva
 * `env.seedMonths` meses abierta, con su historia completa.
 *
 * Tres decisiones que conviene entender antes de tocar nada:
 *
 *   1. ESTRATEGIA DE IDEMPOTENCIA — mixta, a propósito.
 *      El catálogo (categorías, marcas, productos) va por `upsert` porque sus
 *      ids son literales (`c1`…`c9`, `p1`…`p16`) y tienen que sobrevivir: los
 *      carritos y favoritos guardados en el `localStorage` de quien ya abrió
 *      la demo apuntan a esos ids, y borrarlos dejaría carritos fantasma.
 *      Lo transaccional (pedidos, líneas, movimientos, promociones) se borra
 *      entero antes de volver a sembrar, porque sus ids son generados y no hay
 *      llave natural por la que hacer `upsert`: sin el borrado, cada siembra
 *      duplicaría la historia y los ingresos del panel se irían al doble.
 *      Usuarios y ajustes van por `upsert` sin borrado, para no tumbar la
 *      contraseña de quien ya entra al panel.
 *
 *   2. EL STOCK SE CALCULA, NO SE DECLARA.
 *      El stock final de cada producto tiene que ser el que enseña el catálogo
 *      estático (p7 en 0, p10 en 3…) Y cuadrar con la suma de sus movimientos.
 *      Si no cuadra, el historial del panel contradice a la tabla de
 *      inventario y nadie sabe a cuál creerle. Por eso el libro mayor se
 *      construye hacia adelante (INITIAL, luego compras y ventas por fecha) y
 *      las compras se ajustan al final para aterrizar exactamente en el
 *      objetivo. Ver `buildLedger` y `reconcileToTarget`.
 *
 *   3. NADA DE `Math.random()`.
 *      Dos siembras tienen que dar exactamente los mismos números o no hay
 *      forma de comparar un cambio del panel contra el de ayer. El generador
 *      es un mulberry32 con la semilla de `env.seedRandom`.
 */

import 'dotenv/config';
import {
  MovementType,
  OrderStatus,
  PopupFrequency,
  PrismaClient,
  PromotionScope,
  PromotionType,
  SalesChannel,
  UserRole,
  Prisma,
} from '@prisma/client';
import { env } from '../src/env.js';
import { hashPassword } from '../src/auth.js';
import { SETTING_DEFAULTS } from '../src/settings-defaults.js';
import { incrementStock } from '../src/inventory.js';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

// ---------------------------------------------------------------------------
// Generador pseudoaleatorio
// ---------------------------------------------------------------------------

/**
 * mulberry32: 32 bits de estado, distribución suficiente para datos de demo y
 * cuatro líneas de código. Implementado a mano y no traído de una librería
 * para que la secuencia quede clavada al archivo: si mañana cambia la versión
 * de un paquete, los números del panel no se mueven.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(env.seedRandom);

/** Entero en [min, max], ambos incluidos. */
const randInt = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));

/** Flotante en [min, max). */
const randFloat = (min: number, max: number): number => min + rand() * (max - min);

const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;

/** Elige según pesos relativos. Devuelve el índice. */
function pickWeighted(weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i += 1) {
    r -= weights[i] as number;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / DAY_MS);

/** N-ésimo día de la semana de un mes: el 2.º domingo de mayo, por ejemplo. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (nth - 1) * 7);
}

const fmtDate = (d: Date): string =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

const money = (n: number): string => `$${n.toLocaleString('es-CO')}`;

// ---------------------------------------------------------------------------
// Catálogo: copia fiel de src/data/catalog.ts
// ---------------------------------------------------------------------------

// Las mismas funciones del catálogo estático, no una versión parecida: el
// `slug` y el `ref` que publica la tienda salen de aquí, y una diferencia de
// una tilde dejaría sin abrir las fichas que ya están enlazadas por ahí.
const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const slugify = (s: string): string =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

type ProductTag = 'best' | 'new' | 'pro';
interface Shade {
  readonly name: string;
  readonly hex: string;
}
interface SizeOption {
  readonly label: string;
  readonly price?: number;
}

/** [id, nombre, descripción corta, texto de ficha, texto de uso]. */
type CategoryRow = readonly [string, string, string, string, string];

const CATS: readonly CategoryRow[] = [
  ['c1', 'Uñas y manicura', 'Bases, limas, top coats y todo para una manicura impecable.',
    'Fórmula autonivelante de alta adherencia, pensada para el trabajo diario en cabina. Mantiene el brillo y la flexibilidad hasta por tres semanas sin levantamientos.',
    'Prepara la uña, deshidrata y aplica una capa fina. Cura 60 s en LED o 120 s en UV.'],
  ['c2', 'Esmaltes semipermanentes', 'Color de larga duración con acabado de salón.',
    'Pigmentación intensa desde la primera capa, textura cremosa y nivelación impecable. Acabado de salón que dura hasta 21 días con el cuidado adecuado.',
    'Sobre base curada, aplica dos capas finas curando 60 s LED cada una. Sella con top coat.'],
  ['c3', 'Gel, acrílico y polygel', 'Construcción y esculpido para extensiones perfectas.',
    'Viscosidad media que permite esculpir sin escurrir. Ideal para extensiones, nivelación y refuerzo de uña natural.',
    'Aplica con pincel o espátula, modela la curva C y cura 60–90 s en LED. Lima y sella.'],
  ['c4', 'Nail art y decoración', 'Foils, pigmentos, cristales y pinceles de detalle.',
    'Detalles que transforman un diseño. Materiales seleccionados para precisión, brillo y fijación duradera.',
    'Aplica sobre capa de gel sin curar o con adhesivo específico. Sella con top coat no-wipe.'],
  ['c5', 'Herramientas y equipos', 'Lámparas, tornos e instrumental profesional.',
    'Equipo de uso profesional con componentes de alta durabilidad y garantía oficial de 12 meses.',
    'Lee el manual antes del primer uso. Limpia y desinfecta después de cada servicio.'],
  ['c6', 'Pestañas y cejas', 'Extensiones, lifting y diseño de mirada.',
    'Fibras suaves de alta calidad que conservan la curva, ligeras y cómodas para la clienta.',
    'Aísla la pestaña natural, aplica adhesivo en punto y fija a 1 mm del párpado.'],
  ['c7', 'Cuidado de manos y pies', 'Tratamientos, exfoliantes y rituales spa.',
    'Ingredientes nutritivos que restauran la piel y cutículas después de cada servicio. Textura ligera de rápida absorción.',
    'Masajea sobre piel limpia hasta su completa absorción. Úsalo a diario.'],
  ['c8', 'Maquillaje y cosmética', 'Fórmulas profesionales para piel y rostro.',
    'Cobertura modulable con acabado natural y larga duración para trabajos de maquillaje profesional.',
    'Aplica con brocha o esponja húmeda desde el centro del rostro hacia afuera.'],
  ['c9', 'Accesorios profesionales', 'Organización, protección e higiene para tu estación.',
    'Diseñado para mantener tu estación ordenada, limpia y lista para cada clienta.',
    'Limpia con paño húmedo y alcohol isopropílico. Evita solventes fuertes.'],
];

/** Marcas ficticias. No hay ni habrá marcas reales de cosmética aquí. */
const BRAND_NAMES: readonly string[] = [
  'Velours Pro',
  'Nácar Lab',
  'Atelier Nº9',
  'Lumière Gel',
  'Solenne',
  'Kirei',
  'Maré Cosmetics',
  'Oriel Lash',
];

const sh = (list: ReadonlyArray<readonly [string, string]>): Shade[] =>
  list.map(([name, hex]) => ({ name, hex }));

const SEMI = sh([['Rosé Silk', '#D9A5AE'], ['Nude Veil', '#E3C1B3'], ['Milk Bath', '#F1E6DF'], ['Cherry Lacquer', '#9E1F36'], ['Bordeaux', '#5E2433'], ['Mocha', '#7A5347'], ['Noir', '#242124']]);
const RUBBER = sh([['Cover Pink', '#EBC3C6'], ['Clear', '#F4F1EE'], ['Milky White', '#F5EFE8'], ['Peach', '#EDBBA6']]);
const POLY = sh([['Nude Rose', '#E3B7B0'], ['Soft Beige', '#E6CDB5'], ['Clear', '#F2EFEC'], ['Cover Mauve', '#C99AA3']]);
const SKIN = sh([['N10 Porcelana', '#F1D6C6'], ['N20 Marfil', '#E6C3A8'], ['N30 Miel', '#CFA07C'], ['N40 Canela', '#A87555'], ['N50 Cacao', '#7A4E36']]);
const CHROME = sh([['Silver', '#C9CBD0'], ['Rosé Gold', '#D4A08E'], ['Aurora', '#C7B8E0']]);

/**
 * [id, nombre, marca, categoría, precio, precio tachado, rating, reseñas,
 *  stock objetivo, tags, contenido, tonos?, tamaños?]
 *
 * Igual al `ROWS` del catálogo estático, columna por columna. El `stock` de
 * esta tabla es el que la siembra tiene que reproducir exactamente al final.
 */
type ProductRow = readonly [
  string, string, string, string, number, number, number, number, number,
  readonly ProductTag[], string, (readonly Shade[])?, (readonly SizeOption[])?,
];

const ROWS: readonly ProductRow[] = [
  ['p1', 'Esmalte semipermanente Rosé Silk', 'Velours Pro', 'c2', 32900, 39900, 4.9, 312, 24, ['best', 'pro'], '15 ml', SEMI],
  ['p2', 'Builder Gel Clear Sculpt', 'Lumière Gel', 'c3', 32900, 0, 4.8, 198, 12, ['best', 'pro'], 'Según presentación', undefined, [{ label: '15 g', price: 32900 }, { label: '30 g', price: 49900 }, { label: '50 g', price: 68900 }]],
  ['p3', 'Lámpara UV/LED Aura 48W', 'Atelier Nº9', 'c5', 219900, 259900, 4.7, 86, 5, ['pro'], '1 unidad'],
  ['p4', 'Kit polygel Nude Collection', 'Nácar Lab', 'c3', 124900, 0, 4.8, 64, 9, ['new'], '4 × 30 g', POLY],
  ['p5', 'Set de pinceles Nail Art · 7 piezas', 'Atelier Nº9', 'c4', 45900, 0, 4.9, 141, 30, ['best'], '7 pinceles'],
  ['p6', 'Top coat No-Wipe Glass', 'Velours Pro', 'c1', 29900, 0, 4.9, 405, 50, ['best', 'pro'], '15 ml'],
  ['p7', 'Extensiones de pestañas Volume 0.07', 'Oriel Lash', 'c6', 54900, 64900, 4.6, 77, 0, ['pro'], '16 líneas', undefined, [{ label: 'Curva C' }, { label: 'Curva D' }, { label: 'Curva CC' }]],
  ['p8', 'Aceite de cutícula Almendra & Rosa', 'Solenne', 'c7', 24900, 0, 4.8, 219, 40, ['new'], '12 ml'],
  ['p9', 'Foils holográficos Chrome Edit', 'Kirei', 'c4', 19900, 26900, 4.5, 58, 18, ['new'], '10 rollos', CHROME],
  ['p10', 'Torno profesional Silk 35.000 RPM', 'Atelier Nº9', 'c5', 389900, 0, 4.8, 42, 3, ['pro'], '1 unidad + 6 fresas'],
  ['p11', 'Base rubber Cover', 'Lumière Gel', 'c1', 36900, 0, 4.9, 267, 22, ['best', 'pro'], '15 ml', RUBBER],
  ['p12', 'Base de maquillaje Skin Veil', 'Maré Cosmetics', 'c8', 79900, 94900, 4.6, 93, 14, ['new'], '30 ml', SKIN],
  ['p13', 'Crema de manos Cashmere', 'Solenne', 'c7', 42900, 0, 4.7, 110, 25, [], '250 ml'],
  ['p14', 'Organizador acrílico de esmaltes', 'Kirei', 'c9', 89900, 0, 4.5, 31, 7, ['new'], '48 espacios'],
  ['p15', 'Kit Lash Lift profesional', 'Oriel Lash', 'c6', 139900, 0, 4.8, 56, 6, ['pro'], '12 servicios'],
  ['p16', 'Cristales mix · 1.440 unidades', 'Kirei', 'c4', 64900, 74900, 4.7, 88, 11, [], '12 tamaños'],
];

// ---------------------------------------------------------------------------
// Lo que el catálogo estático no trae y el panel sí necesita
// ---------------------------------------------------------------------------

/**
 * Costo como fracción del precio de venta. INVENTADO: la tienda estática no
 * guarda costos y el panel calcula el margen con ellos, así que sin esto el
 * margen saldría igual al ingreso.
 *
 * El criterio es el del rubro: el margen cae a medida que sube el ticket y
 * baja la rotación. Un equipo de 390.000 se vende casi al costo más un
 * porcentaje fijo porque el proveedor fija el precio de lista y la clienta
 * compara; un esmalte de 32.900 se rota mucho, se compra por caja y aguanta
 * más del doble de margen.
 */
const COST_RATIO: Readonly<Record<string, number>> = {
  c1: 0.48, // manicura: consumible de rotación alta
  c2: 0.45, // esmaltes: el mejor margen del catálogo
  c3: 0.55, // gel y polygel: importado y con merma al trasvasar
  c4: 0.5, // nail art: barato de comprar pero se queda parado
  c5: 0.72, // equipos: precio de lista del proveedor, margen delgado
  c6: 0.55, // pestañas: consumible técnico, competencia fuerte
  c7: 0.52, // cuidado: fórmula nacional, margen medio
  c8: 0.6, // maquillaje: marcas con precio sugerido
  c9: 0.58, // accesorios: importados, flete caro y volumen bajo
};

/** El costo queda redondeado a la centena: el proveedor no factura pesos sueltos. */
const costOf = (price: number, categoryId: string): number =>
  Math.round((price * (COST_RATIO[categoryId] ?? 0.55)) / 100) * 100;

/**
 * Mínimo de reposición y tamaño de lote de compra, por referencia.
 *
 * No un 5 para todos: el mínimo es "lo que se vende mientras llega el pedido
 * al proveedor" (unas tres semanas). Un top coat que sale a diario necesita 15
 * de colchón; un torno que sale una vez al mes necesita 4, y comprar más sería
 * dejar 1,5 millones quietos en un estante.
 *
 * `lot` es lo que se pide cuando toca reponer: aproximadamente un mes de
 * venta, para no pagar flete cada semana.
 *
 * `weight` es el peso con el que la referencia entra en los pedidos que se
 * inventan. Un esmalte se vende veinte veces más que un torno.
 */
interface ProductPlan {
  readonly minStock: number;
  readonly lot: number;
  readonly weight: number;
}

const PLAN: Readonly<Record<string, ProductPlan>> = {
  p1: { minStock: 12, lot: 40, weight: 18 },
  p2: { minStock: 8, lot: 20, weight: 9 },
  p3: { minStock: 6, lot: 6, weight: 2 },
  p4: { minStock: 4, lot: 10, weight: 4 },
  p5: { minStock: 10, lot: 24, weight: 8 },
  p6: { minStock: 15, lot: 50, weight: 20 },
  p7: { minStock: 6, lot: 12, weight: 5 },
  p8: { minStock: 12, lot: 36, weight: 12 },
  p9: { minStock: 8, lot: 20, weight: 7 },
  p10: { minStock: 4, lot: 4, weight: 1 },
  p11: { minStock: 10, lot: 30, weight: 14 },
  p12: { minStock: 5, lot: 12, weight: 5 },
  p13: { minStock: 8, lot: 20, weight: 8 },
  p14: { minStock: 3, lot: 8, weight: 3 },
  p15: { minStock: 3, lot: 6, weight: 2 },
  p16: { minStock: 4, lot: 10, weight: 4 },
};

interface SeedProduct {
  readonly id: string;
  readonly sku: string;
  readonly slug: string;
  readonly name: string;
  readonly brandSlug: string;
  readonly categoryId: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly cost: number;
  readonly rating: number;
  readonly reviewCount: number;
  readonly targetStock: number;
  readonly minStock: number;
  readonly lot: number;
  readonly weight: number;
  readonly tags: readonly ProductTag[];
  readonly content: string;
  readonly description: string;
  readonly usage: string;
  readonly images: readonly string[];
  readonly shades: readonly Shade[] | null;
  readonly sizes: readonly SizeOption[] | null;
  readonly featured: boolean;
}

const PRODUCTS: readonly SeedProduct[] = ROWS.map((row) => {
  const [id, name, brand, categoryId, price, old, rating, reviewCount, stock, tags, content, shades, sizes] = row;
  const cat = CATS.find((c) => c[0] === categoryId);
  if (!cat) throw new Error(`El producto ${id} apunta a la categoría inexistente ${categoryId}.`);
  const plan = PLAN[id];
  if (!plan) throw new Error(`Falta el plan de reposición de ${id}.`);

  // Misma fórmula de referencia que el catálogo estático: iniciales en
  // mayúscula de la marca + un consecutivo. Es lo que se sirve como `ref`.
  const sku = `${brand.replace(/[^A-Z]/g, '').slice(0, 2)}-${1000 + parseInt(id.slice(1), 10) * 37}`;

  return {
    id,
    sku,
    slug: slugify(name),
    name,
    brandSlug: slugify(brand),
    categoryId,
    price,
    compareAtPrice: old || null,
    cost: costOf(price, categoryId),
    rating,
    reviewCount,
    targetStock: stock,
    minStock: plan.minStock,
    lot: plan.lot,
    weight: plan.weight,
    tags,
    content,
    description: cat[3],
    usage: cat[4],
    images: [`/images/products/${id}-a.svg`, `/images/products/${id}-b.svg`],
    shades: shades ?? null,
    sizes: sizes ?? null,
    featured: tags.includes('best'),
  };
});

const productById = new Map(PRODUCTS.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// Clientela
// ---------------------------------------------------------------------------

const FIRST_NAMES: readonly string[] = [
  'Laura', 'Daniela', 'Camila', 'Valentina', 'Mariana', 'Andrea', 'Paula', 'Juliana',
  'Sofía', 'Catalina', 'Natalia', 'Isabella', 'Alejandra', 'Carolina', 'Manuela',
  'Luisa', 'Ximena', 'Tatiana', 'Angie', 'Yuliana', 'Diana', 'Verónica', 'Estefanía',
  'Johana', 'Melissa', 'Sara', 'Gabriela', 'Lorena', 'Vanessa', 'Adriana',
];

const LAST_NAMES: readonly string[] = [
  'Gómez', 'Rodríguez', 'Martínez', 'Ospina', 'Restrepo', 'Vargas', 'Cardona',
  'Quintero', 'Zapata', 'Muñoz', 'Arias', 'Giraldo', 'Betancur', 'Mejía', 'Londoño',
  'Salazar', 'Ramírez', 'Castaño', 'Hurtado', 'Palacio', 'Moreno', 'Cortés',
  'Jaramillo', 'Velásquez', 'Agudelo', 'Bedoya', 'Orozco', 'Sepúlveda',
];

const CITIES: readonly string[] = [
  'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Cartagena',
  'Pereira', 'Manizales', 'Ibagué', 'Santa Marta', 'Villavicencio', 'Cúcuta',
  'Armenia', 'Neiva', 'Pasto', 'Envigado', 'Chía', 'Popayán', 'Montería', 'Sincelejo',
];

/** Pesos de ciudad: Bogotá y Medellín concentran la mayoría de los pedidos. */
const CITY_WEIGHTS: readonly number[] = [
  26, 22, 12, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 1, 1, 3, 2, 1, 1, 1,
];

const PAYMENTS_ONLINE: readonly string[] = ['Tarjeta de crédito', 'PSE', 'Nequi', 'Bancolombia a la mano'];
const PAYMENTS_SOCIAL: readonly string[] = ['Nequi', 'Bancolombia a la mano', 'Daviplata', 'Contra entrega'];
const PAYMENTS_COUNTER: readonly string[] = ['Efectivo', 'Datáfono', 'Nequi'];

interface Customer {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly city: string;
}

function makeCustomer(): Customer {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const second = pick(LAST_NAMES);
  const city = CITIES[pickWeighted(CITY_WEIGHTS)] as string;
  // @example.com está reservado por la RFC 2606 justamente para esto: ninguna
  // dirección inventada aquí puede caer en el buzón de una persona real.
  const email = `${normalize(first)}.${normalize(last)}${randInt(10, 99)}@example.com`;
  return {
    name: `${first} ${last} ${second}`,
    email,
    phone: `+57 3${randInt(0, 2)}${randInt(0, 9)} ${randInt(100, 999)} ${randInt(1000, 9999)}`,
    city,
  };
}

// ---------------------------------------------------------------------------
// Promociones
// ---------------------------------------------------------------------------

const NOW = new Date();
const TODAY = startOfDay(NOW);
/** Primer día de la historia. `seedMonths` meses hacia atrás, a medianoche. */
const FIRST_DAY = new Date(TODAY.getFullYear(), TODAY.getMonth() - env.seedMonths, TODAY.getDate());
const TOTAL_DAYS = daysBetween(FIRST_DAY, TODAY);

/** Black friday del año pasado o de este, el que caiga dentro de la historia. */
function blackFridayOf(year: number): Date {
  return addDays(nthWeekday(year, 10, 4, 4), 1);
}

const LAST_BLACK_FRIDAY = (() => {
  const thisYear = blackFridayOf(TODAY.getFullYear());
  return thisYear <= TODAY ? thisYear : blackFridayOf(TODAY.getFullYear() - 1);
})();

interface SeedPromotion {
  readonly data: Prisma.PromotionCreateManyInput;
  /** Devuelve el descuento en pesos, o null si el pedido no califica. */
  readonly apply: (lines: readonly OrderLine[], subtotal: number) => number | null;
  /** Deja el envío en cero además del descuento. */
  readonly freeShipping: boolean;
}

/** Línea de pedido tal como se arma antes de tocar la base. */
interface OrderLine {
  readonly product: SeedProduct;
  readonly variant: string | null;
  readonly quantity: number;
  readonly lineTotal: number;
}

const PROMOTIONS: readonly SeedPromotion[] = [
  {
    // Activa y anunciada: es la que tiene que ver el pop-up del panel.
    data: {
      id: 'promo-semana-semi',
      name: 'Semana del semipermanente',
      code: null,
      type: PromotionType.PERCENTAGE,
      scope: PromotionScope.CATEGORY,
      targetIds: ['c2'],
      value: 15,
      maxDiscount: 60000,
      minPurchase: 0,
      startsAt: addDays(TODAY, -9),
      endsAt: addDays(TODAY, 12),
      active: true,
      priority: 30,
      usageLimit: null,
      showPopup: true,
      popupTitle: '15 % en esmaltes semipermanentes',
      popupSubtitle: 'Toda la carta de color Velours Pro, hasta el domingo.',
      popupBadge: 'Solo esta semana',
      popupImage: '/images/categories/c2.jpg',
      popupCtaLabel: 'Ver la carta de color',
      popupCtaUrl: '/tienda?cat=esmaltes-semipermanentes',
      popupFrequency: PopupFrequency.SESSION,
      popupDelayMs: 1800,
      popupViews: 1842,
      popupClicks: 237,
      popupDismissed: 611,
      createdAt: addDays(TODAY, -12),
    },
    freeShipping: false,
    apply: (lines) => {
      const base = lines
        .filter((l) => l.product.categoryId === 'c2')
        .reduce((sum, l) => sum + l.lineTotal, 0);
      if (base === 0) return null;
      return Math.min(Math.round(base * 0.15), 60000);
    },
  },
  {
    // Envío gratis con mínimo: lleva meses corriendo y no se anuncia en pop-up
    // porque ya está escrito en la barra superior de la tienda.
    data: {
      id: 'promo-envio-gratis',
      name: 'Envío gratis desde $180.000',
      code: null,
      type: PromotionType.FREE_SHIPPING,
      scope: PromotionScope.ALL,
      targetIds: [],
      value: 0,
      maxDiscount: null,
      minPurchase: 180000,
      startsAt: addDays(TODAY, -150),
      endsAt: null,
      active: true,
      priority: 10,
      usageLimit: null,
      showPopup: false,
      popupFrequency: PopupFrequency.ONCE,
      popupDelayMs: 1200,
      popupViews: 0,
      popupClicks: 0,
      popupDismissed: 0,
      createdAt: addDays(TODAY, -152),
    },
    freeShipping: true,
    // El beneficio viaja en `shipping`, no en `discount`: si se registrara
    // como descuento, el total del pedido saldría por debajo de lo cobrado.
    apply: (_lines, subtotal) => (subtotal >= 180000 ? 0 : null),
  },
  {
    // Vencida: corrió en black friday y sus fechas ya pasaron. El panel la
    // necesita para tener algo que enseñar en "promociones terminadas".
    data: {
      id: 'promo-black-friday',
      name: 'Black Friday Aurelle',
      code: 'BLACKAURELLE',
      type: PromotionType.PERCENTAGE,
      scope: PromotionScope.ALL,
      targetIds: [],
      value: 25,
      maxDiscount: 150000,
      // Sin compra mínima: un "25 % en todo" con letra menuda no es black
      // friday, y con mínimo la mitad de los pedidos del fin de semana se
      // quedaban sin descuento y la promoción salía en el panel casi vacía.
      minPurchase: 0,
      startsAt: addDays(LAST_BLACK_FRIDAY, -3),
      endsAt: addDays(LAST_BLACK_FRIDAY, 3),
      active: true,
      priority: 90,
      usageLimit: null,
      showPopup: true,
      popupTitle: 'Black Friday: 25 % en todo',
      popupSubtitle: 'Cuatro días. Sin letra menuda.',
      popupBadge: '25 % OFF',
      popupImage: '/images/editorial/edit-main.jpg',
      popupCtaLabel: 'Entrar a la tienda',
      popupCtaUrl: '/tienda',
      popupFrequency: PopupFrequency.DAILY,
      popupDelayMs: 900,
      popupViews: 5214,
      popupClicks: 908,
      popupDismissed: 1743,
      createdAt: addDays(LAST_BLACK_FRIDAY, -9),
    },
    freeShipping: false,
    apply: (_lines, subtotal) => Math.min(Math.round(subtotal * 0.25), 150000),
  },
  {
    // Programada: empieza el mes entrante. Nunca aplicó a un pedido.
    data: {
      id: 'promo-preventa-navidad',
      name: 'Preventa Navidad · nail art',
      code: 'NAVIDAD20',
      type: PromotionType.PERCENTAGE,
      scope: PromotionScope.CATEGORY,
      targetIds: ['c4'],
      value: 20,
      maxDiscount: 80000,
      minPurchase: 0,
      startsAt: addDays(TODAY, 24),
      endsAt: addDays(TODAY, 45),
      active: true,
      priority: 40,
      usageLimit: 300,
      showPopup: true,
      popupTitle: 'Preventa de Navidad',
      popupSubtitle: '20 % en nail art antes de que se agote el cromo.',
      popupBadge: 'Próximamente',
      popupCtaLabel: 'Avísame',
      popupCtaUrl: '/tienda?cat=nail-art-y-decoracion',
      popupFrequency: PopupFrequency.ONCE,
      popupDelayMs: 2400,
      popupViews: 0,
      popupClicks: 0,
      popupDismissed: 0,
      createdAt: addDays(TODAY, -3),
    },
    freeShipping: false,
    apply: () => null,
  },
  {
    // Apagada a mano: las fechas siguen vigentes pero `active` es false.
    // Es el caso que distingue "vencida" de "desactivada" en el panel.
    data: {
      id: 'promo-bienvenida',
      name: 'Bienvenida AURELLE10',
      code: 'AURELLE10',
      type: PromotionType.FIXED_AMOUNT,
      scope: PromotionScope.ALL,
      targetIds: [],
      value: 10000,
      maxDiscount: null,
      minPurchase: 80000,
      startsAt: addDays(TODAY, -60),
      endsAt: addDays(TODAY, 60),
      active: false,
      priority: 5,
      usageLimit: 500,
      showPopup: false,
      popupFrequency: PopupFrequency.ONCE,
      popupDelayMs: 1200,
      popupViews: 0,
      popupClicks: 0,
      popupDismissed: 0,
      createdAt: addDays(TODAY, -62),
    },
    freeShipping: false,
    apply: () => null,
  },
];

// ---------------------------------------------------------------------------
// Ritmo de la tienda
// ---------------------------------------------------------------------------

/** Lunes flojo, viernes y sábado fuertes, domingo casi cerrado. */
const WEEKDAY_FACTOR: readonly number[] = [0.55, 0.9, 0.95, 1.0, 1.1, 1.45, 1.5];

/**
 * Multiplicador de fechas comerciales colombianas.
 *
 * La semana previa manda, no el día mismo: quien trabaja uñas compra insumo
 * antes de la avalancha de citas, no el día de la madre por la tarde.
 */
function seasonFactor(d: Date): number {
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();

  // Día de la madre en Colombia: segundo domingo de mayo.
  const mothers = nthWeekday(year, 4, 0, 2);
  const toMothers = daysBetween(d, mothers);
  if (toMothers >= 0 && toMothers <= 8) return 1.85;

  // Amor y amistad: tercer sábado de septiembre.
  const friendship = nthWeekday(year, 8, 6, 3);
  const toFriendship = daysBetween(d, friendship);
  if (toFriendship >= 0 && toFriendship <= 7) return 1.7;

  // Black friday: el viernes siguiente al cuarto jueves de noviembre.
  const bf = blackFridayOf(year);
  const toBf = daysBetween(d, bf);
  if (toBf >= -3 && toBf <= 2) return 2.25;

  // Diciembre: temporada alta hasta el 23; después se apaga hasta reyes.
  if (month === 11 && day <= 23) return 1.6;
  if (month === 11) return 0.45;
  if (month === 0 && day <= 12) return 0.6; // la cuesta de enero es real

  return 1;
}

/** Cantidad por línea: lo caro se lleva de a uno. */
function quantityFor(product: SeedProduct): number {
  if (product.price >= 100000) return 1;
  if (product.price >= 60000) return rand() < 0.85 ? 1 : 2;
  if (product.price >= 40000) return 1 + pickWeighted([70, 25, 5]);
  return 1 + pickWeighted([48, 33, 14, 5]);
}

/** Variante a congelar en la línea: el tono o el tamaño que eligió la clienta. */
function variantFor(product: SeedProduct): string | null {
  if (product.sizes && product.sizes.length > 0) return pick(product.sizes).label;
  if (product.shades && product.shades.length > 0) return pick(product.shades).name;
  return null;
}

const PRODUCT_WEIGHTS = PRODUCTS.map((p) => p.weight);

// ---------------------------------------------------------------------------
// Generación de la historia
// ---------------------------------------------------------------------------

interface SeedOrder {
  readonly id: string;
  readonly number: string;
  readonly status: OrderStatus;
  readonly channel: SalesChannel;
  readonly customer: Customer;
  readonly subtotal: number;
  readonly discount: number;
  readonly shipping: number;
  readonly total: number;
  readonly cost: number;
  readonly promotionId: string | null;
  readonly couponCode: string | null;
  readonly paymentMethod: string;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly lines: readonly OrderLine[];
  /** Movió stock: todo menos PENDING, que aún no se pagó. */
  readonly movesStock: boolean;
  /** Devolvió el stock: CANCELLED y REFUNDED. */
  readonly returnsStock: boolean;
  readonly returnAt: Date | null;
}

const NOTES: readonly string[] = [
  'Timbrar en el local de al lado si no hay nadie.',
  'Necesita factura a nombre del estudio.',
  'Entregar después de las 2 p. m.',
  'Pedido para curso del sábado, urgente.',
  'Confirmar tono antes de despachar.',
];

/** Estado según la antigüedad: lo viejo está entregado, lo de ayer no. */
function statusFor(ageDays: number): OrderStatus {
  if (ageDays <= 1) return rand() < 0.55 ? OrderStatus.PENDING : OrderStatus.PAID;
  if (ageDays <= 3) return rand() < 0.5 ? OrderStatus.PAID : OrderStatus.PREPARING;
  if (ageDays <= 6) return rand() < 0.28 ? OrderStatus.PREPARING : OrderStatus.SHIPPED;
  if (ageDays <= 12) return rand() < 0.35 ? OrderStatus.SHIPPED : OrderStatus.DELIVERED;
  const r = rand();
  if (r < 0.032) return OrderStatus.CANCELLED;
  if (r < 0.055) return OrderStatus.REFUNDED;
  return OrderStatus.DELIVERED;
}

const SHIPPING_FEE = 14900; // = settings `shipping.fee`
const FREE_SHIPPING_FROM = 250000; // = settings `shipping.freeFrom`

function generateOrders(): SeedOrder[] {
  const orders: SeedOrder[] = [];
  let sequence = 10001;

  for (let dayIndex = 0; dayIndex <= TOTAL_DAYS; dayIndex += 1) {
    const day = addDays(FIRST_DAY, dayIndex);

    // Tendencia: la tienda abre con poco y va subiendo. Es lo que hace que el
    // "vs. periodo anterior" del panel tenga algo que comparar.
    const trend = 1.7 + 3.4 * (dayIndex / Math.max(1, TOTAL_DAYS));
    const weekday = WEEKDAY_FACTOR[day.getDay()] as number;
    const expected = trend * weekday * seasonFactor(day) * randFloat(0.75, 1.25);
    const count = Math.min(8, Math.max(1, Math.round(expected)));

    for (let n = 0; n < count; n += 1) {
      // La hora importa: el panel de hoy enseña los pedidos por hora y todos a
      // medianoche se vería falso de inmediato.
      const createdAt = new Date(
        day.getFullYear(), day.getMonth(), day.getDate(),
        randInt(8, 21), randInt(0, 59), randInt(0, 59),
      );
      if (createdAt > NOW) continue;

      const lineCount = 1 + pickWeighted([40, 32, 19, 9]);
      const chosen = new Set<string>();
      const lines: OrderLine[] = [];

      for (let l = 0; l < lineCount; l += 1) {
        let product = PRODUCTS[pickWeighted(PRODUCT_WEIGHTS)] as SeedProduct;
        let guard = 0;
        while (chosen.has(product.id) && guard < 8) {
          product = PRODUCTS[pickWeighted(PRODUCT_WEIGHTS)] as SeedProduct;
          guard += 1;
        }
        if (chosen.has(product.id)) continue;
        chosen.add(product.id);

        const quantity = quantityFor(product);
        lines.push({
          product,
          variant: variantFor(product),
          quantity,
          lineTotal: product.price * quantity,
        });
      }

      const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
      const cost = lines.reduce((sum, l) => sum + l.product.cost * l.quantity, 0);

      const channelIndex = pickWeighted([70, 22, 8]);
      const channel = [SalesChannel.ONLINE, SalesChannel.SOCIAL, SalesChannel.COUNTER][channelIndex] as SalesChannel;

      // Promoción: la de mayor prioridad que esté vigente ese día y a la que
      // el pedido llegue. No todas las clientas se enteran, de ahí el azar.
      let promotionId: string | null = null;
      let couponCode: string | null = null;
      let discount = 0;
      let shipping = channel === SalesChannel.COUNTER ? 0 : subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;

      if (channel !== SalesChannel.COUNTER) {
        const candidates = PROMOTIONS.filter((p) => {
          const d = p.data;
          if (!d.active) return false;
          const from = d.startsAt as Date;
          const to = d.endsAt as Date | null;
          return createdAt >= from && (to === null || createdAt <= to);
        }).sort((a, b) => (b.data.priority as number) - (a.data.priority as number));

        for (const promo of candidates) {
          const value = promo.apply(lines, subtotal);
          if (value === null) continue;
          // Black friday se lo lleva todo el mundo; las demás, solo quien la vio.
          const uptake = (promo.data.priority as number) >= 90 ? 0.92 : 0.78;
          if (rand() > uptake) continue;
          promotionId = promo.data.id as string;
          couponCode = (promo.data.code as string | null) ?? null;
          discount = value;
          if (promo.freeShipping) shipping = 0;
          break;
        }
      }

      const ageDays = daysBetween(createdAt, NOW);
      const status = statusFor(ageDays);
      const payments =
        channel === SalesChannel.COUNTER ? PAYMENTS_COUNTER
          : channel === SalesChannel.SOCIAL ? PAYMENTS_SOCIAL
            : PAYMENTS_ONLINE;

      const returnsStock = status === OrderStatus.CANCELLED || status === OrderStatus.REFUNDED;

      orders.push({
        id: `ord_${String(sequence).padStart(6, '0')}`,
        number: `AU-${sequence}`,
        status,
        channel,
        customer: makeCustomer(),
        subtotal,
        discount,
        shipping,
        total: subtotal - discount + shipping,
        cost,
        promotionId,
        couponCode,
        paymentMethod: pick(payments),
        notes: rand() < 0.08 ? pick(NOTES) : null,
        createdAt,
        lines,
        // PENDING no descuenta: el pago no está aprobado y la mercancía sigue
        // en el estante. Es la misma regla que aplica el resto de la API.
        movesStock: status !== OrderStatus.PENDING,
        returnsStock,
        returnAt: returnsStock
          ? new Date(Math.min(NOW.getTime(), createdAt.getTime() + (status === OrderStatus.CANCELLED ? 1 : 6) * DAY_MS))
          : null,
      });

      sequence += 1;
    }
  }

  return orders;
}

// ---------------------------------------------------------------------------
// Libro mayor de inventario
// ---------------------------------------------------------------------------

interface LedgerEvent {
  readonly type: MovementType;
  /** Firmada: positiva entra, negativa sale. Nunca cero. */
  quantity: number;
  readonly at: Date;
  readonly orderId: string | null;
  readonly unitCost: number | null;
  readonly reason: string | null;
  stockAfter: number;
}

/** Recalcula `stockAfter` de punta a punta. Es la única fuente del stock. */
function recomputeStockAfter(events: LedgerEvent[]): number {
  let stock = 0;
  for (const ev of events) {
    stock += ev.quantity;
    ev.stockAfter = stock;
  }
  return stock;
}

/**
 * Deja el stock final exactamente en `target` sin romper el historial.
 *
 * Si sobra mercancía se recorta la ÚLTIMA compra posible, no la primera: solo
 * se puede recortar lo que no hizo falta después, y eso se mide con el mínimo
 * de existencias desde esa compra hasta hoy. Si aun recortando todas las
 * compras sobra algo, queda un conteo físico (ADJUSTMENT) como red de
 * seguridad, que es exactamente lo que haría la dueña ante un descuadre.
 */
function reconcileToTarget(events: LedgerEvent[], target: number, lastMoment: Date): void {
  let final = recomputeStockAfter(events);

  if (final < target) {
    const previous = events[events.length - 1];
    const at = previous
      ? new Date(Math.min(lastMoment.getTime(), previous.at.getTime() + 3 * 3600_000))
      : lastMoment;
    events.push({
      type: MovementType.PURCHASE,
      quantity: target - final,
      at,
      orderId: null,
      unitCost: null,
      reason: 'Reposición de proveedor',
      stockAfter: 0,
    });
    recomputeStockAfter(events);
    return;
  }

  let excess = final - target;
  while (excess > 0) {
    // Mínimo de existencias desde cada posición hasta el final: es cuánto se
    // puede quitar de una compra sin dejar el historial en negativo.
    const suffixMin: number[] = new Array<number>(events.length).fill(0);
    let running = Number.POSITIVE_INFINITY;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      running = Math.min(running, (events[i] as LedgerEvent).stockAfter);
      suffixMin[i] = running;
    }

    let trimmed = 0;
    for (let i = events.length - 1; i >= 0 && excess > 0; i -= 1) {
      const ev = events[i] as LedgerEvent;
      if (ev.type !== MovementType.PURCHASE) continue;
      const room = Math.min(ev.quantity - 1, suffixMin[i] as number, excess);
      if (room <= 0) continue;
      ev.quantity -= room;
      excess -= room;
      trimmed += room;
      break;
    }

    if (trimmed === 0) break;
    final = recomputeStockAfter(events);
    excess = final - target;
  }

  if (excess > 0) {
    events.push({
      type: MovementType.ADJUSTMENT,
      quantity: -excess,
      at: lastMoment,
      orderId: null,
      unitCost: null,
      reason: 'Conteo físico de fin de mes',
      stockAfter: 0,
    });
    recomputeStockAfter(events);
  }
}

/**
 * Construye el libro mayor de un producto a partir de la historia de ventas.
 *
 * Va hacia adelante: carga inicial, y cada vez que una venta no cabe en el
 * estante se mete la compra al proveedor justo antes. Así las compras caen
 * donde tienen sentido y el stock nunca queda negativo, que es lo que
 * garantiza que el historial del panel se pueda leer de arriba abajo.
 */
function buildLedger(product: SeedProduct, demand: readonly LedgerEvent[]): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  let stock = 0;

  events.push({
    type: MovementType.INITIAL,
    quantity: product.lot,
    at: new Date(FIRST_DAY.getFullYear(), FIRST_DAY.getMonth(), FIRST_DAY.getDate(), 7, 30, 0),
    orderId: null,
    unitCost: product.cost,
    reason: 'Carga inicial del catálogo',
    stockAfter: 0,
  });
  stock = product.lot;

  for (const ev of demand) {
    if (stock + ev.quantity < 0) {
      const missing = -(stock + ev.quantity);
      const lots = Math.max(1, Math.ceil(missing / product.lot));
      const quantity = lots * product.lot;
      const previous = events[events.length - 1] as LedgerEvent;
      // La compra entra entre el movimiento anterior y la venta que la
      // provocó, para que la lista siga siendo cronológica sin reordenar.
      const at = new Date(
        Math.max(previous.at.getTime() + 60_000, ev.at.getTime() - randInt(4, 30) * 3600_000),
      );
      events.push({
        type: MovementType.PURCHASE,
        quantity,
        at: at > ev.at ? new Date(ev.at.getTime() - 60_000) : at,
        orderId: null,
        unitCost: Math.round((product.cost * randFloat(0.96, 1.05)) / 100) * 100,
        reason: `Pedido a proveedor #${randInt(4000, 9999)}`,
        stockAfter: 0,
      });
      stock += quantity;
    }
    events.push({ ...ev });
    stock += ev.quantity;
  }

  const lastMoment = new Date(Math.min(NOW.getTime(), TODAY.getTime() + 20 * 3600_000));
  reconcileToTarget(events, product.targetStock, lastMoment);
  return events;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

const CHUNK = 1000;

/**
 * Json anulable. Hay que decir `DbNull` explícitamente: `undefined` no borra
 * la columna, la deja como estaba, y un producto que perdió sus tonos seguiría
 * mostrándolos después de resembrar.
 */
const jsonOrNull = <T>(value: readonly T[] | null): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  value && value.length > 0 ? (value as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

/** `createMany` por lotes: 4.000 filas de a una serían 4.000 idas al servidor. */
async function insertChunks<T>(rows: readonly T[], write: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK) as T[]);
  }
}

async function seedCatalog(): Promise<void> {
  for (let i = 0; i < CATS.length; i += 1) {
    const [id, name, description] = CATS[i] as CategoryRow;
    const data = {
      slug: slugify(name),
      name,
      description,
      image: `/images/categories/${id}.jpg`,
      order: i + 1,
      active: true,
    };
    await prisma.category.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  for (let i = 0; i < BRAND_NAMES.length; i += 1) {
    const name = BRAND_NAMES[i] as string;
    const id = slugify(name);
    const data = { slug: id, name, featured: true, order: i + 1, active: true };
    await prisma.brand.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  for (const p of PRODUCTS) {
    const data = {
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      categoryId: p.categoryId,
      brandId: p.brandSlug,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      cost: p.cost,
      taxRate: 0.19,
      // El stock arranca en cero siempre: lo pone el libro mayor, movimiento a
      // movimiento. Escribirlo a mano aquí es lo que descuadra la tabla de
      // inventario contra su historial.
      stock: 0,
      reserved: 0,
      minStock: p.minStock,
      active: true,
      featured: p.featured,
      tags: [...p.tags],
      content: p.content,
      description: p.description,
      usage: p.usage,
      images: [...p.images],
      shades: jsonOrNull(p.shades),
      sizes: jsonOrNull(p.sizes),
      rating: p.rating,
      reviewCount: p.reviewCount,
    };
    await prisma.product.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }

  // Referencias que ya no están en el catálogo: se van, o el panel seguiría
  // listando productos que la tienda dejó de vender hace dos versiones.
  await prisma.product.deleteMany({ where: { id: { notIn: PRODUCTS.map((p) => p.id) } } });
  await prisma.category.deleteMany({ where: { id: { notIn: CATS.map((c) => c[0]) } } });
  await prisma.brand.deleteMany({ where: { id: { notIn: BRAND_NAMES.map((b) => slugify(b)) } } });
}

async function seedUsers(): Promise<void> {
  const adminHash = await hashPassword(env.adminPassword);
  await prisma.user.upsert({
    where: { email: env.adminEmail },
    // Si el usuario ya existe NO se le toca la contraseña: quien lleve meses
    // entrando al panel no puede quedarse afuera por volver a sembrar.
    update: { name: 'Catalina Restrepo', role: UserRole.ADMIN, active: true },
    create: {
      email: env.adminEmail,
      name: 'Catalina Restrepo',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      active: true,
      lastLoginAt: addDays(NOW, -1),
    },
  });

  const staffHash = await hashPassword('aurelle-staff');
  await prisma.user.upsert({
    where: { email: 'staff@example.com' },
    update: { name: 'Mariana Ospina', role: UserRole.STAFF, active: true },
    create: {
      email: 'staff@example.com',
      name: 'Mariana Ospina',
      passwordHash: staffHash,
      role: UserRole.STAFF,
      active: true,
      lastLoginAt: addDays(NOW, -3),
    },
  });
}

async function seedSettings(): Promise<void> {
  for (const setting of SETTING_DEFAULTS) {
    const data = {
      value: setting.value as Prisma.InputJsonValue,
      label: setting.label,
      group: setting.group,
    };
    await prisma.setting.upsert({ where: { key: setting.key }, create: { key: setting.key, ...data }, update: data });
  }
  await prisma.setting.deleteMany({ where: { key: { notIn: SETTING_DEFAULTS.map((s) => s.key) } } });
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\nSembrando Aurelle · semilla ${env.seedRandom} · ${env.seedMonths} meses de historia`);
  console.log(`Rango: ${fmtDate(FIRST_DAY)} → ${fmtDate(TODAY)} (${TOTAL_DAYS + 1} días)\n`);

  // Borrado en orden de dependencias: los movimientos apuntan a pedidos y
  // productos, las líneas a pedidos, los pedidos a promociones. Al revés,
  // Postgres rechaza el DELETE por llave foránea.
  await prisma.inventoryMovement.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.promotion.deleteMany({});

  await seedCatalog();
  await seedUsers();
  await seedSettings();

  await prisma.promotion.createMany({ data: PROMOTIONS.map((p) => p.data) });

  const orders = generateOrders();

  // --- Pedidos -------------------------------------------------------------
  const orderRows: Prisma.OrderCreateManyInput[] = orders.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    channel: o.channel,
    customerName: o.customer.name,
    customerEmail: o.customer.email,
    customerPhone: o.customer.phone,
    customerCity: o.customer.city,
    subtotal: o.subtotal,
    discount: o.discount,
    shipping: o.shipping,
    total: o.total,
    cost: o.cost,
    promotionId: o.promotionId,
    couponCode: o.couponCode,
    paymentMethod: o.paymentMethod,
    notes: o.notes,
    createdAt: o.createdAt,
    updatedAt: o.createdAt,
  }));
  await insertChunks(orderRows, (chunk) => prisma.order.createMany({ data: chunk }));

  const itemRows: Prisma.OrderItemCreateManyInput[] = orders.flatMap((o) =>
    o.lines.map((l) => ({
      orderId: o.id,
      productId: l.product.id,
      // Congelado: si mañana sube el precio o cambia el nombre, este pedido
      // tiene que seguir diciendo lo que la clienta compró y pagó.
      sku: l.product.sku,
      name: l.product.name,
      variant: l.variant,
      unitPrice: l.product.price,
      unitCost: l.product.cost,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
    })),
  );
  await insertChunks(itemRows, (chunk) => prisma.orderItem.createMany({ data: chunk }));

  // --- Inventario ----------------------------------------------------------
  const demandByProduct = new Map<string, LedgerEvent[]>();
  for (const p of PRODUCTS) demandByProduct.set(p.id, []);

  for (const o of orders) {
    if (!o.movesStock) continue;
    for (const l of o.lines) {
      const list = demandByProduct.get(l.product.id);
      if (!list) continue;
      list.push({
        type: MovementType.SALE,
        quantity: -l.quantity,
        at: o.createdAt,
        orderId: o.id,
        unitCost: null,
        reason: null,
        stockAfter: 0,
      });
      if (o.returnsStock && o.returnAt) {
        list.push({
          type: MovementType.RETURN,
          quantity: l.quantity,
          at: o.returnAt,
          orderId: o.id,
          unitCost: null,
          reason: o.status === OrderStatus.CANCELLED ? 'Pedido anulado' : 'Devolución del cliente',
          stockAfter: 0,
        });
      }
    }
  }

  for (const list of demandByProduct.values()) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  const movementRows: Prisma.InventoryMovementCreateManyInput[] = [];
  const finalStock = new Map<string, number>();

  for (const p of PRODUCTS) {
    const ledger = buildLedger(p, demandByProduct.get(p.id) ?? []);

    // La carga inicial sí pasa por el servicio de inventario: son 16 filas, el
    // costo es despreciable y deja el stock del producto y su movimiento
    // escritos por el mismo camino que usa el panel. Las otras ~4.000 van por
    // `createMany` porque el servicio hace tres consultas por fila.
    const initial = ledger[0] as LedgerEvent;
    await prisma.$transaction((tx) =>
      incrementStock(tx, {
        productId: p.id,
        quantity: initial.quantity,
        type: MovementType.INITIAL,
        unitCost: initial.unitCost,
        reason: initial.reason,
        createdAt: initial.at,
      }),
    );

    for (let i = 1; i < ledger.length; i += 1) {
      const ev = ledger[i] as LedgerEvent;
      movementRows.push({
        productId: p.id,
        type: ev.type,
        quantity: ev.quantity,
        stockAfter: ev.stockAfter,
        unitCost: ev.unitCost,
        reason: ev.reason,
        orderId: ev.orderId,
        createdAt: ev.at,
      });
    }

    finalStock.set(p.id, (ledger[ledger.length - 1] as LedgerEvent).stockAfter);
  }

  await insertChunks(movementRows, (chunk) => prisma.inventoryMovement.createMany({ data: chunk }));

  // El stock del producto es el `stockAfter` del último movimiento, no un
  // número aparte: así la tabla de inventario y su historial dicen lo mismo.
  // `reserved` son las unidades comprometidas que TODAVÍA están en el estante:
  // los PENDING, que aún no descontaron stock. Contar aquí los ya pagados
  // restaría dos veces la misma unidad y la tienda dejaría de vender lo que sí
  // tiene.
  const reservedByProduct = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== OrderStatus.PENDING) continue;
    for (const l of o.lines) {
      reservedByProduct.set(l.product.id, (reservedByProduct.get(l.product.id) ?? 0) + l.quantity);
    }
  }

  await prisma.$transaction(
    PRODUCTS.map((p) => {
      const stock = finalStock.get(p.id) ?? 0;
      return prisma.product.update({
        where: { id: p.id },
        // Nunca más de lo que hay: reservar unidades inexistentes dejaría el
        // vendible en negativo y la tienda rechazaría pedidos que sí se pueden.
        data: { stock, reserved: Math.min(reservedByProduct.get(p.id) ?? 0, stock) },
      });
    }),
  );

  // --- Uso de las promociones ---------------------------------------------
  const usage = new Map<string, number>();
  for (const o of orders) {
    if (!o.promotionId) continue;
    usage.set(o.promotionId, (usage.get(o.promotionId) ?? 0) + 1);
  }
  await prisma.$transaction(
    [...usage.entries()].map(([id, count]) =>
      prisma.promotion.update({ where: { id }, data: { usageCount: count } }),
    ),
  );

  await report(orders);
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

const SOLD: readonly OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

async function report(orders: readonly SeedOrder[]): Promise<void> {
  const [categories, brands, products, orderCount, itemCount, movementCount, promotions, users, settings] =
    await Promise.all([
      prisma.category.count(),
      prisma.brand.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.orderItem.count(),
      prisma.inventoryMovement.count(),
      prisma.promotion.count(),
      prisma.user.count(),
      prisma.setting.count(),
    ]);

  const sold = orders.filter((o) => SOLD.includes(o.status));
  const revenue = sold.reduce((s, o) => s + o.total, 0);
  const margin = sold.reduce((s, o) => s + o.total - o.shipping - o.cost, 0);
  const units = sold.reduce((s, o) => s + o.lines.reduce((u, l) => u + l.quantity, 0), 0);
  const discounts = sold.reduce((s, o) => s + o.discount, 0);

  const byStatus = new Map<OrderStatus, number>();
  for (const o of orders) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);

  const byChannel = new Map<SalesChannel, number>();
  for (const o of orders) byChannel.set(o.channel, (byChannel.get(o.channel) ?? 0) + 1);

  const stock = await prisma.product.findMany({
    select: { id: true, sku: true, name: true, stock: true, minStock: true },
    orderBy: { id: 'asc' },
  });
  const alerts = stock.filter((p) => p.stock <= p.minStock);

  const first = orders[0];
  const last = orders[orders.length - 1];

  console.log('-'.repeat(68));
  console.log('Siembra terminada');
  console.log('-'.repeat(68));
  console.log(`  Categorías        ${categories}`);
  console.log(`  Marcas            ${brands}`);
  console.log(`  Productos         ${products}`);
  console.log(`  Promociones       ${promotions}`);
  console.log(`  Usuarios          ${users}`);
  console.log(`  Ajustes           ${settings}`);
  console.log(`  Pedidos           ${orderCount}  (${itemCount} líneas)`);
  console.log(`  Movimientos       ${movementCount}`);
  console.log('');
  console.log(`  Ingreso sembrado  ${money(revenue)}  (${sold.length} pedidos cobrados)`);
  console.log(`  Margen            ${money(margin)}`);
  console.log(`  Descuentos        ${money(discounts)}`);
  console.log(`  Unidades vendidas ${units}`);
  console.log('');
  console.log(
    `  Estados           ${[...byStatus.entries()].map(([s, n]) => `${s} ${n}`).join(' · ')}`,
  );
  console.log(
    `  Canales           ${[...byChannel.entries()].map(([c, n]) => `${c} ${n}`).join(' · ')}`,
  );
  console.log('');
  console.log(
    `  Rango de fechas   ${first ? fmtDate(first.createdAt) : '-'} → ${last ? fmtDate(last.createdAt) : '-'}`,
  );
  console.log(
    `  Alertas de stock  ${alerts.map((p) => `${p.sku} ${p.stock}/${p.minStock}`).join(' · ') || 'ninguna'}`,
  );
  console.log('-'.repeat(68));
  console.log(`  Panel: ${env.adminEmail} / ${env.adminPassword}`);
  console.log('-'.repeat(68) + '\n');
}

main()
  .catch((error: unknown) => {
    console.error('\nLa siembra falló:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
