import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import log from 'electron-log/main';
import { IPC, type AppInfo } from '../shared/ipc';
import { checkForUpdatesWhenSafe } from './updates';

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

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, (event): AppInfo => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
    return {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
    };
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'tScore',
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
}
