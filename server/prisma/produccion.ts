/**
 * Prepara una base de PRODUCCIÓN, sin datos de ejemplo.
 *
 *   DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm --prefix server run prod:init
 *
 * A diferencia de `seed.ts` (que inventa 14 meses de pedidos, clientas y
 * promociones para probar el panel), aquí solo se carga lo real:
 *
 *   1. La cuenta de administración, con el correo y la contraseña que se
 *      pasen. Se exigen: el `natalia-admin` de desarrollo no puede llegar a
 *      producción. Si la cuenta ya existe, NO se le cambia la contraseña.
 *   2. Los ajustes por defecto que falten. Los que ya existan no se tocan:
 *      pueden haberse cambiado desde el panel.
 *   3. El catálogo real (`catalogo-real.json`), igual que `catalog:import`.
 *
 * Se puede correr las veces que haga falta: no borra ni pisa nada.
 * Las migraciones van antes (`prisma migrate deploy`, que el contenedor de la
 * API ya corre al arrancar).
 */

import 'dotenv/config';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SETTING_DEFAULTS } from '../src/settings-defaults.js';
import { importRealCatalog } from './importar-catalogo.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
const password = process.env.ADMIN_PASSWORD ?? '';
const name = process.env.ADMIN_NAME?.trim() || 'Natalia Sánchez';

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Falta ADMIN_EMAIL (el correo con el que se entra al panel).');
if (password.length < 12) fail('ADMIN_PASSWORD tiene que tener al menos 12 caracteres.');
if (password === 'natalia-admin' || email === 'admin@nataliasanchez.co') {
  fail('Esas son las credenciales de desarrollo. Usa un correo y una contraseña propios.');
}

const prisma = new PrismaClient({ log: ['warn', 'error'] });

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: UserRole.ADMIN, active: true } });
    console.log(`  Cuenta ${email}: ya existía, se deja su contraseña.`);
  } else {
    await prisma.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 10), role: UserRole.ADMIN, active: true },
    });
    console.log(`  Cuenta ${email}: creada.`);
  }

  let created = 0;
  for (const setting of SETTING_DEFAULTS) {
    const found = await prisma.setting.findUnique({ where: { key: setting.key } });
    if (found) continue;
    await prisma.setting.create({
      data: {
        key: setting.key,
        value: setting.value as Prisma.InputJsonValue,
        label: setting.label,
        group: setting.group,
      },
    });
    created += 1;
  }
  console.log(`  Ajustes: ${created} nuevos, ${SETTING_DEFAULTS.length - created} ya estaban.`);

  const { products, review } = await importRealCatalog(prisma);
  console.log(`  Catálogo real: ${products} productos.`);
  if (review.length) console.log(`  Para revisar el nombre (${review.length}): ${review.join(', ')}`);
  console.log('\n  Listo. Entra al panel en /admin con ese correo.\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
