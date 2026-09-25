import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { hydrateCatalog } from './data/catalog';
import './index.css';

/**
 * Antes de montar, se intenta traer el catálogo real de la API.
 *
 * Se hace aquí y no dentro de un componente porque las páginas leen
 * `products` de forma síncrona: si se hidratara después del primer render,
 * la tienda pintaría el catálogo de ejemplo y no volvería a dibujarse.
 *
 * El límite de tiempo es lo que mantiene la demo abrible: si la API no está
 * levantada, en un segundo y medio se deja de esperar y se arranca con los
 * datos de ejemplo, en vez de dejar la página en blanco hasta que el navegador
 * se rinda por su cuenta.
 */
async function boot(): Promise<void> {
  const controller = new AbortController();
  const timeout = new Promise<false>((resolve) => {
    window.setTimeout(() => {
      controller.abort();
      resolve(false);
    }, 1500);
  });

  await Promise.race([hydrateCatalog(controller.signal), timeout]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void boot();
