import { defineConfig } from '@playwright/test';

/**
 * `npm run screenshots`: launches the real app with the invented demo event (fixtures/demo/) and
 * saves each main screen to docs/media/ for the README and the feature tour. Not part of CI.
 */
export default defineConfig({
  testDir: './screenshots',
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
});
