/**
 * Cliente HTTP del panel.
 *
 * Una sola puerta a la API para que el token, los errores y la base de la URL
 * se traten igual en todas partes. Las páginas nunca llaman a `fetch`.
 */

/**
 * En desarrollo la API está en el 4100. En producción `VITE_API_URL` es
 * OBLIGATORIA: sin ella el sitio desplegado buscaría la API en el localhost
 * de quien lo visita, que es un fallo silencioso y difícil de ver.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4100').replace(/\/$/, '');

const TOKEN_KEY = 'aurelle.admin.token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Navegación privada con almacenamiento bloqueado: se trabaja sin sesión
    // persistente en vez de reventar la aplicación entera.
    return null;
  }
};

export const setToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
};

/**
 * Qué hacer cuando la API responde 401.
 *
 * Lo registra el proveedor de sesión al montar. Sin esto, un token vencido
 * dejaría al panel mostrando errores en cada pantalla en vez de mandar a la
 * pantalla de entrada, que es lo único que la persona puede hacer al respecto.
 */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null): void => {
  onUnauthorized = fn;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Query en objeto: los `undefined`, `null` y `''` se omiten. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Las rutas públicas (catálogo, pop-up) no mandan token. */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(API_BASE + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    // `fetch` solo rechaza si no hubo respuesta: API apagada, CORS o sin red.
    // Distinguirlo de un error del servidor importa, porque la solución es
    // otra: aquí hay que levantar la API, no revisar el código.
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(0, 'No se pudo conectar con el servidor. ¿Está corriendo la API?');
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const data = payload as { error?: string; code?: string } | null;
    if (response.status === 401 && auth) onUnauthorized?.();
    throw new ApiError(response.status, data?.error ?? `Error ${response.status}`, data?.code);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { query, ...(signal ? { signal } : {}) }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'DELETE', query }),
  /** Para las rutas públicas: catálogo y pop-up de promociones. */
  publicGet: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { auth: false, ...(signal ? { signal } : {}) }),
  publicPost: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body, auth: false }),
};
