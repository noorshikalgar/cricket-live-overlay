import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@cos/shared': path.resolve(import.meta.dirname, '../../packages/shared/src/index.ts') } },
  test: { include: ['test/**/*.test.ts'] },
});
