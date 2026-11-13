/**
 * Fotos del panel: a disco o a Vercel Blob según el entorno.
 *
 *   npm --prefix server test
 *
 * No necesitan base ni token de Blob: el `put` de Blob se reemplaza por un
 * doble y el disco es una carpeta temporal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blobStorage, createImageStorage, diskStorage, type BlobPut } from '../src/storage.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('disco: guarda el archivo y devuelve /uploads/<nombre>', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fotos-'));
  try {
    const url = await diskStorage(join(dir, 'sub')).save('abc.png', PNG, 'image/png');
    assert.equal(url, '/uploads/abc.png');
    assert.deepEqual(await readFile(join(dir, 'sub', 'abc.png')), PNG);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('blob: sube público, con el token, sin sufijo, y devuelve la URL absoluta', async () => {
  const calls: Parameters<BlobPut>[] = [];
  const put: BlobPut = async (...args) => {
    calls.push(args);
    return { url: `https://tienda.public.blob.vercel-storage.com/${args[0]}` };
  };

  const url = await blobStorage('token-de-prueba', put).save('abc.webp', PNG, 'image/webp');

  assert.equal(url, 'https://tienda.public.blob.vercel-storage.com/uploads/abc.webp');
  assert.equal(calls.length, 1);
  const [pathname, body, options] = calls[0]!;
  assert.equal(pathname, 'uploads/abc.webp');
  assert.equal(body, PNG);
  assert.equal(options.access, 'public');
  assert.equal(options.token, 'token-de-prueba');
  assert.equal(options.contentType, 'image/webp');
  assert.equal(options.addRandomSuffix, false);
});

test('se elige Blob solo si hay token; sin token, el disco de siempre', () => {
  assert.equal(createImageStorage({ blobToken: 'x', uploadsDir: '/tmp/u' }).kind, 'blob');
  assert.equal(createImageStorage({ blobToken: '', uploadsDir: '/tmp/u' }).kind, 'disk');
});
