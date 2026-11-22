import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Launch the built app (out/) with a fresh, throwaway data folder, so tests never touch or
 * collide with a real copy of tScore open on the same machine.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const root = join(__dirname, '..');
  const userData = mkdtempSync(join(tmpdir(), 'tscore-e2e-'));
  // Launch the app folder (not out/main/index.js) so Electron reads package.json, giving the
  // real app name and version as an installed copy would.
  const app = await electron.launch({
    args: [root],
    cwd: root,
    env: { ...process.env, ELECTRON_RENDERER_URL: '', TSCORE_TEST_USER_DATA: userData },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window };
}
