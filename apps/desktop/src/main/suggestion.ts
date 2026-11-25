/**
 * Suggest a feature: getting the text the person wrote out of tScore. Nothing is ever sent
 * from tScore itself: Email opens their own mail app, Copy uses the clipboard, Save writes a
 * file where they choose.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicErrorCode, suggestionMailto } from '@tscore/core';
import log from 'electron-log/main';
import { app, clipboard, dialog, shell, type BrowserWindow } from 'electron';
import type { Outcome, SuggestionSent } from '../shared/ipc';

const isText = (t: unknown): t is string => typeof t === 'string' && t.length < 50_000;

export async function emailSuggestion(text: unknown): Promise<Outcome<SuggestionSent>> {
  if (!isText(text)) return { ok: true, value: { via: 'none' } };
  const link = suggestionMailto(text);
  if (link) {
    await shell.openExternal(link);
    return { ok: true, value: { via: 'email' } };
  }
  // Too long for a mailto link: some mail apps would cut it off.
  clipboard.writeText(text);
  const short = suggestionMailto('The suggestion is on the clipboard: paste it here (Ctrl+V).');
  if (short) await shell.openExternal(short);
  return { ok: true, value: { via: 'email-and-clipboard' } };
}

export function copySuggestion(text: unknown): Outcome<SuggestionSent> {
  if (!isText(text)) return { ok: true, value: { via: 'none' } };
  clipboard.writeText(text);
  return { ok: true, value: { via: 'clipboard' } };
}

export async function saveSuggestion(
  text: unknown,
  win: BrowserWindow | null,
): Promise<Outcome<SuggestionSent>> {
  if (!isText(text)) return { ok: true, value: { via: 'none' } };
  const options: Electron.SaveDialogOptions = {
    title: 'Save the suggestion',
    defaultPath: join(app.getPath('documents'), 'tScore feature suggestion.txt'),
    filters: [{ name: 'Text', extensions: ['txt'] }],
  };
  const picked = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (picked.canceled || !picked.filePath) return { ok: true, value: { via: 'none' } };
  try {
    // Windows line endings, so Notepad on any version shows it properly.
    writeFileSync(picked.filePath, text.replace(/\n/g, '\r\n'), 'utf8');
  } catch (err) {
    log.warn('saving a suggestion failed', err);
    return {
      ok: false,
      error: {
        code: publicErrorCode('APP_SAVE_FAILED'),
        message: `Couldn't save the file: ${(err as Error).message}`,
      },
    };
  }
  return { ok: true, value: { via: 'file', file: picked.filePath } };
}
