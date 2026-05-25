import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 7+/Vitest 4 unterstuetzt tsconfig-paths nativ — kein extra Plugin noetig.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
