import type { PaymentStatus } from '@prisma/client';

/**
 * Dominio de pagos, independiente del proveedor.
 *
 * Ni una línea de este archivo menciona a Wompi, a propósito: el resto del
 * servidor habla solo este lenguaje, y cambiar de pasarela —o soportar dos a
 * la vez— es escribir otro adaptador, no tocar los pedidos ni el inventario.
 */

export type { PaymentStatus };

/**
 * Método con el que se pagó. Lo dice la pasarela AL RESOLVER, no al crear el
 * intento: en un checkout alojado la clienta todavía no ha elegido cuando
 * nosotros ya creamos el cobro.
 */
export type PaymentMethodType =
  | 'CARD'
  | 'NEQUI'
  | 'PSE'
  | 'BANCOLOMBIA_TRANSFER'
  | 'BANCOLOMBIA_COLLECT'
  | 'DAVIPLATA'
  | 'PCOL'
  | 'BNPL'
  | 'UNKNOWN';

/** Lo que el servicio le pide a la pasarela para abrir un cobro. */
export interface CheckoutRequest {
  /** Única e irrepetible. Es la clave con la que se reconcilia después. */
  readonly reference: string;
  readonly amountInCents: number;
  readonly currency: 'COP';
  readonly customerEmail: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly legalIdType: string;
  readonly legalId: string;
  readonly shipping: {
    readonly line1: string;
    readonly city: string;
    readonly region: string;
    readonly country: 'CO';
    readonly phone: string;
  };
  /** A dónde vuelve la clienta cuando termina. */
  readonly redirectUrl: string;
  /** Cuándo caduca el intento. Va firmada, así que no se puede alargar desde fuera. */
  readonly expiresAt: Date;
}

/** Lo que la pasarela devuelve al abrirlo. */
export interface CheckoutSession {
  /** A dónde mandar a la clienta. */
  readonly checkoutUrl: string;
  /**
   * Id de la transacción, si el proveedor lo entrega ya.
   *
   * Con un checkout alojado normalmente NO existe todavía: la transacción
   * nace cuando la clienta elige medio de pago, y hasta entonces lo único que
   * tenemos es la referencia. Por eso la referencia es la clave y no esto.
   */
  readonly providerTransactionId?: string;
}

/** Foto del estado de un cobro según la pasarela. */
export interface ProviderSnapshot {
  readonly status: PaymentStatus;
  readonly providerTransactionId: string;
  readonly reference: string;
  readonly amountInCents: number;
  readonly methodType: PaymentMethodType;
  /** Texto crudo del proveedor: 'APPROVED', 'DECLINED'… Se guarda tal cual. */
  readonly providerStatus: string;
  readonly statusMessage?: string;
  /** La respuesta entera, para poder discutir un cobro con la pasarela. */
  readonly raw: unknown;
}

/**
 * Resultado de verificar un aviso entrante.
 *
 * `valid: false` NO es una excepción: es un caso que hay que registrar y
 * responder con un 401, porque es exactamente la pinta que tiene alguien
 * intentando marcar como pagado un pedido que nadie pagó.
 */
export type VerifiedEvent =
  | { readonly valid: true; readonly snapshot: ProviderSnapshot; readonly fingerprint: string }
  | { readonly valid: false; readonly reason: string; readonly fingerprint: string };

/**
 * El puerto. Un adaptador es esto y nada más.
 */
export interface PaymentGateway {
  readonly id: 'MOCK' | 'WOMPI';
  /** Para avisar en el panel cuando faltan credenciales. */
  readonly configured: boolean;
  /** Qué le falta, en español, si no está configurado. */
  readonly problems: readonly string[];

  openCheckout(request: CheckoutRequest): Promise<CheckoutSession>;

  /**
   * Pregunta por una transacción. Es el plan B cuando el webhook no llega,
   * que pasa más de lo que uno querría.
   */
  fetchByTransactionId(transactionId: string): Promise<ProviderSnapshot | null>;

  /** Algunas pasarelas permiten buscar por referencia. Null si no se puede. */
  fetchByReference(reference: string): Promise<ProviderSnapshot | null>;

  /** Verifica la firma de un aviso entrante y lo traduce al dominio. */
  verifyEvent(body: unknown): VerifiedEvent;
}

// ---------------------------------------------------------------------------
// Utilidades de dinero
// ---------------------------------------------------------------------------

/**
 * Pesos a centavos.
 *
 * En todo el sistema el dinero son pesos enteros; las pasarelas cobran en
 * centavos. La conversión vive AQUÍ y en ningún otro sitio, porque un factor
 * 100 aplicado dos veces —o ninguna— es un cobro cien veces mayor o menor.
 */
export const toCents = (pesos: number): number => Math.round(pesos) * 100;

export const fromCents = (cents: number): number => Math.round(cents / 100);

/** Mensaje para la clienta. Nunca el texto crudo de la pasarela. */
const MESSAGES: Record<PaymentStatus, string> = {
  PENDING: 'Estamos esperando la confirmación de tu banco. Puede tardar unos minutos.',
  // No promete un correo de confirmación: el proyecto todavía no envía
  // ninguno, y prometerlo haría que la clienta se quedara esperándolo.
  APPROVED: 'Pago aprobado. Tu pedido ya está confirmado.',
  DECLINED: 'Tu banco rechazó el pago. Verifica los datos o intenta con otro medio.',
  VOIDED: 'La transacción fue anulada. No se te cobró nada.',
  ERROR: 'Ocurrió un error procesando el pago. No se hizo ningún cobro.',
  EXPIRED: 'El tiempo para pagar se agotó y liberamos los productos. Puedes intentarlo de nuevo.',
};

export const statusMessage = (status: PaymentStatus): string => MESSAGES[status];

/** Estados en los que el cobro ya no va a cambiar solo. */
export const isFinal = (status: PaymentStatus): boolean => status !== 'PENDING';

/**
 * Si un estado nuevo puede sustituir al que hay.
 *
 * Los webhooks llegan repetidos y DESORDENADOS: es normal recibir el PENDING
 * después del APPROVED. Sin esta guarda, ese retraso devolvería a pendiente un
 * pedido ya cobrado, le soltaría el stock y dejaría a la clienta pagando algo
 * que la tienda cree que nadie compró.
 */
export function canTransition(current: PaymentStatus, next: PaymentStatus): boolean {
  if (current === next) return false;
  // Desde pendiente se puede ir a cualquier desenlace.
  if (current === 'PENDING') return true;
  // Un cobro aprobado solo puede anularse; nunca "des-aprobarse" a rechazado.
  if (current === 'APPROVED') return next === 'VOIDED';
  /**
   * Un aprobado que llega DESPUÉS de haber expirado sí se acepta.
   *
   * Es el caso que más dinero cuesta si se ignora: la clienta pagó de verdad,
   * su banco tardó más que nuestro plazo, y nosotros ya habíamos anulado el
   * pedido y soltado el stock. Descartar ese aviso sería quedarnos con la
   * plata y no entregar nada, y ni siquiera enterarnos.
   *
   * Aceptarlo obliga a volver a descontar unidades que quizá ya se vendieron,
   * así que el servicio tiene que contemplar que no alcancen: ahí el cobro se
   * marca APPROVED igual —el dinero se movió, negarlo no lo deshace— y el
   * pedido queda señalado para resolverlo a mano.
   */
  if (current === 'EXPIRED') return next === 'APPROVED';
  // El resto son finales de verdad: si la clienta reintenta, se crea otro
  // intento con otra referencia, no se resucita este.
  return false;
}
