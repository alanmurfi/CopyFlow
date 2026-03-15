import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default environment for .test.ts files (lib/ unit tests)
    environment: 'node',
    // Use jsdom for .test.tsx files (React component tests)
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
});
