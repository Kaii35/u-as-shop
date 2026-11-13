/**
 * La API tiene que arrancar como la arranca Vercel.
 *
 *   npm --prefix server test
 *
 * Vercel (`@vercel/node`, igual en producción que en `vercel dev`) cambia
 * `http.Server.prototype.listen` por una versión que se guarda el servidor sin
 * escuchar, hace `await import()` de `src/index.ts` y solo cuando ese import
 * termina pone el servidor a escuchar en un puerto suyo. Si el módulo se queda
 * esperando a que `listen` termine (un `await app.listen(...)` arriba del
 * todo), el import no acaba nunca: cada petición muere a los 60 s con
 * INTERNAL_FUNCTION_INVOCATION_FAILED y sin un solo log. Pasó en producción.
 *
 * Aquí se hace lo mismo que Vercel, sin base de datos: el arranque no consulta
 * Postgres y la ruta que se pide no existe.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'x'.repeat(64);
process.env.DATABASE_URL ??= 'postgresql://nadie:nada@127.0.0.1:1/ninguna';
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';

const esperar = <T>(ms: number, valor: T): Promise<T> =>
  new Promise((resolve) => setTimeout(resolve, ms, valor).unref());

test('arranca como en Vercel: el import termina y entrega el servidor', async () => {
  const listenOriginal = http.Server.prototype.listen;
  let capturado: http.Server | null = null;
  let avisar: () => void = () => {};
  const encontrado = new Promise<void>((resolve) => (avisar = resolve));

  // Lo mismo que hace @vercel/node antes de importar la función.
  http.Server.prototype.listen = function (this: http.Server) {
    capturado = this;
    http.Server.prototype.listen = listenOriginal;
    avisar();
    return this;
  } as typeof http.Server.prototype.listen;

  try {
    const resultado = await Promise.race([
      import('../src/index.js').then(() => 'importado'),
      esperar(5000, 'colgado'),
    ]);
    assert.equal(
      resultado,
      'importado',
      'El import de src/index.ts no terminó: en Vercel ninguna petición llegaría a la API.',
    );
    // Vercel espera hasta 1 s a que aparezca el servidor después del import.
    await Promise.race([encontrado, esperar(1000, undefined)]);
    assert.ok(capturado, 'La API no llamó a listen: Vercel no tendría servidor al que mandar peticiones.');
  } finally {
    http.Server.prototype.listen = listenOriginal;
  }

  // Y como Vercel: lo pone a escuchar en un puerto al azar y le pasa peticiones.
  const server = capturado as unknown as http.Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/no-existe`);
  assert.equal(res.status, 404);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
