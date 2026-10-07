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

  /*
     APP_URL apuntando a localhost con Wompi activo: el checkout NO ABRE.

     Comprobado contra el checkout real: Wompi rechaza con un 403 de CloudFront
     («Request blocked») cualquier `redirect-url` que apunte a localhost o a
     127.0.0.1, con http y con https. Un dominio cualquiera pasa, incluso por
     http. Se aisló parámetro a parámetro: con los otros doce la URL responde
     200 y basta añadir el redirect-url a localhost para que devuelva 403.

     Esto merece un aviso a gritos porque el síntoma no se parece a la causa:
     la clienta no ve un error de la tienda, ve una página de error de Amazon
     sin una sola pista de qué pasó, y en el servidor no queda ni rastro.

     Para probar en local, APP_URL tiene que ser un dominio público: sirve la
     URL del mismo túnel con el que se reciben los avisos.
  */
  if (gateway.id === 'WOMPI' && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(env.appUrl)) {
    const detalle =
      `APP_URL es ${env.appUrl} y Wompi está activo: EL CHECKOUT NO VA A ABRIR. ` +
      'Wompi rechaza con 403 cualquier URL de retorno que apunte a localhost o 127.0.0.1. ' +
      'Pon un dominio público en APP_URL (vale la URL del túnel de webhook:tunnel).';
    if (env.isProduction) throw new Error(detalle);
    log(`AVISO: ${detalle}`);
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
