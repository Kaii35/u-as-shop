/**
 * Configuración del servidor.
 *
 * Falla al arrancar si falta algo crítico: es mejor no levantar que servir
 * pedidos con un secreto vacío y enterarse en producción.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Copia server/.env.example a server/.env`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (isProduction && (jwtSecret.length < 32 || jwtSecret === 'cambiar-en-produccion')) {
  throw new Error('JWT_SECRET debe ser un secreto propio de 32+ caracteres en producción.');
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4100),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: jwtSecret || 'cambiar-en-produccion',
  /** Orígenes permitidos para CORS, separados por coma. */
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction,

  /**
   * Semilla del primer administrador. Solo se usa al sembrar: si el usuario
   * ya existe, el seed no le toca la contraseña.
   */
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@aurelle.co',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'aurelle-admin',

  // -------------------------------------------------------------------------
  // Pagos
  //
  // Las tres credenciales de abajo NO pueden salir del servidor. Si alguna
  // llega a una variable `VITE_…`, queda incrustada en el bundle y publicada
  // para cualquiera que abra las herramientas de desarrollo. Solo la llave
  // pública puede vivir en el navegador.
  // -------------------------------------------------------------------------

  /** `mock` deja probar el flujo entero sin credenciales. `wompi` cobra de verdad. */
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase() === 'wompi'
    ? ('WOMPI' as const)
    : ('MOCK' as const),
  wompiPublicKey: process.env.WOMPI_PUBLIC_KEY ?? '',
  wompiIntegritySecret: process.env.WOMPI_INTEGRITY_SECRET ?? '',
  wompiEventsSecret: process.env.WOMPI_EVENTS_SECRET ?? '',
  /** Solo si se quiere forzar; por defecto se deduce del prefijo de la llave. */
  wompiApiUrl: process.env.WOMPI_API_URL ?? '',
  /**
   * Registra la cadena que se firma al verificar un webhook.
   *
   * Es para depurar el PRIMER evento de sandbox, porque el ejemplo resuelto de
   * la documentación de Wompi no reproduce su propio checksum y conviene poder
   * comparar. Se niega a encenderse en producción: la cadena lleva el secreto
   * de eventos dentro y acabaría en los logs.
   */
  debugPaymentEvents: process.env.WOMPI_DEBUG_EVENTS === 'true' && !isProduction,

  /** Base pública del sitio. Con esto se arma la URL de retorno del pago. */
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',

  /**
   * Minutos que se apartan las unidades mientras la clienta paga.
   *
   * Corto castiga a quien pague por transferencia; largo bloquea mercancía por
   * carritos abandonados. Quince es el término medio habitual en retail.
   */
  reservationMinutes: Number(process.env.RESERVATION_MINUTES ?? 15),

  /**
   * Meses de historia de ventas que inventa el seed.
   *
   * El panel muestra semana, mes y últimos meses: sin historia las tres
   * gráficas salen planas en cero y no se puede juzgar si el diseño sirve.
   */
  seedMonths: Number(process.env.SEED_MONTHS ?? 14),
  /** Semilla del generador. Fija a propósito: dos siembras dan lo mismo. */
  seedRandom: Number(process.env.SEED_RANDOM ?? 20260924),
} as const;
