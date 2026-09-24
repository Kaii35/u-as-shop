import type { Address, Brand, Category, Order, Product, ProductTag, Review, Shade, SizeOption } from '../types';

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const slugify = (s: string) =>
  normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Imágenes de campaña. Las actuales son placeholders SVG generados en la paleta
 * de la marca (/public/images/editorial). Reemplázalas por tus fotos reales.
 */
export const media: Record<'heroMain' | 'heroDetail' | 'editMain' | 'editDetail' | 'login' | 'register', string | undefined> = {
  heroMain: '/images/editorial/hero-main.svg',
  heroDetail: '/images/editorial/hero-detail.svg',
  editMain: '/images/editorial/edit-main.svg',
  editDetail: '/images/editorial/edit-detail.svg',
  login: '/images/editorial/auth-login.svg',
  register: '/images/editorial/auth-register.svg',
};

const CATS: Array<[string, string, string, string, string]> = [
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

export const categories: Category[] = CATS.map(([id, name, description]) => ({
  id, name, description, slug: slugify(name),
  image: `/images/categories/${id}.svg`,
}));

export const brands: Brand[] = ['Velours Pro', 'Nácar Lab', 'Atelier Nº9', 'Lumière Gel', 'Solenne', 'Kirei', 'Maré Cosmetics', 'Oriel Lash']
  .map((name) => ({ name, slug: slugify(name) }));

const sh = (list: Array<[string, string]>): Shade[] => list.map(([name, hex]) => ({ name, hex }));
const SEMI = sh([['Rosé Silk', '#D9A5AE'], ['Nude Veil', '#E3C1B3'], ['Milk Bath', '#F1E6DF'], ['Cherry Lacquer', '#9E1F36'], ['Bordeaux', '#5E2433'], ['Mocha', '#7A5347'], ['Noir', '#242124']]);
const RUBBER = sh([['Cover Pink', '#EBC3C6'], ['Clear', '#F4F1EE'], ['Milky White', '#F5EFE8'], ['Peach', '#EDBBA6']]);
const POLY = sh([['Nude Rose', '#E3B7B0'], ['Soft Beige', '#E6CDB5'], ['Clear', '#F2EFEC'], ['Cover Mauve', '#C99AA3']]);
const SKIN = sh([['N10 Porcelana', '#F1D6C6'], ['N20 Marfil', '#E6C3A8'], ['N30 Miel', '#CFA07C'], ['N40 Canela', '#A87555'], ['N50 Cacao', '#7A4E36']]);
const CHROME = sh([['Silver', '#C9CBD0'], ['Rosé Gold', '#D4A08E'], ['Aurora', '#C7B8E0']]);

type Row = [string, string, string, string, number, number, number, number, number, ProductTag[], string, Shade[]?, SizeOption[]?];
const ROWS: Row[] = [
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

export const products: Product[] = ROWS.map(([id, name, brand, categoryId, price, old, rating, reviewCount, stock, tags, content, shades, sizes]) => {
  const copy = CATS.find((c) => c[0] === categoryId)!;
  return {
    id, name, brand, categoryId, price, rating, reviewCount, stock, tags, content, shades, sizes,
    oldPrice: old || undefined,
    slug: slugify(name),
    ref: brand.replace(/[^A-Z]/g, '').slice(0, 2) + '-' + (1000 + parseInt(id.slice(1), 10) * 37),
    images: [`/images/products/${id}-a.svg`, `/images/products/${id}-b.svg`],
    description: copy[3],
    usage: copy[4],
  };
});

export const getProduct = (id: string) => products.find((p) => p.id === id);
export const getProductBySlug = (slug?: string) => products.find((p) => p.slug === slug);
export const getCategory = (id: string) => categories.find((c) => c.id === id);
export const getCategoryBySlug = (slug: string) => categories.find((c) => c.slug === slug);
export const getBrandBySlug = (slug: string) => brands.find((b) => b.slug === slug);
export const searchText = (p: Product) => normalize(`${p.name} ${p.brand} ${getCategory(p.categoryId)?.name ?? ''}`);

export const reviews: Review[] = [
  { author: 'Laura M.', role: 'Nail artist · Medellín', rating: 5, date: 'Hace 2 semanas', title: 'Pigmentación increíble', body: 'Cubre en dos capas finas y nivela solo. Mis clientas lo llevan tres semanas sin levantamientos.' },
  { author: 'Daniela R.', role: 'Manicurista · Bogotá', rating: 5, date: 'Hace 1 mes', title: 'Ya es parte de mi estación', body: 'Cura rápido en lámpara LED y el color es idéntico a la muestra. El envío llegó en dos días.' },
  { author: 'Camila T.', role: 'Clienta verificada · Cali', rating: 4, date: 'Hace 1 mes', title: 'Muy buen acabado', body: 'Me encanta el tono. Le pondría cinco estrellas si trajera un pincel un poco más delgado.' },
];

export const ratingDistribution: Array<[number, number]> = [[5, 78], [4, 15], [3, 5], [2, 1], [1, 1]];

export const orders: Order[] = [
  { number: 'AU-10482', date: '12 sep 2026', productIds: ['p1', 'p11', 'p6'], total: 187600, status: 'En camino',
    tracking: [{ label: 'Pedido confirmado', date: '12 sep · 10:24', done: true }, { label: 'Preparando tu pedido', date: '12 sep · 15:02', done: true }, { label: 'En camino · Servientrega 70423118', date: '13 sep · 08:40', done: true }, { label: 'Entregado', date: 'Estimado 16 sep', done: false }] },
  { number: 'AU-10311', date: '28 ago 2026', productIds: ['p3', 'p5'], total: 278700, status: 'Entregado',
    tracking: [{ label: 'Pedido confirmado', date: '28 ago', done: true }, { label: 'Preparando tu pedido', date: '28 ago', done: true }, { label: 'En camino', date: '29 ago', done: true }, { label: 'Entregado', date: '31 ago', done: true }] },
  { number: 'AU-10107', date: '02 ago 2026', productIds: ['p8', 'p13', 'p9', 'p16'], total: 152600, status: 'Entregado',
    tracking: [{ label: 'Pedido confirmado', date: '02 ago', done: true }, { label: 'Preparando tu pedido', date: '02 ago', done: true }, { label: 'En camino', date: '03 ago', done: true }, { label: 'Entregado', date: '05 ago', done: true }] },
];

export const addresses: Address[] = [
  { label: 'Estudio', line1: 'Carrera 43A # 7-50, local 204', line2: 'El Poblado · Medellín, Antioquia', primary: true },
  { label: 'Casa', line1: 'Calle 10 Sur # 32-15, apto 1102', line2: 'Envigado, Antioquia' },
];

export const departments = ['Antioquia', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Cundinamarca', 'Huila', 'Meta', 'Nariño', 'Norte de Santander', 'Quindío', 'Risaralda', 'Santander', 'Tolima', 'Valle del Cauca'];
export const banks = ['Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA Colombia', 'Banco de Occidente', 'Banco Popular', 'Scotiabank Colpatria', 'Banco Caja Social'];
export const trendingSearches = ['Rubber base', 'Polygel', 'Foils', 'Lash lift', 'Lámpara LED'];
