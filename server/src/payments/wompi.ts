import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentGateway,
  PaymentMethodType,
  PaymentStatus,
  ProviderSnapshot,
  VerifiedEvent,
} from './types.js';

/**
 * Adaptador de Wompi (Bancolombia).
 *
 * Integración por **Checkout Web**: la clienta paga en una página de Wompi y
 * vuelve. Se eligió frente a la API directa por una razón concreta: con la API
 * directa el número de tarjeta pasa por nuestro frontend y el negocio entra en
 * el alcance de PCI-DSS, además de obligarnos a implementar a mano cada medio
 * de pago. Con el checkout alojado salen todos —tarjeta, Nequi, PSE,
 * Bancolombia, Daviplata— y ningún dato de tarjeta nos toca.
 *
 * Reparto de llaves, que es lo que decide qué corre dónde:
 *
 * | Llave              | Dónde vive | Para qué |
 * |--------------------|------------|----------|
 * | pública `pub_…`    | navegador  | abrir el checkout, consultar transacciones |
 * | privada `prv_…`    | SERVIDOR   | crear transacciones por API (aquí no se usa) |
 * | integridad         | SERVIDOR   | firmar el monto para que no lo puedan cambiar |
 * | eventos            | SERVIDOR   | verificar que un webhook lo mandó Wompi |
 *
 * Las tres últimas no pueden salir del servidor jamás. Si alguna llega a un
 * `VITE_…`, queda publicada en el bundle para cualquiera que abra las
 * herramientas de desarrollo.
 */

const CHECKOUT_BASE = 'https://checkout.wompi.co/p/';

export interface WompiConfig {
  readonly publicKey: string;
  readonly integritySecret: string;
  readonly eventsSecret: string;
  /** Se deduce del prefijo de la llave pública si no se fuerza. */
  readonly apiUrl?: string;
}

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Firma de integridad del checkout.
 *
 *     SHA256(referencia + monto_en_centavos + moneda + [expiración] + secreto)
 *
 * Es lo único que impide que alguien edite el formulario en el navegador y
 * pague $1.000 un pedido de $300.000: Wompi recalcula esta firma y rechaza la
 * transacción si el monto no es el que se firmó.
 *
 * La expiración entra en la cadena SOLO si se manda el parámetro, y ahí es
 * fácil equivocarse: firmarla y no enviarla (o al revés) da una firma inválida
 * y Wompi responde con un error que no explica por qué.
 */
export function integritySignature(args: {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret: string;
  /** ISO-8601 en UTC, exactamente el mismo texto que viaja en el formulario. */
  expirationTime?: string;
}): string {
  const { reference, amountInCents, currency, integritySecret, expirationTime } = args;
  const chain =
    reference + String(amountInCents) + currency + (expirationTime ?? '') + integritySecret;
  return sha256(chain);
}

/**
 * Fecha en el formato exacto que espera Wompi: ISO-8601 en UTC con
 * milisegundos. `toISOString()` ya lo da así, pero se aísla en una función
 * porque el texto firmado y el enviado tienen que ser el mismo byte a byte.
 */
export const expirationTime = (date: Date): string => date.toISOString();

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * Estructura del aviso de Wompi. Solo se declara lo que se usa.
 *
 * `signature.properties` son rutas con puntos dentro de `data`
 * ("transaction.id", "transaction.status"…). Se resuelven dinámicamente en vez
 * de leer campos fijos, porque es lo que dice el contrato y porque el día que
 * Wompi añada una propiedad a la firma, esto la incluye sin tocar nada.
 */
interface WompiEventBody {
  event?: string;
  data?: Record<string, unknown>;
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
  sent_at?: string;
  environment?: string;
}

/** Baja por un objeto siguiendo "a.b.c". */
function resolvePath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, root);
}

/**
 * Compara dos hashes en tiempo constante.
 *
 * Con `===` el tiempo de comparación depende de cuántos caracteres coinciden,
 * y eso deja adivinar un checksum válido byte a byte. Es un ataque remoto,
 * lento y real; evitarlo cuesta esta función.
 */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), 'utf8');
  const bufB = Buffer.from(b.toLowerCase(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifica el checksum de un evento.
 *
 *     SHA256(valores de `properties` en orden + timestamp + secreto_de_eventos)
 *
 * Sin separadores y con el timestamp como entero.
 *
 * NOTA IMPORTANTE, comprobada: el ejemplo resuelto que publica la
 * documentación de Wompi NO reproduce su propio checksum — la cadena que
 * imprimen, hasheada con el secreto que imprimen, da otro hash. La regla en
 * prosa sí es coherente entre la documentación en español, la inglesa y las
 * implementaciones de terceros, y es la que está aquí. Aun así, **verifica el
 * primer webhook real en sandbox** antes de confiar: si rebota, `WOMPI_DEBUG_
 * EVENTS=true` registra la cadena calculada para poder compararla.
 */
export function verifyEventChecksum(
  body: WompiEventBody,
  eventsSecret: string,
): { ok: boolean; reason?: string; chain: string } {
  const properties = body.signature?.properties;
  const checksum = body.signature?.checksum;
  const timestamp = body.timestamp;

  if (!Array.isArray(properties) || properties.length === 0) {
    return { ok: false, reason: 'El aviso no trae signature.properties.', chain: '' };
  }
  if (typeof checksum !== 'string' || checksum.length === 0) {
    return { ok: false, reason: 'El aviso no trae signature.checksum.', chain: '' };
  }
  if (typeof timestamp !== 'number') {
    return { ok: false, reason: 'El aviso no trae timestamp.', chain: '' };
  }

  let chain = '';
  for (const path of properties) {
    const value = resolvePath(body.data, path);
    if (value === undefined || value === null) {
      return { ok: false, reason: `La propiedad firmada "${path}" no viene en el aviso.`, chain: '' };
    }
    chain += String(value);
  }
  chain += String(timestamp) + eventsSecret;

  const ok = safeEqualHex(sha256(chain), checksum);
  return ok ? { ok, chain } : { ok, reason: 'La firma del aviso no coincide.', chain };
}

/**
 * Ventana de frescura de un aviso, en segundos.
 *
 * Un aviso legítimo de hace tres días, reenviado por alguien que lo capturó,
 * llevaría una firma perfectamente válida. El timestamp es lo único que
 * permite descartarlo. Holgado porque Wompi reintenta durante horas.
 */
export const EVENT_MAX_AGE_SECONDS = 24 * 60 * 60;

export function eventIsFresh(timestamp: number, now = Date.now()): boolean {
  const ageSeconds = now / 1000 - timestamp;
  // El margen negativo tolera un reloj adelantado en el lado de Wompi.
  return ageSeconds > -300 && ageSeconds < EVENT_MAX_AGE_SECONDS;
}

// ---------------------------------------------------------------------------
// Traducción de estados
// ---------------------------------------------------------------------------

/**
 * De los estados de Wompi a los nuestros.
 *
 * Wompi documenta APPROVED, DECLINED, VOIDED, ERROR y PENDING, pero su API ha
 * devuelto además PROCESSING, FAILED y REJECTED según el medio de pago. Lo
 * desconocido cae en PENDING y NO en ERROR a propósito: ante la duda, un cobro
 * se deja abierto para volver a preguntar, nunca se da por fallido — darlo por
 * fallido soltaría el stock de algo que quizá sí se pagó.
 */
export function mapStatus(providerStatus: string): PaymentStatus {
  switch (providerStatus.toUpperCase()) {
    case 'APPROVED':
      return 'APPROVED';
    case 'DECLINED':
    case 'REJECTED':
      return 'DECLINED';
    case 'VOIDED':
      return 'VOIDED';
    case 'ERROR':
    case 'FAILED':
      return 'ERROR';
    case 'PENDING':
    case 'PROCESSING':
      return 'PENDING';
    default:
      return 'PENDING';
  }
}

const METHODS: readonly PaymentMethodType[] = [
  'CARD',
  'NEQUI',
  'PSE',
  'BANCOLOMBIA_TRANSFER',
  'BANCOLOMBIA_COLLECT',
  'DAVIPLATA',
  'PCOL',
  'BNPL',
];

const mapMethod = (value: unknown): PaymentMethodType => {
  const upper = typeof value === 'string' ? value.toUpperCase() : '';
  return (METHODS as readonly string[]).includes(upper)
    ? (upper as PaymentMethodType)
    : 'UNKNOWN';
};

interface WompiTransaction {
  id?: string;
  reference?: string;
  status?: string;
  amount_in_cents?: number;
  payment_method_type?: string;
  status_message?: string | null;
}

function toSnapshot(tx: WompiTransaction, raw: unknown): ProviderSnapshot | null {
  if (!tx.id || !tx.reference || !tx.status) return null;
  return {
    status: mapStatus(tx.status),
    providerTransactionId: tx.id,
    reference: tx.reference,
    amountInCents: tx.amount_in_cents ?? 0,
    methodType: mapMethod(tx.payment_method_type),
    providerStatus: tx.status,
    ...(tx.status_message ? { statusMessage: tx.status_message } : {}),
    raw,
  };
}

// ---------------------------------------------------------------------------
// El adaptador
// ---------------------------------------------------------------------------

export function createWompiGateway(config: WompiConfig): PaymentGateway {
  const problems: string[] = [];
  if (!config.publicKey) problems.push('Falta WOMPI_PUBLIC_KEY.');
  else if (!/^pub_(test|prod)_/.test(config.publicKey))
    problems.push('WOMPI_PUBLIC_KEY no parece una llave pública de Wompi.');
  if (!config.integritySecret) problems.push('Falta WOMPI_INTEGRITY_SECRET.');
  if (!config.eventsSecret) problems.push('Falta WOMPI_EVENTS_SECRET.');

  const isProduction = config.publicKey.startsWith('pub_prod_');
  const apiUrl =
    config.apiUrl ??
    (isProduction ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1');

  async function getTransaction(path: string): Promise<unknown> {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${config.publicKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Wompi respondió ${response.status} consultando ${path}.`);
    }
    return response.json();
  }

  return {
    id: 'WOMPI',
    configured: problems.length === 0,
    problems,

    async openCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      const expires = expirationTime(request.expiresAt);
      const signature = integritySignature({
        reference: request.reference,
        amountInCents: request.amountInCents,
        currency: request.currency,
        integritySecret: config.integritySecret,
        expirationTime: expires,
      });

      /**
       * El Checkout Web se abre por GET con los datos en la query. No hay que
       * llamar a la API para crearlo: la transacción nace cuando la clienta
       * elige medio de pago allá. Por eso aquí no hay `providerTransactionId`
       * y la reconciliación posterior se hace por referencia.
       */
      const params = new URLSearchParams({
        'public-key': config.publicKey,
        currency: request.currency,
        'amount-in-cents': String(request.amountInCents),
        reference: request.reference,
        'signature:integrity': signature,
        'redirect-url': request.redirectUrl,
        'expiration-time': expires,
        'customer-data:email': request.customerEmail,
        'customer-data:full-name': request.customerName,
        'customer-data:phone-number': request.customerPhone,
        'customer-data:phone-number-prefix': '+57',
        'customer-data:legal-id': request.legalId,
        'customer-data:legal-id-type': request.legalIdType,
        'shipping-address:address-line-1': request.shipping.line1,
        'shipping-address:country': request.shipping.country,
        'shipping-address:city': request.shipping.city,
        'shipping-address:region': request.shipping.region,
        'shipping-address:phone-number': request.shipping.phone,
      });

      return { checkoutUrl: `${CHECKOUT_BASE}?${params.toString()}` };
    },

    async fetchByTransactionId(transactionId: string): Promise<ProviderSnapshot | null> {
      const body = await getTransaction(`/transactions/${encodeURIComponent(transactionId)}`);
      if (!body) return null;
      const tx = (body as { data?: WompiTransaction }).data;
      return tx ? toSnapshot(tx, body) : null;
    },

    /**
     * Wompi no expone una búsqueda pública por referencia. Se devuelve null y
     * el servicio cae en la vía que sí funciona: el id de transacción que
     * llega en la URL de retorno o en el webhook.
     */
    async fetchByReference(): Promise<ProviderSnapshot | null> {
      return null;
    },

    verifyEvent(body: unknown): VerifiedEvent {
      const event = body as WompiEventBody;
      const tx = (event?.data as { transaction?: WompiTransaction } | undefined)?.transaction;

      // La huella se calcula ANTES de validar la firma para poder registrar
      // también los intentos fallidos sin duplicarlos.
      const fingerprint = sha256(
        `${tx?.id ?? ''}|${tx?.status ?? ''}|${tx?.amount_in_cents ?? ''}|${event?.timestamp ?? ''}`,
      ).slice(0, 32);

      const check = verifyEventChecksum(event, config.eventsSecret);
      if (!check.ok) {
        return { valid: false, reason: check.reason ?? 'Firma inválida.', fingerprint };
      }
      if (typeof event.timestamp === 'number' && !eventIsFresh(event.timestamp)) {
        return { valid: false, reason: 'El aviso es demasiado viejo; se descarta.', fingerprint };
      }
      if (event.event !== 'transaction.updated') {
        return { valid: false, reason: `Evento no soportado: ${event.event}.`, fingerprint };
      }

      const snapshot = tx ? toSnapshot(tx, body) : null;
      if (!snapshot) {
        return { valid: false, reason: 'El aviso no trae una transacción completa.', fingerprint };
      }
      return { valid: true, snapshot, fingerprint };
    },
  };
}
