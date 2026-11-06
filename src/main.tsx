import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { hydrateCatalog, loadStaticCatalog } from './data/catalog';
import { catalogSource } from './config/features';
import './index.css';

/**
 * Antes de montar se carga el catálogo.
 *
 * Se hace aquí y no dentro de un componente porque las páginas leen
 * `products` de forma síncrona: si se hidratara después del primer render,
 * la tienda pintaría el catálogo de ejemplo y no volvería a dibujarse.
 *
 * - `static` (el del lanzamiento): el catálogo real viene dentro del build.
 *   No se espera a nadie ni se llama a la API, y si fallara se lanza: nunca
 *   se cae al catálogo de ejemplo.
 * - `api`: se pide a la API con un límite de un segundo y medio. Si no
 *   responde, se arranca con los datos de ejemplo, en vez de dejar la página
 *   en blanco hasta que el navegador se rinda por su cuenta.
 */
async function boot(): Promise<void> {
  if (catalogSource === 'static') {
    loadStaticCatalog();
  } else {
    const controller = new AbortController();
    const timeout = new Promise<false>((resolve) => {
      window.setTimeout(() => {
        controller.abort();
        resolve(false);
      }, 1500);
    });

    await Promise.race([hydrateCatalog(controller.signal), timeout]);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void boot();
