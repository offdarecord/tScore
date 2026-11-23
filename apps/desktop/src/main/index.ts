import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import log from 'electron-log/main';
import { IPC, type AppInfo } from '../shared/ipc';
import { closeEvents, eventHandlers, eventsDir } from './events';
import { checkForUpdatesWhenSafe } from './updates';

// Automated tests run the app with its own data folder, so they never touch (or get blocked by)
// a real copy of tScore open on the same machine. Must happen before anything uses userData.
const testUserData = process.env['TSCORE_TEST_USER_DATA'];
if (testUserData && !app.isPackaged) app.setPath('userData', testUserData);

log.initialize();
log.info('tScore starting', { version: app.getVersion() });

process.on('uncaughtException', (err) => log.error('uncaughtException', err));
process.on('unhandledRejection', (reason) => log.error('unhandledRejection', reason));

const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL'];

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  if (RENDERER_DEV_URL && !app.isPackaged) return url.startsWith(RENDERER_DEV_URL);
  return url.startsWith('file://');
}

/** Register a channel that only the app's own window may call. */
function handle<A extends unknown[], R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => R,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
    return fn(event, ...(args as A));
  });
}

function registerIpc(): void {
  handle(IPC.appInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    eventsDir: eventsDir(),
  }));
  handle(IPC.recentEvents, () => eventHandlers.recent());
  handle(IPC.createEvent, (_e, setup: Parameters<typeof eventHandlers.create>[0]) =>
    eventHandlers.create(setup),
  );
  handle(IPC.openEventFile, (e) => eventHandlers.openFile(BrowserWindow.fromWebContents(e.sender)));
  handle(IPC.openRecentEvent, (_e, folder: string) => eventHandlers.openRecent(folder));
  handle(IPC.forgetEvent, (_e, folder: string) => eventHandlers.forget(folder));
  handle(IPC.currentEvent, () => eventHandlers.current());
  handle(IPC.updateSetup, (_e, setup: Parameters<typeof eventHandlers.updateSetup>[0]) =>
    eventHandlers.updateSetup(setup),
  );
  handle(IPC.closeEvent, () => eventHandlers.close());
  handle(IPC.riders, () => eventHandlers.riders());
  handle(
    IPC.updateRider,
    (_e, number: number, change: Parameters<typeof eventHandlers.updateRider>[1]) =>
      eventHandlers.updateRider(number, change),
  );
  handle(IPC.chooseEntryList, (e) =>
    eventHandlers.chooseEntryList(BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.importRiders, (_e, choices: Parameters<typeof eventHandlers.importRiders>[0]) =>
    eventHandlers.importRiders(choices),
  );
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'tScore',
    // An installed copy takes its icon from tScore.exe; this covers running from source.
    ...(!app.isPackaged && { icon: join(__dirname, '../../build/icon.ico') }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // No remote content: external links open in the user's browser, never in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = RENDERER_DEV_URL && !app.isPackaged ? RENDERER_DEV_URL : 'file://';
    if (!url.startsWith(allowed)) event.preventDefault();
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('render-process-gone', details);
    if (details.reason !== 'clean-exit') win.reload();
  });

  if (RENDERER_DEV_URL && !app.isPackaged) {
    void win.loadURL(RENDERER_DEV_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    registerIpc();
    createWindow();
    checkForUpdatesWhenSafe();
  });

  app.on('window-all-closed', () => app.quit());
  // Close the event file cleanly. (A crash is safe too: every save is already committed.)
  app.on('will-quit', () => closeEvents());
}
