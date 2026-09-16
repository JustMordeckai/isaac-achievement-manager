import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  // Le front importe ../shared : on autorise tout le dossier du projet.
  server: { fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } },
});
