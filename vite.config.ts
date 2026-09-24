import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
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
});
