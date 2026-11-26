/**
 * Card types on this laptop (issue #108): the built-in ones, plus any imported from a
 * `.tscore-card` file. Sharing saves a file and opens the person's own mail app: nothing is
 * ever sent from tScore itself (venues are offline; the same pattern as Suggest a feature).
 */
import { basename, join } from 'node:path';
import {
  CARD_SHARE_EXTENSION,
  CONTACT,
  cardShareFileName,
  cardShareMailto,
  type CardCredit,
  type CardProfile,
} from '@tscore/core';
import { CardProfileShelf } from '@tscore/store';
import { app, clipboard, dialog, shell, type BrowserWindow } from 'electron';
import type { BlankImageView, CardProfileInfo, CardShareSaved, Outcome } from '../shared/ipc';
import { attempt, attemptAsync } from './events';
import { t } from './i18n';

let shelf: CardProfileShelf | null = null;

/** The card profiles this laptop knows, kept in the app settings folder. */
export function cardProfileShelf(): CardProfileShelf {
  shelf ??= new CardProfileShelf(app.getPath('userData'));
  return shelf;
}

/**
 * Files saved to share this session, with the profile as it went in: the only files the email
 * and "Show the file" will name.
 */
const saved = new Map<string, CardProfile>();

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** Only the credit's two short lines, whatever the renderer sends. */
function creditOf(data: unknown): CardCredit {
  const c = (data ?? {}) as Record<string, unknown>;
  return {
    ...(isText(c['club'], 200) && { club: c['club'] }),
    ...(isText(c['state'], 200) && { state: c['state'] }),
  };
}

function open(win: BrowserWindow | null, options: Electron.OpenDialogOptions) {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

function save(win: BrowserWindow | null, options: Electron.SaveDialogOptions) {
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options);
}

const filters = () => [{ name: t('dialog.tscoreCard'), extensions: [CARD_SHARE_EXTENSION] }];

export const cardProfileHandlers = {
  list(): Outcome<CardProfileInfo[]> {
    return attempt('list card types', () => cardProfileShelf().list());
  },

  image(id: unknown): Outcome<BlankImageView | null> {
    return attempt('show a blank card', () => {
      if (!isText(id, 60)) return null;
      const image = cardProfileShelf().blankImage(id);
      if (!image) return null;
      const mime = image.type === 'png' ? 'image/png' : 'image/jpeg';
      return {
        type: image.type,
        url: `data:${mime};base64,${Buffer.from(image.bytes).toString('base64')}`,
      };
    });
  },

  async import(win: BrowserWindow | null) {
    return attemptAsync('import a card type', async () => {
      const picked = await open(win, {
        title: t('dialog.importCardProfile'),
        defaultPath: app.getPath('downloads'),
        properties: ['openFile'],
        filters: filters(),
      });
      const file = picked.filePaths[0];
      if (picked.canceled || !file) return null;
      return cardProfileShelf().importFile(file);
    });
  },

  /**
   * Keep a card type taught with the wizard (#107), by the same path as an imported one: checked,
   * made `assisted`, with its blank card's picture beside it.
   */
  teach(profile: unknown, blank: unknown) {
    return attempt('keep a taught card type', () => {
      const bytes = blank instanceof Uint8Array ? blank : null;
      return cardProfileShelf().save(profile, bytes && { type: 'png', bytes });
    });
  },

  async save(
    id: unknown,
    credit: unknown,
    win: BrowserWindow | null,
  ): Promise<Outcome<CardShareSaved | null>> {
    return attemptAsync('share a card type', async () => {
      const known = isText(id, 60) ? cardProfileShelf().get(id) : undefined;
      if (!known) return null;
      const fileName = cardShareFileName(known.profile);
      const picked = await save(win, {
        title: t('dialog.shareCardProfile'),
        defaultPath: join(app.getPath('documents'), fileName),
        filters: filters(),
      });
      if (picked.canceled || !picked.filePath) return null;
      const shared = cardProfileShelf().exportFile(
        known.profile.id,
        picked.filePath,
        creditOf(credit),
      );
      saved.set(picked.filePath, shared);
      return { file: picked.filePath, fileName: basename(picked.filePath) };
    });
  },

  async email(file: unknown): Promise<Outcome<void>> {
    return attemptAsync('email a card type', async () => {
      if (!isText(file, 4096)) return;
      const shared = saved.get(file);
      if (!shared) return;
      await shell.openExternal(cardShareMailto(shared, basename(file), app.getVersion()));
    });
  },

  show(file: unknown): Outcome<void> {
    return attempt('show a shared card type', () => {
      if (isText(file, 4096) && saved.has(file)) shell.showItemInFolder(file);
    });
  },

  copyAddress(): Outcome<string> {
    clipboard.writeText(CONTACT.email);
    return { ok: true, value: CONTACT.email };
  },
};
