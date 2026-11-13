/**
 * Compilación de la API en Vercel (`npm run vercel-build`, ver vercel.json).
 *
 * 1. `prisma generate`: el cliente de Prisma no viene en el paquete, se genera
 *    a partir del esquema. Sin esto la función arranca y falla en la primera
 *    consulta. No se confía en el `postinstall` de @prisma/client: npm puede
 *    tener los scripts de instalación bloqueados y Vercel cachea node_modules.
 *
 * 2. `prisma migrate deploy`, SOLO en el despliegue de producción. Es lo mismo
 *    que hace el contenedor del Dockerfile al arrancar: el código nunca sale
 *    con un esquema viejo debajo. Se hace al compilar y no al arrancar porque
 *    en Vercel cada arranque en frío correría las migraciones otra vez. Si una
 *    migración falla, falla la compilación y Vercel sigue sirviendo la versión
 *    anterior, que es lo que se quiere. Los despliegues de prueba (preview) no
 *    migran: no deben tocar la base de producción.
 *
 *    Las migraciones van por la conexión DIRECTA, no por la del pooler: Prisma
 *    toma un bloqueo de sesión mientras migra y el pooler de Neon (modo
 *    transacción) no lo sostiene. Se usa, en este orden, `DIRECT_URL`,
 *    `DATABASE_URL_UNPOOLED` (la que crea la integración de Neon) o, si no hay
 *    ninguna, `DATABASE_URL`.
 *
 *    `SKIP_MIGRATIONS=true` lo apaga para quien prefiera migrar a mano.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// El CLI de Prisma se llama con este mismo Node y sin shell: igual en Linux
// (Vercel) que en Windows, y sin que nada pase por un intérprete de comandos.
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['generate']);

const isProduction = process.env.VERCEL_ENV === 'production';
if (!isProduction || process.env.SKIP_MIGRATIONS === 'true') {
  console.log(`Migraciones: no se aplican (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'local'}).`);
} else {
  const directUrl =
    process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!directUrl) {
    console.error('Falta DATABASE_URL: conecta la base de Neon al proyecto antes de desplegar.');
    process.exit(1);
  }
  run(['migrate', 'deploy'], { DATABASE_URL: directUrl });
}
