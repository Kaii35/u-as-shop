import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth.js';
import { env } from '../env.js';
import { createImageStorage, type ImageStorage } from '../storage.js';

/**
 * Fotos que se suben desde el panel: las de los productos y los flyers de las
 * promociones.
 *
 * El navegador ya las manda achicadas (ver `src/lib/uploadImage.ts`), así que
 * aquí solo se comprueba que de verdad sean una imagen y se guardan con un
 * nombre al azar. El nombre nunca sale de lo que manda el cliente: así no hay
 * forma de escribir fuera de la carpeta ni de pisar una foto ajena.
 *
 * Se guardan en disco (`UPLOADS_DIR`) y se sirven en `/uploads/<nombre>`. En la
 * base queda esa ruta relativa; la tienda le antepone la dirección de la API.
 * Con `BLOB_READ_WRITE_TOKEN` (Vercel) van a Vercel Blob y en la base queda su
 * URL pública absoluta, que la tienda usa tal cual. Ver `../storage.ts`.
 */

/**
 * En Vercel manda otro tope antes que este: el cuerpo de una función no pasa
 * de 4.5 MB (responde 413 sin llegar aquí). No estorba: el panel achica la foto
 * a 1600 px en WebP/JPG antes de subirla y queda muy por debajo (cientos de KB).
 */
const MAX_BYTES = 8 * 1024 * 1024;

/** Tipo declarado → extensión y firma de los primeros bytes. */
const FORMATS = {
  'image/jpeg': { ext: 'jpg', check: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', check: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': {
    ext: 'webp',
    check: (b: Buffer) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
} as const;

type Mime = keyof typeof FORMATS;
const MIMES = Object.keys(FORMATS) as Mime[];

const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
/** Solo nombres que este archivo pudo haber generado. */
const SAFE_NAME = /^[a-f0-9]{24}\.(jpg|png|webp)$/;

export async function uploadRoutes(
  app: FastifyInstance,
  options: { storage?: ImageStorage } = {},
): Promise<void> {
  const storage = options.storage ?? createImageStorage(env);

  // El parser vive dentro de este plugin: el resto de la API sigue aceptando
  // solo JSON.
  app.addContentTypeParser(MIMES, { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/api/admin/uploads', { preHandler: requireAuth, bodyLimit: MAX_BYTES }, async (request, reply) => {
    const mime = (request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() as Mime;
    const format = FORMATS[mime];
    const body = request.body;
    if (!format || !Buffer.isBuffer(body) || body.length === 0) {
      return reply.code(400).send({ error: 'Sube una foto en JPG, PNG o WebP.' });
    }
    if (!format.check(body)) {
      return reply.code(400).send({ error: 'El archivo no es una imagen válida.' });
    }

    const name = `${randomBytes(12).toString('hex')}.${format.ext}`;
    const url = await storage.save(name, body, mime);
    return reply.code(201).send({ url });
  });

  app.get<{ Params: { name: string } }>('/uploads/:name', async (request, reply) => {
    const { name } = request.params;
    if (!SAFE_NAME.test(name)) return reply.code(404).send({ error: 'No existe esa imagen.' });

    const path = join(env.uploadsDir, name);
    try {
      await stat(path);
    } catch {
      return reply.code(404).send({ error: 'No existe esa imagen.' });
    }

    const ext = name.split('.').pop() ?? '';
    return reply
      .header('Content-Type', CONTENT_TYPE[ext] ?? 'application/octet-stream')
      // El nombre es al azar y nunca se reescribe: se puede guardar para siempre.
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      // La tienda está en otro origen (otro puerto en desarrollo).
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(createReadStream(path));
  });
}
