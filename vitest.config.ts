import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { alias } from './vite.config.ts';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          include: ['tests/server/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'web',
          include: ['tests/web/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/web/setup.ts'],
        },
      },
    ],
  },
});
