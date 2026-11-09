import { api } from './api';

/**
 * Sube una foto elegida en el panel y devuelve la ruta con la que se guarda.
 *
 * Antes de subirla se achica en el navegador: una foto de celular pesa 4–8 MB
 * y la tienda no necesita más de 1600 px. Así sube rápido aunque la conexión
 * sea mala, y la tienda carga liviana. Sale en WebP; si el navegador no sabe
 * hacerlo (Safari viejo), en JPG.
 */

const MAX_SIDE = 1600;
const QUALITY = 0.86;

export async function uploadImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif|avif)$/i.test(file.type)) {
    throw new Error(`«${file.name}» no es una foto. Usa JPG, PNG o WebP.`);
  }
  const blob = await shrink(file);
  const { url } = await api.upload(blob);
  return url;
}

async function shrink(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`No se pudo leer «${file.name}». Prueba con una foto en JPG o PNG.`);
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo preparar la foto.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webp = await toBlob(canvas, 'image/webp');
  // Algunos navegadores devuelven PNG cuando no saben WebP.
  if (webp && webp.type === 'image/webp') return webp;
  const jpg = await toBlob(canvas, 'image/jpeg');
  if (!jpg) throw new Error('El navegador no pudo preparar la foto.');
  return jpg;
}

const toBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
