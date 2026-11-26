import { app } from 'electron';
import log from 'electron-log/main';
import electronUpdater from 'electron-updater';
import { isEventOpen } from './events';

const { autoUpdater } = electronUpdater;

/**
 * Check GitHub Releases for a newer version, but only in an installed build and only
 * when no event is open. Offline is normal at venues, so failures are logged quietly.
 */
export function checkForUpdatesWhenSafe(): void {
  if (!app.isPackaged) return;
  // The Mac beta isn't signed, and macOS won't install an unsigned update: Mac users download
  // each new version by hand until it is (#61).
  if (process.platform === 'darwin') {
    log.info('update check skipped: the Mac beta updates by hand');
    return;
  }
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
