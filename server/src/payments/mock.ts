import { createHash } from 'node:crypto';
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentGateway,
  ProviderSnapshot,
  VerifiedEvent,
} from './types.js';
import { mapStatus } from './wompi.js';

/**
 * Pasarela simulada.
 *
 * No es un atajo para no escribir la de verdad: es lo que permite que el
 * proyecto se pueda abrir, probar y demostrar sin tener una cuenta de Wompi
 * aprobada, que tarda días. Recorre exactamente el mismo camino —intento,
 * reserva de stock, redirección, aviso, reconciliación— con las mismas
 * estructuras, así que probar aquí prueba el flujo real. Lo único falso es
 * quién decide el desenlace.
 *
 * En vez de un banco, decide quien pulsa: el checkout simulado ofrece aprobar,
 * rechazar o dejar pendiente.
 */

/**
 * Id de transacción con la misma pinta que los de Wompi
 * (`1234-1610641025-49201`), para que nada del resto del sistema pueda
 * depender sin querer del formato.
 */
const fakeTransactionId = (reference: string): string => {
  const digits = createHash('sha256').update(reference).digest('hex').replace(/\D/g, '');
  const head = (digits.slice(0, 4) || '1000').padEnd(4, '0');
  const tail = (digits.slice(4, 9) || '10000').padEnd(5, '0');
  return `${head}-${Math.floor(Date.now() / 1000)}-${tail}`;
};

export function createMockGateway(appUrl: string): PaymentGateway {
  return {
    id: 'MOCK',
    configured: true,
    problems: [],

    /**
     * Manda a una pantalla propia en vez de a un dominio externo. La URL lleva
     * la referencia y el monto solo para poder pintarlos; quien manda sobre el
     * monto sigue siendo la base de datos, igual que con la pasarela real.
     */
    async openCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      const params = new URLSearchParams({
        ref: request.reference,
        monto: String(request.amountInCents),
        volver: request.redirectUrl,
      });
      return { checkoutUrl: `${appUrl}/pago/simulado?${params.toString()}` };
    },

    /**
     * La pasarela simulada no guarda estado propio: la verdad está en nuestra
     * tabla `payments`, que es la que el servicio ya consulta. Devolver null
     * hace que la reconciliación por consulta no invente nada.
     */
    async fetchByTransactionId(): Promise<ProviderSnapshot | null> {
      return null;
    },

    async fetchByReference(): Promise<ProviderSnapshot | null> {
      return null;
    },

    /**
     * El aviso simulado no lleva firma criptográfica —no hay secreto
     * compartido con nadie— pero sí pasa por la misma puerta y devuelve la
     * misma forma, para que el servicio no tenga un camino especial para el
     * modo demo. Las rutas que lo emiten solo existen cuando el proveedor es
     * MOCK; en producción con Wompi no hay forma de llegar aquí.
     */
    verifyEvent(body: unknown): VerifiedEvent {
      const event = body as {
        reference?: string;
        status?: string;
        amountInCents?: number;
      };

      if (!event?.reference || !event?.status) {
        return {
          valid: false,
          reason: 'El aviso simulado necesita referencia y estado.',
          fingerprint: 'mock-invalido',
        };
      }

      const status = mapStatus(event.status);
      const transactionId = fakeTransactionId(event.reference);

      return {
        valid: true,
        fingerprint: createHash('sha256')
          .update(`${event.reference}|${status}`)
          .digest('hex')
          .slice(0, 32),
        snapshot: {
          status,
          providerTransactionId: transactionId,
          reference: event.reference,
          amountInCents: event.amountInCents ?? 0,
          methodType: 'CARD',
          providerStatus: event.status.toUpperCase(),
          statusMessage: 'Transacción simulada (pasarela de pruebas).',
          raw: body,
        },
      };
    },
  };
}
