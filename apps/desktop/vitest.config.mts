import { defineConfig } from 'vitest/config';

// Unit tests for the desktop app's pure modules (the end-to-end tests in e2e/ use Playwright).
export default defineConfig({
  test: {
    name: 'desktop',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
