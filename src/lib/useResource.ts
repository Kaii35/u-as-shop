import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/**
 * Carga de datos para las pantallas del panel.
 *
 * No es una librería de caché ni pretende serlo: es el mínimo para que las
 * ocho pantallas traten igual los tres estados que siempre tienen (cargando,
 * error, datos) y para que ninguna se quede pidiendo algo que ya no importa.
 */

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** `true` solo en la primera carga: sirve para decidir esqueleto vs. velo. */
  first: boolean;
  reload: () => void;
}

export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loadedOnce = useRef(false);

  // La referencia evita que un `fetcher` definido en línea (lo normal) vuelva
  // a disparar la carga en cada render. Las dependencias reales son `deps`.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
        loadedOnce.current = true;
      })
      .catch((err: unknown) => {
        // Una petición cancelada no es un fallo: pasa cada vez que se cambia
        // de filtro antes de que llegue la anterior, y pintarlo como error
        // haría parpadear un mensaje rojo al teclear en el buscador.
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la información.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, first: loading && !loadedOnce.current, reload };
}

/**
 * Retrasa un valor. Para el buscador: sin esto se dispara una consulta por
 * tecla y las respuestas llegan desordenadas.
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Acción con estado: guardar, borrar, cambiar de estado.
 *
 * Devuelve `run`, que nunca lanza: deja el mensaje en `error` para pintarlo
 * junto al formulario. Que una acción de interfaz lance obligaría a cada
 * botón a envolverse en try/catch y el primer olvido rompe la pantalla.
 */
export function useAction<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<R | null> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudo completar la acción.');
        return null;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { run, pending, error, clearError: useCallback(() => setError(null), []) };
}
