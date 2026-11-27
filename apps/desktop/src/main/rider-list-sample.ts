/**
 * The sample tScore rider list (#139), so a club can make one with no internet. It's bundled
 * from the website's own copy, `site/tscore-rider-list-sample.csv`: there is no second copy.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicErrorCode } from '@tscore/core';
import { app, dialog, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import sample from '../../../../site/tscore-rider-list-sample.csv?raw';
import type { Outcome } from '../shared/ipc';
import { t } from './i18n';

/** Shows the save dialog, then saves the sample. The saved path, or null if cancelled. */
export async function saveSampleRiderList(
  win: BrowserWindow | null,
): Promise<Outcome<string | null>> {
  const options: Electron.SaveDialogOptions = {
    title: t('dialog.saveSampleRiderList'),
    defaultPath: join(app.getPath('documents'), 'tscore-rider-list-sample.csv'),
    filters: [{ name: t('dialog.csv'), extensions: ['csv'] }],
  };
  const picked = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (picked.canceled || !picked.filePath) return { ok: true, value: null };
  try {
    // As it is, byte for byte: UTF-8 with its byte-order mark, so Excel reads it as UTF-8.
    writeFileSync(picked.filePath, sample, 'utf8');
  } catch (err) {
    log.warn('saving the sample rider list failed', err);
    return {
      ok: false,
      error: {
        code: publicErrorCode('APP_SAVE_FAILED'),
        message: t('errors.APP_SAVE_FAILED', { problem: (err as Error).message }),
      },
    };
  }
  log.info('sample rider list saved');
  return { ok: true, value: picked.filePath };
}
