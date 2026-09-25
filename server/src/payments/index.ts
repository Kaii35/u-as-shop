import { env } from '../env.js';
import { createMockGateway } from './mock.js';
import { createWompiGateway } from './wompi.js';
import type { PaymentGateway } from './types.js';

export * from './types.js';

/**
 * La pasarela activa. Se elige una vez al arrancar y el resto del servidor
 * habla solo con el puerto, sin saber cuál le tocó.
 */
function select(): PaymentGateway {
  if (env.paymentProvider === 'WOMPI') {
    return createWompiGateway({
      publicKey: env.wompiPublicKey,
      integritySecret: env.wompiIntegritySecret,
      eventsSecret: env.wompiEventsSecret,
      ...(env.wompiApiUrl ? { apiUrl: env.wompiApiUrl } : {}),
    });
  }
  return createMockGateway(env.appUrl);
}

export const gateway: PaymentGateway = select();

/**
 * Arrancar con Wompi mal configurado es peor que no arrancar: la tienda
 * parecería sana y fallaría al cobrar, que es el único momento en que no
 * puede fallar. En producción se niega; en desarrollo avisa y sigue, para no
 * bloquear a quien esté trabajando en otra cosa.
 */
export function assertPaymentsReady(log: (msg: string) => void): void {
  if (gateway.configured) {
    if (gateway.id === 'MOCK') {
      log('Pagos en modo SIMULADO: no se cobra de verdad. PAYMENT_PROVIDER=wompi para activarlo.');
    }
    return;
  }

  const detail = `Pasarela ${gateway.id} mal configurada: ${gateway.problems.join(' ')}`;
  if (env.isProduction) throw new Error(detail);
  log(detail);
}

/**
 * Si el proveedor real está activo. Las rutas del checkout simulado se
 * registran solo cuando NO lo está: con Wompi en marcha, una ruta capaz de
 * marcar pagos como aprobados a voluntad sería una puerta abierta.
 */
export const isMockProvider = (): boolean => gateway.id === 'MOCK';
