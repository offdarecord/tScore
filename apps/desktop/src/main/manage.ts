/**
 * Manage events (#92): every event folder on this laptop with the space it uses, and tidying up
 * old ones: shrink their card photos to small copies, or delete the whole event to the Recycle
 * Bin. The open event is never touched. Logs carry event codes and sizes, never names.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, nativeImage, shell } from 'electron';
import { EVENT_FILE, MOVE_EXTENSION, type ManagedEvent } from '@tscore/store';
import type { ManageView, ManagedEventInfo, Outcome } from '../shared/ipc';
import { secondPlace } from './backups';
import { attempt, attemptAsync, events } from './events';
import { t } from './i18n';
import log from 'electron-log/main';

/** Small copies kept after removing scans: enough to see a questioned card. */
const SMALL_WIDTH = 360;
const SMALL_QUALITY = 60;

/** Shrink a card photo to a small JPEG copy, or return it empty if it can't be read. */
export function smallCopy(photo: Uint8Array): Uint8Array {
  const image = nativeImage.createFromBuffer(Buffer.from(photo));
  if (image.isEmpty()) return new Uint8Array();
  const { width } = image.getSize();
  const small = width > SMALL_WIDTH ? image.resize({ width: SMALL_WIDTH, quality: 'good' }) : image;
  return small.toJPEG(SMALL_QUALITY);
}

/** When the event's newest backup reached the second place (USB), if it's plugged in. */
function lastSecondCopy(folder: string): string | undefined {
  const place = secondPlace();
  if (!place) return undefined;
  const dir = join(place, 'tScore backups', basename(folder));
  if (!existsSync(dir)) return undefined;
  let newest = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.sqlite')) continue;
    const t = statSync(join(dir, f), { throwIfNoEntry: false })?.mtimeMs ?? 0;
    if (t > newest) newest = t;
  }
  return newest ? new Date(newest).toISOString() : undefined;
}

function info(e: ManagedEvent, keep: ReadonlySet<string>): ManagedEventInfo {
  const lib = events();
  const copy = lastSecondCopy(e.folder);
  return {
    ...e,
    open: lib.isOpen(e.folder),
    keep: keep.has(key(e.folder)),
    ...(copy !== undefined && { lastSecondCopy: copy }),
  };
}

const key = (folder: string) => (process.platform === 'win32' ? folder.toLowerCase() : folder);

export const manageHandlers = {
  list(): Outcome<ManageView> {
    return attempt('listing events', () => {
      const lib = events();
      const prefs = lib.tidyPrefs();
      const keep = new Set(prefs.keep.map(key));
      return {
        events: lib.manageList().map((e) => info(e, keep)),
        ...(prefs.remindAfter !== undefined && { remindAfter: prefs.remindAfter }),
        secondPlaceChosen: secondPlace() !== null,
      };
    });
  },

  removeCardScans(folders: string[]): Outcome<{ images: number; bytesFreed: number }> {
    return attempt('removing card scans', () => {
      if (!Array.isArray(folders)) throw new Error('No events chosen.');
      let images = 0;
      let bytesFreed = 0;
      for (const folder of folders) {
        const r = events().removeCardScans(folder, smallCopy);
        log.info('card scans removed', { folder: basename(folder), ...r });
        images += r.images;
        bytesFreed += r.bytesFreed;
      }
      return { images, bytesFreed };
    });
  },

  /** Each folder with the code typed for it. Moved to the Recycle Bin, never deleted outright. */
  async deleteEvents(
    chosen: { folder: string; code: string }[],
  ): Promise<Outcome<{ deleted: number }>> {
    return attemptAsync('deleting events', async () => {
      if (!Array.isArray(chosen)) throw new Error('No events chosen.');
      const lib = events();
      // Check every one before touching any.
      const checked = chosen.map((c) => lib.checkDelete(c.folder, c.code));
      for (const e of checked) {
        await shell.trashItem(e.folder);
        lib.forget(e.folder);
        log.info('event moved to the Recycle Bin', { folder: basename(e.folder) });
      }
      return { deleted: checked.length };
    });
  },

  async saveCopy(
    folder: string,
    win: BrowserWindow | null,
  ): Promise<Outcome<{ file: string; bytes: number } | null>> {
    const found = events()
      .manageList()
      .find((e) => key(e.folder) === key(String(folder)));
    const options: Electron.SaveDialogOptions = {
      title: t('dialog.saveCopy'),
      defaultPath: join(
        app.getPath('documents'),
        `${found?.firstDate ?? ''} ${found?.code ?? 'event'}.${MOVE_EXTENSION}`.trim(),
      ),
      filters: [{ name: t('dialog.tscoreEvent'), extensions: [MOVE_EXTENSION] }],
    };
    const picked = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { ok: true, value: null };
    const file = picked.filePath;
    return attempt('saving a copy of the event', () => {
      const saved = events().saveCopyOf(folder, file);
      log.info('event copy saved before tidying', { folder: basename(folder), bytes: saved.bytes });
      return { file, bytes: saved.bytes };
    });
  },

  showInFolder(folder: string): void {
    const found = events()
      .manageList()
      .find((e) => key(e.folder) === key(String(folder)));
    if (found) shell.showItemInFolder(join(found.folder, EVENT_FILE));
  },

  keep(folder: string): Outcome<ManageView> {
    const r = attempt('keeping the event', () => events().keepEvent(folder));
    return r.ok ? this.list() : r;
  },

  remindLater(): Outcome<ManageView> {
    const r = attempt('setting a reminder', () => events().remindLater(30));
    return r.ok ? this.list() : r;
  },
};
