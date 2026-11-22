import { app } from 'electron';
import log from 'electron-log/main';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

/**
 * Updates must never happen mid-event (ADR 0011). Until events exist this always
 * returns false; the event store will provide the real answer.
 */
function isEventOpen(): boolean {
  return false;
}

/**
 * Check GitHub Releases for a newer version, but only in an installed build and only
 * when no event is open. Offline is normal at venues, so failures are logged quietly.
 */
export function checkForUpdatesWhenSafe(): void {
  if (!app.isPackaged) return;
  if (isEventOpen()) {
    log.info('update check skipped: event open');
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    log.warn('update check failed (offline is normal)', err);
  });
}
