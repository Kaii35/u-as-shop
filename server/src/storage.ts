import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { put } from '@vercel/blob';

/**
 * Dónde se guardan las fotos que se suben desde el panel.
 *
 * Hay dos sitios y se elige solo, por el entorno:
 *
 * - **Disco** (`UPLOADS_DIR`), lo de siempre: un VPS o un contenedor con
 *   volumen. La foto queda en `/uploads/<nombre>` y la sirve la propia API;
 *   la tienda le antepone la dirección de la API (`assetUrl`).
 * - **Vercel Blob**, cuando existe `BLOB_READ_WRITE_TOKEN`. En Vercel el disco
 *   de una función se borra entre invocaciones: una foto guardada ahí
 *   desaparecería en minutos. Blob devuelve una URL pública absoluta
 *   (`https://….public.blob.vercel-storage.com/…`) que la tienda usa tal cual,
 *   porque `assetUrl` solo toca las rutas que empiezan por `/uploads/`.
 *
 * El nombre lo pone siempre `uploads.ts` (al azar); aquí no se decide nada
 * sobre el contenido, solo dónde vive.
 */
export interface ImageStorage {
  readonly kind: 'disk' | 'blob';
  /** Guarda la foto y devuelve la URL con la que queda en la base. */
  save(name: string, body: Buffer, contentType: string): Promise<string>;
}

export function diskStorage(dir: string): ImageStorage {
  return {
    kind: 'disk',
    async save(name, body) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), body);
      return `/uploads/${name}`;
    },
  };
}

/** Solo la parte de `put` que se usa; así las pruebas pueden pasar un doble. */
export type BlobPut = (
  pathname: string,
  body: Buffer,
  options: {
    access: 'public';
    contentType: string;
    token: string;
    addRandomSuffix: boolean;
    cacheControlMaxAge: number;
  },
) => Promise<{ url: string }>;

export function blobStorage(token: string, putFn: BlobPut = put as unknown as BlobPut): ImageStorage {
  return {
    kind: 'blob',
    async save(name, body, contentType) {
      const { url } = await putFn(`uploads/${name}`, body, {
        access: 'public',
        contentType,
        token,
        // El nombre ya es al azar y único: un sufijo más solo alarga la URL.
        addRandomSuffix: false,
        // Igual que en disco: el nombre nunca se reescribe, se cachea un año.
        cacheControlMaxAge: 31_536_000,
      });
      return url;
    },
  };
}

export function createImageStorage(config: { blobToken: string; uploadsDir: string }): ImageStorage {
  return config.blobToken ? blobStorage(config.blobToken) : diskStorage(config.uploadsDir);
}
