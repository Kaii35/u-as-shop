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
      privateKey: env.wompiPrivateKey,
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
  /*
     Entorno de las llaves contra entorno del servidor.

     Los dos cruces son errores caros y silenciosos, y los dos pasan por lo
     mismo: copiar un .env de un sitio a otro.

     - Llaves de PRUEBA en producción: la tienda vende, emite pedidos y nunca
       entra un peso. Nadie se entera hasta que cuadran caja. Se niega a
       arrancar, que es infinitamente más barato que descubrirlo en el banco.
     - Llaves de PRODUCCIÓN fuera de producción: cada prueba cobra de verdad a
       una tarjeta real. Aquí no se puede abortar —puede ser deliberado, en un
       entorno de preproducción que sí cobra— pero sí se grita.
  */
  if (gateway.id === 'WOMPI') {
    const esDePruebas = env.wompiPublicKey.startsWith('pub_test_');
    if (env.isProduction && esDePruebas) {
      throw new Error(
        'Wompi está con llaves de PRUEBA (pub_test_…) y el servidor arrancó en producción. ' +
          'La tienda cobraría de mentira: ningún pago llegaría al banco. Pon las credenciales ' +
          'de producción o baja NODE_ENV.',
      );
    }
    if (!env.isProduction && !esDePruebas) {
      log(
        'AVISO: Wompi está con llaves de PRODUCCIÓN fuera de un entorno de producción. ' +
          'Cada prueba va a cobrar de verdad a una tarjeta real.',
      );
    }
  }

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
