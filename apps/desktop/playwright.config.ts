import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests launch the real Electron app (built into out/ by `electron-vite build`) and
 * drive it like a volunteer would. Run with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
