import path from 'path';
import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts. That file builds the production
// bundle; putting test-only settings in it means a mistake in the test setup
// can break a deploy. Vitest prefers this file when both are present.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // websocketUrlFor falls back to window.location.origin, so these tests need
    // a DOM to be exercising the real code path rather than a stubbed one.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
});
