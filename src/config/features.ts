/**
 * Interruptores del lanzamiento.
 *
 * La primera versión publicada no tiene cuentas de clienta, ni carrito, ni
 * pagos en línea: cada compra se coordina por WhatsApp. Nada de eso se borró;
 * se apaga aquí y se vuelve a encender con una variable de entorno de Vite
 * (`"true"` lo enciende, cualquier otro valor lo deja apagado). Sin variable,
 * manda el valor de este lanzamiento.
 *
 * Las variables se leen al COMPILAR: cambiarlas en Vercel exige volver a
 * desplegar.
 */

const flag = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value === '' ? fallback : value === 'true';

export const features = {
  /** Ingreso, registro y "Mi cuenta" de la clienta. */
  auth: flag(import.meta.env.VITE_FEATURE_AUTH, false),
  /** Carrito, checkout, resultado del pago y pasarela simulada. */
  cart: flag(import.meta.env.VITE_FEATURE_CART, false),
  /** Panel de administración. Necesita la API. */
  admin: flag(import.meta.env.VITE_FEATURE_ADMIN, false),
} as const;

export type CatalogSource = 'static' | 'api';

/**
 * De dónde sale el catálogo de la tienda.
 *
 * - `static` (por defecto): `server/prisma/catalogo-real.json`, empaquetado
 *   en el build. No se llama a la API.
 * - `api`: `GET /api/catalog`, como antes, con el catálogo de ejemplo de
 *   respaldo si la API no responde.
 *
 * Un valor desconocido revienta en vez de adivinar: un error de tipeo en
 * Vercel no puede terminar mostrando el catálogo de ejemplo.
 */
export const catalogSource: CatalogSource = (() => {
  const raw = import.meta.env.VITE_CATALOG_SOURCE || 'static';
  if (raw !== 'static' && raw !== 'api') {
    throw new Error(`VITE_CATALOG_SOURCE="${raw}" no es válido: usa "static" o "api".`);
  }
  return raw;
})();

/** La tienda habla con la API (promociones, contadores). Solo en modo `api`. */
export const usesApi = catalogSource === 'api';
