import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mapRealCatalog, type RawCatalog } from './src/data/realCatalog';

const src = fileURLToPath(new URL('./src', import.meta.url));
const realCatalog = fileURLToPath(new URL('./server/prisma/catalogo-real.json', import.meta.url));

/**
 * En modo `static` la tienda vive del catálogo real empaquetado. Si ese JSON
 * no mapea, el build falla aquí, en voz alta, en vez de publicar una tienda
 * que reviente al abrir o, peor, que enseñe el catálogo de ejemplo.
 */
function validateStaticCatalog(source: string): Plugin {
  return {
    name: 'validar-catalogo-estatico',
    buildStart() {
      if (source !== 'static') return;
      const data = JSON.parse(readFileSync(realCatalog, 'utf-8')) as RawCatalog;
      const { products, categories } = mapRealCatalog(data);
      this.info(`catálogo estático: ${products.length} productos en ${categories.length} categorías`);
    },
  };
}

/**
 * og:url y og:image tienen que ser absolutas o WhatsApp no pinta la vista
 * previa. El dominio sale de `VITE_SITE_URL` o, en Vercel, del dominio de
 * producción que la plataforma expone al compilar. Sin ninguno, no se ponen:
 * mejor sin imagen que con una URL rota.
 */
function openGraphUrls(siteUrl: string): Plugin {
  return {
    name: 'open-graph-absolutas',
    transformIndexHtml(html) {
      if (!siteUrl) return html;
      const tags = [
        `<meta property="og:url" content="${siteUrl}/" />`,
        `<meta property="og:image" content="${siteUrl}/icon-512.png" />`,
        '<meta property="og:image:width" content="512" />',
        '<meta property="og:image:height" content="512" />',
      ].map((t) => `    ${t}\n`).join('');
      return html.replace('    <meta name="twitter:card"', `${tags}    <meta name="twitter:card"`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const catalogSource = env.VITE_CATALOG_SOURCE || 'static';
  if (catalogSource !== 'static' && catalogSource !== 'api') {
    throw new Error(`VITE_CATALOG_SOURCE="${catalogSource}" no es válido: usa "static" o "api".`);
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const siteUrl = (env.VITE_SITE_URL || (vercelUrl ? `https://${vercelUrl}` : '')).replace(/\/$/, '');

  return {
    plugins: [react(), validateStaticCatalog(catalogSource), openGraphUrls(siteUrl)],
    resolve: {
      /**
       * Alias al estilo shadcn: '@/components/ui/...' resuelve dentro de src/.
       *
       * Se usa la forma con `find` como expresión regular anclada a '@/' en vez
       * de la clave '@' a secas: esta última sustituye por prefijo y también
       * capturaría los paquetes con scope de npm (@scope/paquete), que dejarían
       * de resolverse si alguna vez se importa uno desde src/.
       */
      alias: [{ find: /^@\//, replacement: src + '/' }],
    },
  };
});
