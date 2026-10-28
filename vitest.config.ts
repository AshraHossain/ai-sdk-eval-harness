import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    env: { EVAL_MODE: 'mock' },
    testTimeout: 20_000,
  },
});
