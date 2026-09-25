/**
 * Cliente de la pasarela de pagos.
 *
 * Traducción literal de la sección 9.1 de `docs/api.md`. Las tres rutas son
 * públicas y no llevan token: la clienta que paga no tiene sesión, y la
 * referencia —que es lo único que identifica el cobro— viaja en la URL.
 */
import { api } from './api';
import type { ShippingMethod } from '../types';

/** Los seis desenlaces que expone la API pública. */
export type PublicPaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'VOIDED'
  | 'ERROR'
  | 'EXPIRED';

/** Desenlaces que puede forzar el checkout simulado. */
export type MockOutcome = Extract<PublicPaymentStatus, 'APPROVED' | 'DECLINED' | 'PENDING'>;

/** Importes en pesos enteros, como en el resto de la tienda. */
export interface PaymentTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

export interface PaymentIntentItem {
  productId: string;
  quantity: number;
  /** Etiqueta de la variante elegida, p. ej. "Rosé Silk / 15 ml". */
  variant?: string;
}

export interface PaymentIntentCustomer {
  name: string;
  email: string;
  phone: string;
  legalIdType: string;
  legalId: string;
}

export interface PaymentIntentShipping {
  line1: string;
  city: string;
  region: string;
  country: 'CO';
}

export interface PaymentIntentRequest {
  items: PaymentIntentItem[];
  customer: PaymentIntentCustomer;
  shipping: PaymentIntentShipping;
  couponCode?: string;
  shippingMethod: ShippingMethod;
}

export interface PaymentIntentResponse {
  reference: string;
  orderNumber: string;
  checkoutUrl: string;
  provider: 'WOMPI' | 'MOCK';
  amountInCents: number;
  expiresAt: string;
  /** Los totales que recalculó el servidor. Mandan sobre los del navegador. */
  totals: PaymentTotals;
}

export interface PaymentStatusResponse {
  reference: string;
  status: PublicPaymentStatus;
  /** Texto para la clienta, ya redactado por el servidor. */
  message: string;
  orderNumber: string;
  orderStatus: string;
  amount: number;
  methodType?: string | null;
  expiresAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Abre el intento de cobro. Crea el pedido en PENDING y aparta las unidades,
 * así que no se llama "por si acaso": solo al confirmar.
 */
export const createPaymentIntent = (body: PaymentIntentRequest): Promise<PaymentIntentResponse> =>
  api.publicPost<PaymentIntentResponse>('/api/payments/intent', body);

/**
 * Estado del cobro.
 *
 * El `transactionId` es el `id` que Wompi añade a la URL de retorno. Pasarlo
 * hace que el servidor le pregunte a la pasarela antes de responder, que es la
 * red de seguridad para cuando el webhook se pierde.
 */
export function getPaymentStatus(
  reference: string,
  transactionId?: string | null,
  signal?: AbortSignal,
): Promise<PaymentStatusResponse> {
  const query = transactionId ? `?transactionId=${encodeURIComponent(transactionId)}` : '';
  return api.publicGet<PaymentStatusResponse>(
    `/api/payments/${encodeURIComponent(reference)}${query}`,
    signal,
  );
}

/**
 * Resuelve un cobro simulado. Solo existe con `PAYMENT_PROVIDER=mock`: con
 * Wompi activo el servidor ni siquiera registra la ruta.
 */
export async function resolveMockPayment(reference: string, outcome: MockOutcome): Promise<void> {
  await api.publicPost<unknown>(`/api/payments/mock/${encodeURIComponent(reference)}`, { outcome });
}

// ---------------------------------------------------------------------------
// Referencia en curso
// ---------------------------------------------------------------------------

/**
 * La referencia se guarda antes de salir hacia la pasarela porque la clienta
 * puede volver sin nada en la URL —cerrando la pestaña del banco, con el botón
 * atrás— y sin ella la pantalla de retorno no tendría por dónde preguntar.
 * `sessionStorage` y no `localStorage`: es de esta compra, no del navegador.
 */
const REFERENCE_KEY = 'aurelle.payment.reference';

export function rememberPaymentReference(reference: string): void {
  try {
    sessionStorage.setItem(REFERENCE_KEY, reference);
  } catch {
    // Navegación privada con almacenamiento bloqueado: el retorno todavía
    // funciona si la pasarela devuelve la referencia en la URL.
  }
}

export function readPaymentReference(): string | null {
  try {
    return sessionStorage.getItem(REFERENCE_KEY);
  } catch {
    return null;
  }
}
