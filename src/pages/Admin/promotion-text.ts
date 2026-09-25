import {
  type PromotionScope,
  type PromotionState,
  type PromotionType,
} from '../../lib/admin-types';
import { formatDate, money, type Tone } from '../../components/admin/Primitives';

/**
 * Cómo se dice una promoción en español de tienda.
 *
 * Vive aparte porque los mismos textos hacen falta en la fila del listado y en
 * la vista previa del formulario, y si cada sitio los arma por su cuenta la
 * dueña acaba leyendo dos descripciones distintas de la misma campaña.
 *
 * Aquí no aparece ni `scope` ni `PERCENTAGE`: eso es vocabulario de la base de
 * datos, no de quien administra la tienda.
 */

export const SCOPE_LABEL: Record<PromotionScope, string> = {
  ALL: 'Toda la tienda',
  CATEGORY: 'Solo unas categorías',
  BRAND: 'Solo unas marcas',
  PRODUCT: 'Solo unos productos',
};

/** El sustantivo suelto, para frases como «3 categorías». */
export const SCOPE_NOUN: Record<PromotionScope, { one: string; many: string }> = {
  ALL: { one: 'toda la tienda', many: 'toda la tienda' },
  CATEGORY: { one: 'categoría', many: 'categorías' },
  BRAND: { one: 'marca', many: 'marcas' },
  PRODUCT: { one: 'producto', many: 'productos' },
};

export const TYPE_HINT: Record<PromotionType, string> = {
  PERCENTAGE: 'Le baja un porcentaje al precio.',
  FIXED_AMOUNT: 'Le quita una cantidad fija de pesos al carrito.',
  FREE_SHIPPING: 'No baja el precio: regala el envío.',
};

/** El color del estado. Vencida sí es roja: es la que hay que mirar. */
export const STATE_TONE: Record<PromotionState, Tone> = {
  active: 'ok',
  scheduled: 'info',
  expired: 'danger',
  inactive: 'neutral',
  exhausted: 'warn',
};

/** El descuento a secas: «20 %», «$15.000», «Envío gratis». */
export function discountText(type: PromotionType, value: number): string {
  if (type === 'FREE_SHIPPING') return 'Envío gratis';
  if (type === 'PERCENTAGE') return `${value.toLocaleString('es-CO')} %`;
  return money(value);
}

/**
 * Sobre qué se aplica, con los nombres reales cuando se conocen.
 *
 * Cuando no se tienen (productos, que no se cargan enteros en el listado) se
 * cuenta: «3 productos» dice más que tres identificadores ilegibles.
 */
export function targetsText(
  scope: PromotionScope,
  targetIds: readonly string[],
  names: Readonly<Record<string, string>>,
): string {
  if (scope === 'ALL') return 'toda la tienda';

  const known = targetIds.map((id) => names[id]).filter((n): n is string => !!n);
  const noun = SCOPE_NOUN[scope];

  if (known.length === 0) {
    return `${targetIds.length} ${targetIds.length === 1 ? noun.one : noun.many}`;
  }
  if (known.length <= 2) return known.join(' y ');
  return `${known.slice(0, 2).join(', ')} y ${known.length - 2} más`;
}

/** «20 % en Esmaltes semipermanentes», «Envío gratis desde $150.000». */
export function ruleSummary(
  promotion: {
    type: PromotionType;
    value: number;
    scope: PromotionScope;
    targetIds: readonly string[];
    minPurchase: number;
  },
  names: Readonly<Record<string, string>> = {},
): string {
  const where = targetsText(promotion.scope, promotion.targetIds, names);

  if (promotion.type === 'FREE_SHIPPING') {
    if (promotion.minPurchase > 0) return `Envío gratis desde ${money(promotion.minPurchase)}`;
    return promotion.scope === 'ALL' ? 'Envío gratis' : `Envío gratis en ${where}`;
  }

  const base = `${discountText(promotion.type, promotion.value)} en ${where}`;
  return promotion.minPurchase > 0 ? `${base}, desde ${money(promotion.minPurchase)}` : base;
}

/** La vigencia en una línea. Sin fecha de fin se dice, no se deja en blanco. */
export function validityText(startsAt: string, endsAt: string | null): string {
  const from = formatDate(startsAt);
  return endsAt ? `${from} — ${formatDate(endsAt)}` : `Desde ${from}, sin fecha de fin`;
}

/** Fecha larga para la portada: «hasta el 1 de octubre». */
export const longDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });

// ---------------------------------------------------------------------------
// Fechas en los campos del formulario
// ---------------------------------------------------------------------------

/**
 * ISO en UTC → valor de `datetime-local`, que es hora local sin zona.
 *
 * La conversión va a mano y no con `toISOString().slice()` porque ese atajo
 * pinta la hora UTC en un campo que el navegador lee como local: en Colombia
 * la campaña saldría cinco horas corrida.
 */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Valor de `datetime-local` → ISO en UTC, que es como viaja el contrato. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
