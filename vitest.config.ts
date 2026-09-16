import { defineConfig } from 'vitest/config';

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
    ],
  },
});
