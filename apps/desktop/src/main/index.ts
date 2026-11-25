import os from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import log from 'electron-log/main';
import {
  IPC,
  type AppInfo,
  type ExportKind,
  type LabelOffset,
  type LabelRequest,
  type SeriesChange,
  type DecideScores,
  type SaveScan,
} from '../shared/ipc';
import { startBackups } from './backups';
import { closeEvents, currentStore, eventHandlers, eventsDir } from './events';
import { closeLiveWindow, liveWindowState, showLiveWindow, toggleLiveFullScreen } from './live';
import { startLogging } from './logging';
import { copySuggestion, emailSuggestion, saveSuggestion } from './suggestion';
import { manageHandlers } from './manage';
import { checkForUpdatesWhenSafe } from './updates';

// Automated tests run the app with its own data folder, so they never touch (or get blocked by)
// a real copy of tScore open on the same machine. Must happen before anything uses userData.
const testUserData = process.env['TSCORE_TEST_USER_DATA'];
if (testUserData && !app.isPackaged) app.setPath('userData', testUserData);

const logging = startLogging();
log.info('tScore starting', { version: app.getVersion() });
if (logging.problem) {
  log.warn('the usual log file could not be written, so this session logs here', logging);
}

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
    os: `${os.version()} (${os.release()})`,
    eventsDir: eventsDir(),
  }));
  handle(IPC.emailSuggestion, (_e, text: string) => emailSuggestion(text));
  handle(IPC.copySuggestion, (_e, text: string) => copySuggestion(text));
  handle(IPC.saveSuggestion, (e, text: string) =>
    saveSuggestion(text, BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.recentEvents, () => eventHandlers.recent());
  handle(IPC.listSeries, () => eventHandlers.listSeries());
  handle(IPC.newSeries, (_e, name: string) => eventHandlers.newSeries(name));
  handle(IPC.seriesView, (_e, file: string) => eventHandlers.seriesView(file));
  handle(IPC.updateSeries, (_e, file: string, change: SeriesChange) =>
    eventHandlers.updateSeries(file, change),
  );
  handle(IPC.addSeriesRoundFile, (e, file: string) =>
    eventHandlers.addSeriesRoundFile(file, BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.deleteSeries, (_e, file: string) => eventHandlers.deleteSeries(file));
  handle(IPC.exportSeries, (e, file: string, kind: ExportKind, initials: boolean) =>
    eventHandlers.exportSeries(file, kind, initials, BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.createEvent, (_e, setup: Parameters<typeof eventHandlers.create>[0]) =>
    eventHandlers.create(setup),
  );
  handle(IPC.openEventFile, (e) => eventHandlers.openFile(BrowserWindow.fromWebContents(e.sender)));
  handle(IPC.openRecentEvent, (_e, folder: string) => eventHandlers.openRecent(folder));
  handle(IPC.forgetEvent, (_e, folder: string) => eventHandlers.forget(folder));
  handle(IPC.manageEvents, () => manageHandlers.list());
  handle(IPC.removeCardScans, (_e, folders: string[]) => manageHandlers.removeCardScans(folders));
  handle(IPC.deleteEvents, (_e, chosen: { folder: string; code: string }[]) =>
    manageHandlers.deleteEvents(chosen),
  );
  handle(IPC.saveEventCopy, (e, folder: string) =>
    manageHandlers.saveCopy(folder, BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.showEventFolder, (_e, folder: string) => manageHandlers.showInFolder(folder));
  handle(IPC.keepEvent, (_e, folder: string) => manageHandlers.keep(folder));
  handle(IPC.remindTidyLater, () => manageHandlers.remindLater());
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
  handle(IPC.addLateEntry, (_e, rider: Parameters<typeof eventHandlers.addLateEntry>[0]) =>
    eventHandlers.addLateEntry(rider),
  );
  handle(IPC.chooseEntryList, (e) =>
    eventHandlers.chooseEntryList(BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.importRiders, (_e, choices: Parameters<typeof eventHandlers.importRiders>[0]) =>
    eventHandlers.importRiders(choices),
  );
  handle(IPC.cardDesk, () => eventHandlers.cardDesk());
  handle(IPC.saveCard, (_e, card: Parameters<typeof eventHandlers.saveCard>[0]) =>
    eventHandlers.saveCard(card),
  );
  handle(IPC.saveScan, (_e, scan: SaveScan) => eventHandlers.saveScan(scan));
  handle(IPC.reviewQueue, () => eventHandlers.reviewQueue());
  handle(IPC.cardImage, (_e, path: string) => eventHandlers.cardImage(path));
  handle(IPC.decideScores, (_e, d: DecideScores) => eventHandlers.decideScores(d));
  handle(IPC.addPenalty, (_e, penalty: Parameters<typeof eventHandlers.addPenalty>[0]) =>
    eventHandlers.addPenalty(penalty),
  );
  handle(IPC.removePenalty, (_e, id: string) => eventHandlers.removePenalty(id));
  handle(IPC.results, () => eventHandlers.results());
  handle(IPC.exportResults, (e, kind: ExportKind, juniorInitials: boolean) =>
    eventHandlers.exportResults(kind, juniorInitials, BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.openExport, () => eventHandlers.openExport());
  handle(IPC.backupStatus, () => eventHandlers.backupStatus());
  handle(IPC.backupNow, () => eventHandlers.backupNow());
  handle(IPC.chooseBackupPlace, (e) =>
    eventHandlers.chooseBackupPlace(BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.clearBackupPlace, () => eventHandlers.clearBackupPlace());
  handle(IPC.preEventCheck, () => eventHandlers.preEventCheck());
  handle(IPC.restoreFromBackup, (e) =>
    eventHandlers.restoreFromBackup(BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.saveForMove, (e) =>
    eventHandlers.saveForMove(BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.markFinal, () => eventHandlers.markFinal());
  handle(IPC.reopenResults, (_e, reason: string) => eventHandlers.reopenResults(reason));
  handle(IPC.labels, (_e, request: LabelRequest) => eventHandlers.labels(request));
  handle(IPC.saveLabels, (e, request: LabelRequest) =>
    eventHandlers.saveLabels(request, BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.saveLabelTestPage, (e) =>
    eventHandlers.saveLabelTestPage(BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.setLabelOffset, (_e, offset: LabelOffset) => eventHandlers.setLabelOffset(offset));
  handle(IPC.course, (_e, day?: number) => eventHandlers.course(day));
  handle(IPC.liveScores, () => eventHandlers.liveScores());
  handle(IPC.logos, () => eventHandlers.logos());
  handle(IPC.chooseLogo, (e, role: 'event' | 'sponsor') =>
    eventHandlers.chooseLogo(role, BrowserWindow.fromWebContents(e.sender)),
  );
  handle(IPC.removeLogo, (_e, id: string) => eventHandlers.removeLogo(id));
  handle(IPC.showLiveScores, () => showLiveWindow(desk, RENDERER_DEV_URL));
  handle(IPC.closeLiveScores, () => closeLiveWindow());
  handle(IPC.liveWindowState, () => liveWindowState());
  handle(IPC.toggleLiveFullScreen, () => toggleLiveFullScreen());
}

/** The desk window (the big screen is another window, see live.ts). */
let desk: BrowserWindow | null = null;

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

  desk = win;
  win.once('ready-to-show', () => win.show());
  // The big screen goes when the desk does, so closing the desk still quits tScore.
  win.on('closed', () => {
    desk = null;
    closeLiveWindow();
  });

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
    const win = desk;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    registerIpc();
    startBackups(currentStore);
    createWindow();
    checkForUpdatesWhenSafe();
  });

  app.on('window-all-closed', () => app.quit());
  // Close the event file cleanly. (A crash is safe too: every save is already committed.)
  app.on('will-quit', () => closeEvents());
}
