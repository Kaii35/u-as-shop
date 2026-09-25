import { PromotionScope, PromotionType } from '@prisma/client';

/**
 * Motor de promociones: decide si una regla aplica y cuánto descuenta.
 *
 * Vive fuera de las rutas y sin Fastify ni Prisma adentro porque lo consultan
 * tres sitios distintos —la vista previa del panel, el pop-up de la portada y
 * la venta de mostrador— y si cada uno calculara por su cuenta acabaríamos
 * dándole dos descuentos distintos al mismo carrito. Al ser funciones puras
 * también se pueden probar sin levantar base ni servidor.
 */

export type PromotionState = 'active' | 'scheduled' | 'expired' | 'inactive' | 'exhausted';

/**
 * Lo que el motor necesita de una promoción.
 *
 * Es una forma estructural y no el modelo de Prisma para poder evaluar una
 * regla que todavía no está guardada: es exactamente lo que hace
 * `POST /api/admin/promotions/preview`, que corre mientras la dueña escribe.
 */
export interface PromotionRule {
  readonly type: PromotionType;
  readonly scope: PromotionScope;
  readonly targetIds: readonly string[];
  readonly value: number;
  readonly maxDiscount: number | null;
  readonly minPurchase: number;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly active: boolean;
  readonly usageLimit: number | null;
  readonly usageCount: number;
}

/** Una línea del carrito, con lo justo para saber si cae dentro del alcance. */
export interface CartLine {
  readonly productId: string;
  readonly categoryId: string;
  readonly brandId: string;
  readonly price: number;
  readonly quantity: number;
}

export interface Cart {
  readonly subtotal: number;
  readonly items: readonly CartLine[];
}

export interface DiscountResult {
  readonly discount: number;
  readonly freeShipping: boolean;
  readonly applies: boolean;
  /** Por qué NO aplicó. Null cuando sí aplica: no hay nada que explicar. */
  readonly reason: string | null;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/**
 * Pesos con punto de miles y sin decimales.
 *
 * A mano y no con `Intl` porque estos textos los lee la dueña en el panel y
 * tienen que salir iguales en su navegador, en el servidor y en una prueba,
 * sin depender de la configuración regional de quien ejecute el proceso.
 */
const money = (pesos: number): string =>
  `$${Math.round(pesos)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

/** Fecha corta. En UTC, que es como viajan todas las fechas del contrato. */
const shortDate = (d: Date): string =>
  `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;

const SCOPE_REASON: Readonly<Record<PromotionScope, string>> = {
  [PromotionScope.ALL]: 'El carrito no tiene productos sobre los que descontar.',
  [PromotionScope.CATEGORY]:
    'Ningún producto del carrito pertenece a las categorías de la promoción.',
  [PromotionScope.BRAND]: 'Ningún producto del carrito es de las marcas de la promoción.',
  [PromotionScope.PRODUCT]: 'El carrito no incluye ninguno de los productos de la promoción.',
};

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

/**
 * En qué situación está la promoción respecto de la hora que se le pase.
 *
 * El orden de las comprobaciones es el orden en que la dueña tendría que
 * arreglarlas: apagarla a mano manda sobre todo lo demás, y una promoción
 * vencida ya no interesa saber si además se agotó.
 */
export function promotionState(p: PromotionRule, now: Date = new Date()): PromotionState {
  if (!p.active) return 'inactive';
  if (p.endsAt !== null && now.getTime() > p.endsAt.getTime()) return 'expired';
  if (p.usageLimit !== null && p.usageCount >= p.usageLimit) return 'exhausted';
  if (now.getTime() < p.startsAt.getTime()) return 'scheduled';
  return 'active';
}

/** Si la promoción puede descontar ahora mismo. */
export const isLive = (p: PromotionRule, now: Date = new Date()): boolean =>
  promotionState(p, now) === 'active';

function stateReason(state: PromotionState, p: PromotionRule): string {
  switch (state) {
    case 'inactive':
      return 'La promoción está desactivada.';
    case 'scheduled':
      return `La promoción todavía no empieza: arranca el ${shortDate(p.startsAt)}.`;
    case 'expired':
      return `La promoción venció el ${p.endsAt ? shortDate(p.endsAt) : 'día de su fecha de fin'}.`;
    case 'exhausted':
      return `La promoción llegó a su límite de ${p.usageLimit ?? 0} usos.`;
    case 'active':
      return '';
  }
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

const inScope = (p: PromotionRule, line: CartLine): boolean => {
  switch (p.scope) {
    case PromotionScope.ALL:
      return true;
    case PromotionScope.CATEGORY:
      return p.targetIds.includes(line.categoryId);
    case PromotionScope.BRAND:
      return p.targetIds.includes(line.brandId);
    case PromotionScope.PRODUCT:
      return p.targetIds.includes(line.productId);
  }
};

/**
 * La parte del carrito sobre la que la promoción tiene derecho a descontar.
 *
 * Esto es lo que impide que un 20 % de una categoría termine descontando
 * sobre el carrito entero: la base son las líneas que caen dentro del
 * `scope`, no el subtotal. Con `scope = ALL` sí es el subtotal, porque ahí el
 * subtotal es la única cifra que el que llama garantiza (la vista previa
 * puede mandar un carrito sin desglose).
 */
function scopeBase(p: PromotionRule, cart: Cart, subtotal: number): number {
  if (p.scope === PromotionScope.ALL) return subtotal;

  const sum = cart.items
    .filter((line) => inScope(p, line))
    .reduce((acc, line) => acc + Math.max(0, line.price) * Math.max(0, line.quantity), 0);

  // Nunca por encima del subtotal declarado: si el desglose y el total no
  // cuadran, el error no puede salir en forma de descuento de más.
  return Math.min(Math.trunc(sum), subtotal);
}

const rejected = (reason: string): DiscountResult => ({
  discount: 0,
  freeShipping: false,
  applies: false,
  reason,
});

/**
 * Cuánto descuenta esta promoción sobre este carrito.
 *
 * Devuelve siempre los cuatro campos del contrato; cuando no aplica, `reason`
 * lo explica en español porque ese texto se le muestra tal cual a la dueña en
 * la vista previa, que es el momento en que todavía puede corregir la regla.
 */
export function computeDiscount(
  promotion: PromotionRule,
  cart: Cart,
  now: Date = new Date(),
): DiscountResult {
  const state = promotionState(promotion, now);
  if (state !== 'active') return rejected(stateReason(state, promotion));

  const subtotal = Math.trunc(cart.subtotal);
  if (subtotal <= 0) return rejected('El carrito está vacío.');

  // El mínimo se mide contra el carrito completo, no contra la parte en
  // alcance: "compra mínima" es lo que la clienta gasta, no lo que la
  // promoción alcanza a tocar.
  if (subtotal < promotion.minPurchase) {
    return rejected(
      `El carrito suma ${money(subtotal)} y la promoción pide una compra mínima de ${money(
        promotion.minPurchase,
      )}.`,
    );
  }

  const base = scopeBase(promotion, cart, subtotal);
  if (base <= 0) return rejected(SCOPE_REASON[promotion.scope]);

  // El envío gratis no descuenta mercancía, así que ni mira `value`.
  if (promotion.type === PromotionType.FREE_SHIPPING) {
    return { discount: 0, freeShipping: true, applies: true, reason: null };
  }

  if (promotion.type === PromotionType.PERCENTAGE && (promotion.value < 1 || promotion.value > 100)) {
    return rejected('El porcentaje de descuento tiene que estar entre 1 y 100.');
  }
  if (promotion.type === PromotionType.FIXED_AMOUNT && promotion.value < 1) {
    return rejected('El monto del descuento tiene que ser de al menos $1.');
  }

  // Hacia abajo: el descuento nunca redondea a favor de regalar un peso de
  // más, y el total le sigue quedando entero a la clienta.
  const raw =
    promotion.type === PromotionType.PERCENTAGE
      ? Math.floor((base * promotion.value) / 100)
      : promotion.value;

  let discount = Math.min(raw, base);
  if (promotion.maxDiscount !== null && promotion.maxDiscount > 0) {
    discount = Math.min(discount, promotion.maxDiscount);
  }

  if (discount <= 0) {
    return rejected('Con este carrito el descuento daría $0, así que no se aplica.');
  }

  return { discount, freeShipping: false, applies: true, reason: null };
}
