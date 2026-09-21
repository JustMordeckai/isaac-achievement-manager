import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** `@/…` is web/src, `@shared/…` is the code shared with the server; both are outside the Vite root. */
export const alias = {
  '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
  '@': fileURLToPath(new URL('./web/src', import.meta.url)),
};

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [react()],
  resolve: { alias },
  build: { outDir: 'dist', emptyOutDir: true },
  // The front imports ../shared, so the whole project folder is allowed.
  server: { fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } },
});
