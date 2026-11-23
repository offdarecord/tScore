import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface Launched {
  app: ElectronApplication;
  window: Page;
  /** Where this run saves new events (instead of Documents\tScore). */
  eventsDir: string;
  userData: string;
}

/**
 * Launch the built app (out/) with fresh, throwaway data and events folders, so tests never
 * touch or collide with a real copy of tScore open on the same machine. Pass `from` to start
 * again with a previous run's folders (a restart).
 */
export async function launchApp(
  from?: Pick<Launched, 'eventsDir' | 'userData'>,
): Promise<Launched> {
  const root = join(__dirname, '..');
  const userData = from?.userData ?? mkdtempSync(join(tmpdir(), 'tscore-e2e-'));
  const eventsDir =
    from?.eventsDir ?? join(mkdtempSync(join(tmpdir(), 'tscore-e2e-events-')), 'tScore');
  // Launch the app folder (not out/main/index.js) so Electron reads package.json, giving the
  // real app name and version as an installed copy would.
  const app = await electron.launch({
    args: [root],
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      TSCORE_TEST_USER_DATA: userData,
      TSCORE_TEST_EVENTS_DIR: eventsDir,
    },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window, eventsDir, userData };
}
