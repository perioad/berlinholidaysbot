import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'lambdas/**/*.ts'],
      exclude: ['**/*.d.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@config': resolve(__dirname, 'config'),
      '@core': resolve(__dirname, 'src/core'),
      '@telegram': resolve(__dirname, 'src/telegram'),
    },
  },
});
