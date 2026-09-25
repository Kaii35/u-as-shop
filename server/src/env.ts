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
