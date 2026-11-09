import { useEffect, useSyncExternalStore } from 'react';
import { getCatalogVersion, hydrateCatalog, subscribeCatalog } from '../data/catalog';
import { usesApi } from '../config/features';

/** Cada cuánto se vuelve a preguntar a la API, con la pestaña a la vista. */
const EVERY_MS = 20_000;

/**
 * Mantiene el catálogo de la tienda al día con el panel.
 *
 * Pregunta a la API cada 20 segundos mientras la pestaña está a la vista, y
 * enseguida al volver a ella (que es cuando se nota: la dueña guarda en el
 * panel y pasa a la pestaña de la tienda). Devuelve un número que cambia
 * cuando llegan datos nuevos: quien lo usa como `key` vuelve a dibujar.
 *
 * En modo `static` no hace nada: el catálogo viene dentro del build.
 */
export function useLiveCatalog(): number {
  const version = useSyncExternalStore(subscribeCatalog, getCatalogVersion);

  useEffect(() => {
    if (!usesApi) return;
    let controller: AbortController | null = null;

    const refresh = (): void => {
      if (document.visibilityState !== 'visible') return;
      controller?.abort();
      controller = new AbortController();
      void hydrateCatalog(controller.signal);
    };

    const timer = window.setInterval(refresh, EVERY_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      controller?.abort();
    };
  }, []);

  return version;
}
