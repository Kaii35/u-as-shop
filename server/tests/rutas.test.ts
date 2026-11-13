/**
 * Rutas del panel probadas con `inject` de Fastify, sin levantar puerto ni
 * base: los casos de aquí se resuelven antes de llegar a Postgres.
 *
 *   npm --prefix server test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { ImageStorage } from '../src/storage.js';

// `env.ts` exige DATABASE_URL al importarse. Prisma no conecta hasta la primera
// consulta, y estas pruebas no llegan a ninguna.
process.env.DATABASE_URL ??= 'postgresql://nadie:nada@127.0.0.1:1/ninguna';
process.env.NODE_ENV = 'test';

const { signToken } = await import('../src/auth.js');
const { uploadRoutes } = await import('../src/routes/uploads.js');
const { settingRoutes } = await import('../src/routes/settings.js');
const { authRoutes } = await import('../src/routes/auth.js');
const { default: rateLimit } = await import('@fastify/rate-limit');

const bearer = (role: 'ADMIN' | 'STAFF') =>
  `Bearer ${signToken({ sub: 'u1', email: 'x@y.co', name: 'X', role })}`;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('subir foto: la URL que devuelve es la del almacenamiento (Blob)', async () => {
  const saved: string[] = [];
  const storage: ImageStorage = {
    kind: 'blob',
    async save(name, _body, contentType) {
      saved.push(`${name} ${contentType}`);
      return `https://tienda.public.blob.vercel-storage.com/uploads/${name}`;
    },
  };
  const app = Fastify();
  await app.register(uploadRoutes, { storage });

  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/uploads',
    headers: { authorization: bearer('ADMIN'), 'content-type': 'image/png' },
    payload: PNG,
  });

  assert.equal(res.statusCode, 201);
  const { url } = res.json() as { url: string };
  assert.match(url, /^https:\/\/tienda\.public\.blob\.vercel-storage\.com\/uploads\/[a-f0-9]{24}\.png$/);
  assert.equal(saved.length, 1);
  assert.match(saved[0]!, /^[a-f0-9]{24}\.png image\/png$/);
  await app.close();
});

test('subir foto: sin sesión no llega al almacenamiento', async () => {
  let llamadas = 0;
  const storage: ImageStorage = {
    kind: 'blob',
    async save() {
      llamadas += 1;
      return 'x';
    },
  };
  const app = Fastify();
  await app.register(uploadRoutes, { storage });

  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/uploads',
    headers: { 'content-type': 'image/png' },
    payload: PNG,
  });

  assert.equal(res.statusCode, 401);
  assert.equal(llamadas, 0);
  await app.close();
});

test('ajustes: STAFF no puede cambiarlos', async () => {
  const app = Fastify();
  await app.register(settingRoutes);

  const res = await app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: { authorization: bearer('STAFF') },
    payload: { 'promotions.popupEnabled': false },
  });

  assert.equal(res.statusCode, 403);
  await app.close();
});

test('ajustes: ADMIN sí pasa el permiso (y la validación responde)', async () => {
  const app = Fastify();
  await app.register(settingRoutes);

  const res = await app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: { authorization: bearer('ADMIN') },
    payload: { 'no.existe': true },
  });

  // 400 por la clave inventada: prueba que pasó el permiso sin tocar la base.
  assert.equal(res.statusCode, 400);
  await app.close();
});

test('login: frena la prueba masiva de contraseñas (429 tras 10 intentos)', async () => {
  const app = Fastify();
  await app.register(rateLimit, { global: false });
  await app.register(authRoutes);

  // Cuerpo inválido a propósito: responde 400 sin consultar la base, pero
  // cuenta igual para el límite.
  const intento = () => app.inject({ method: 'POST', url: '/api/admin/login', payload: {} });
  for (let i = 0; i < 10; i += 1) assert.equal((await intento()).statusCode, 400);
  assert.equal((await intento()).statusCode, 429);
  await app.close();
});

test('caché pública: solo para el CDN, solo en respuestas buenas, nunca para el navegador', async () => {
  const { publicCache, CDN_CACHE } = await import('../src/routes/catalog.js');
  const app = Fastify();
  app.get('/bien', { onSend: publicCache }, async () => ({ ok: true }));
  app.get('/mal', { onSend: publicCache }, async () => {
    throw new Error('la base no responde');
  });

  const bien = await app.inject({ method: 'GET', url: '/bien' });
  assert.equal(bien.headers['cdn-cache-control'], CDN_CACHE);
  // El navegador no puede quedarse con copias viejas: la pestaña abierta de la
  // tienda sondea cada 20 s y tiene que ver los cambios del panel.
  assert.equal(bien.headers['cache-control'], undefined);

  const mal = await app.inject({ method: 'GET', url: '/mal' });
  assert.equal(mal.statusCode, 500);
  assert.equal(mal.headers['cdn-cache-control'], undefined);
  await app.close();
});
