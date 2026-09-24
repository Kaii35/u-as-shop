import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Alias al estilo shadcn: '@/components/ui/...' resuelve dentro de src/.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
