/**
 * The big screen (live scores): a second window, full screen on the external monitor (HDMI) if
 * one is plugged in, otherwise an ordinary window the desk can drag there. It has no controls:
 * it shows the open event's results and refreshes itself. Esc closes it; F11 or a double-click
 * toggles full screen.
 *
 * Same renderer and preload as the desk window, opened at `#live`, so it can't disagree with
 * the Results screen or the PDF.
 */
import { join } from 'node:path';
import { app, BrowserWindow, screen, shell } from 'electron';
import type { LiveWindowState } from '../shared/ipc';

let live: BrowserWindow | null = null;
let onSecondScreen = false;

export function liveWindowState(): LiveWindowState {
  return { open: live !== null && !live.isDestroyed(), secondScreen: onSecondScreen };
}

export function showLiveWindow(desk: BrowserWindow | null, rendererUrl: string | undefined) {
  if (live && !live.isDestroyed()) {
    live.show();
    live.focus();
    return liveWindowState();
  }
  const deskDisplay = desk
    ? screen.getDisplayMatching(desk.getBounds())
    : screen.getPrimaryDisplay();
  const other = screen.getAllDisplays().find((d) => d.id !== deskDisplay.id);
  onSecondScreen = other !== undefined;
  const area = (other ?? deskDisplay).workArea;
  live = new BrowserWindow({
    x: area.x + (other ? 0 : 40),
    y: area.y + (other ? 0 : 40),
    width: other ? area.width : Math.min(1280, area.width - 80),
    height: other ? area.height : Math.min(720, area.height - 80),
    fullscreen: onSecondScreen,
    title: 'tScore live scores',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    ...(!app.isPackaged && { icon: join(__dirname, '../../build/icon.ico') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  live.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  live.webContents.on('will-navigate', (event) => event.preventDefault());
  live.on('closed', () => {
    live = null;
    onSecondScreen = false;
  });
  if (rendererUrl && !app.isPackaged) void live.loadURL(`${rendererUrl}#live`);
  else void live.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'live' });
  return liveWindowState();
}

export function closeLiveWindow(): LiveWindowState {
  if (live && !live.isDestroyed()) live.close();
  live = null;
  onSecondScreen = false;
  return liveWindowState();
}

/** Toggle full screen (for the page's double-click). */
export function toggleLiveFullScreen(): void {
  if (live && !live.isDestroyed()) live.setFullScreen(!live.isFullScreen());
}
