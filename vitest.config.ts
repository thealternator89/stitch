/* eslint-disable */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environmentMatchGlobs: [
      ['src/main/**/__tests__/**/*.ts', 'node'],
      ['src/renderer/**/__tests__/**/*.{ts,tsx}', 'jsdom'],
    ],
  },
});
