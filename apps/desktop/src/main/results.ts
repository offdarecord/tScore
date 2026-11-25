/**
 * Results in the main process: worked out from the event as saved (never from the window), and
 * saved as a PDF or CSV where the desk chooses.
 *
 * On this laptop results show full names. Anything saved to share (PDF, CSV) applies the
 * publish rules: non-competitive riders' scores are already left out of the payload, and junior
 * surnames become an initial when the desk ticks that option.
 *
 * Marking results final freezes them as a numbered revision. While final, nothing that affects
 * them can change (the store refuses), so a saved file recomputed from the event is exactly the
 * revision declared. Reopening needs a reason; marking final again makes the next revision.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeResults,
  juniorClassesFromSetup,
  placeChanges,
  resultsCsv,
  resultsHtml,
  type Results,
  type ResultsGap,
  type RevisionNote,
} from '@tscore/core';
import { StoreError, type EventStore } from '@tscore/store';
import { app, BrowserWindow, dialog, shell } from 'electron';
import type { ExportKind, LiveScores, ResultsView } from '../shared/ipc';

/** The last file saved, the only one "Open" may open. */
let lastExport: string | null = null;

/** Final and not reopened: the revision in force. */
function inForce(store: EventStore) {
  const state = store.finalState();
  return state && !state.reopened ? state : null;
}

function report(store: EventStore, juniorInitials: boolean) {
  const setup = store.setup;
  const final = inForce(store);
  return computeResults(store.resultsInput(), {
    generator: { name: 'tScore', version: app.getVersion() },
    generatedAt: final ? final.markedAt : new Date().toISOString(),
    status: final ? 'final' : 'provisional',
    revision: final ? final.revision : store.nextRevision(),
    ...(juniorInitials && {
      privacy: { juniorSurnameInitialClasses: juniorClassesFromSetup(setup) },
    }),
  });
}

const timeWords = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

/** For a revision after the first: what it replaces, why, and which places changed. */
function revisionNote(store: EventStore, revision: number): RevisionNote | undefined {
  if (revision < 2) return undefined;
  const replaced = store.finalHistory().find((f) => f.revision === revision - 1);
  if (!replaced) return undefined;
  const before = store.finalResults(revision - 1) as Results;
  const after =
    inForce(store)?.revision === revision
      ? (store.finalResults(revision) as Results)
      : report(store, false).results;
  return {
    replaces: replaced.revision,
    replacedAt: timeWords(replaced.markedAt),
    reason: replaced.reopenReason ?? '',
    changes: placeChanges(before, after),
  };
}

export function resultsView(store: EventStore): ResultsView {
  const { results, gaps } = report(store, false);
  const state = store.finalState();
  const next = store.nextRevision();
  const note = state?.reopened ? revisionNote(store, next) : undefined;
  return {
    results,
    gaps: gaps.map((g: ResultsGap) => ({ ...g })),
    juniorClasses: juniorClassesFromSetup(store.setup),
    ...(state && {
      final: {
        revision: state.revision,
        markedAt: state.markedAt,
        reopened: state.reopened,
        ...(state.reopenReason !== undefined && { reopenReason: state.reopenReason }),
      },
    }),
    nextRevision: next,
    ...(note && { changes: note.changes }),
  };
}

/** The event's logos as data URIs, for the PDF and the big screen. */
export function logoUris(store: EventStore): { event?: string; sponsors: string[] } {
  const uri = (id: string, mime: string) => {
    const data = store.logoData(id);
    return data ? `data:${mime};base64,${Buffer.from(data).toString('base64')}` : undefined;
  };
  const all = store.logos();
  const event = all.find((l) => l.role === 'event');
  const eventUri = event && uri(event.id, event.mime);
  return {
    ...(eventUri && { event: eventUri }),
    sponsors: all.flatMap((l) => {
      const u = l.role === 'sponsor' ? uri(l.id, l.mime) : undefined;
      return u ? [u] : [];
    }),
  };
}

/**
 * For the big screen, which is public: built from the same payload as the PDF, with the
 * publish rules always applied (junior surnames as an initial; NC scores already left out).
 */
export function liveScores(store: EventStore): LiveScores {
  const { results, gaps } = report(store, true);
  const missing = gaps.filter((g) => g.kind === 'missing_card');
  return {
    results,
    missingCards: new Set(missing.map((g) => `${g.number}/${g.day}/${g.lap}`)).size,
    logos: logoUris(store),
  };
}

/** Freeze the results as the next revision. Every expected card must be in. */
export function markFinal(store: EventStore): void {
  const revision = store.nextRevision();
  const { results, gaps } = computeResults(store.resultsInput(), {
    generator: { name: 'tScore', version: app.getVersion() },
    generatedAt: new Date().toISOString(),
    status: 'final',
    revision,
  });
  if (gaps.length > 0) {
    throw new StoreError(
      'APP_RESULTS_INCOMPLETE',
      'Results can be marked final once every expected card is in and every score decided.',
    );
  }
  if (results.classes.every((c) => c.entries.length === 0)) {
    throw new StoreError('APP_RESULTS_INCOMPLETE', 'There are no results to mark final yet.');
  }
  store.markFinal(revision, results);
}

const dateWords = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(Date.parse(`${iso}T00:00:00Z`))
    .replace(/,/g, '');

/** A safe file name: "DEMO1 results 2027-02-06.pdf", or "DEMO1 results FINAL rev 2 …". */
function fileName(store: EventStore, kind: ExportKind): string {
  const date = store.setup.days[0]?.date ?? '';
  const final = inForce(store);
  const status = final ? ` FINAL${final.revision > 1 ? ` rev ${final.revision}` : ''}` : '';
  const base = `${store.setup.event.code} results${status}${date ? ` ${date}` : ''}`;
  return `${base.replace(/[<>:"/\\|?*]/g, '')}.${kind}`;
}

export async function pdfOf(html: string): Promise<Buffer> {
  // A hidden window with no scripts, no preload and no network: it only lays out the page.
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true },
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await win.loadURL(
      `data:text/html;charset=utf-8;base64,${Buffer.from(html).toString('base64')}`,
    );
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } finally {
    win.destroy();
  }
}

/** Ask where to save, then write the file. `null` if the desk cancels. */
export async function exportResults(
  store: EventStore,
  kind: ExportKind,
  juniorInitials: boolean,
  win: BrowserWindow | null,
): Promise<string | null> {
  if (kind !== 'pdf' && kind !== 'csv') {
    throw new StoreError('APP_BAD_REQUEST', 'Choose PDF or CSV.');
  }
  const options: Electron.SaveDialogOptions = {
    title: kind === 'pdf' ? 'Save results as PDF' : 'Save results as CSV',
    defaultPath: join(store.folder, 'exports', fileName(store, kind)),
    filters:
      kind === 'pdf'
        ? [{ name: 'PDF', extensions: ['pdf'] }]
        : [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  };
  const picked = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (picked.canceled || !picked.filePath) return null;

  const { results, gaps } = report(store, juniorInitials === true);
  if (kind === 'csv') {
    writeFileSync(picked.filePath, resultsCsv(results), 'utf8');
  } else {
    const final = inForce(store);
    const note = final ? revisionNote(store, final.revision) : undefined;
    const html = resultsHtml(results, {
      gaps,
      dates: store.setup.days.flatMap((d) => (d.date ? [dateWords(d.date)] : [])).join(' – '),
      footer: `Produced by tScore ${app.getVersion()} on ${new Date().toLocaleString('en-AU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}.${final ? ` Marked final ${timeWords(final.markedAt)}.` : ''}`,
      ...(note && { revisionNote: note }),
      logos: logoUris(store),
    });
    writeFileSync(picked.filePath, await pdfOf(html));
  }
  lastExport = picked.filePath;
  return picked.filePath;
}

/** Note a file just saved elsewhere (e.g. card labels), so "Open" opens it. */
export function rememberExport(path: string): void {
  lastExport = path;
}

/** Open the file just saved, in its usual program (e.g. the PDF viewer). */
export async function openLastExport(): Promise<void> {
  if (lastExport) {
    const problem = await shell.openPath(lastExport);
    if (problem) throw new StoreError('APP_OPEN_FAILED', `Couldn't open the file: ${problem}`);
  }
}
