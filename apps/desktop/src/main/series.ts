/**
 * Series points (issue #14) in the main process. A series is a small file listing its rounds
 * (event folders) and rules; each round is read from its event file, read-only. Only rounds
 * whose results are final count.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeSeries,
  DEFAULT_SERIES_POINTS,
  seriesCsv,
  seriesHtml,
  type SeriesRules,
} from '@tscore/core';
import {
  deleteSeries,
  listSeries,
  readSeriesRound,
  saveSeries,
  SERIES_FORMAT,
  StoreError,
  type SeriesRoundInfo,
  type SeriesSetup,
} from '@tscore/store';
import { app, dialog, type BrowserWindow } from 'electron';
import type { SeriesSummary, SeriesView } from '../shared/ipc';
import { pdfOf, rememberExport } from './results';

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/** Rounds by date (undated last, in the order added). */
function orderedRounds(setup: SeriesSetup): SeriesRoundInfo[] {
  return setup.rounds
    .map(readSeriesRound)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.date ?? '9999').localeCompare(b.r.date ?? '9999') || a.i - b.i)
    .map(({ r }) => r);
}

function stateWords(r: SeriesRoundInfo): string {
  if (r.state === 'provisional') return 'results not final yet';
  if (r.state === 'reopened') return 'results reopened for a correction';
  if (r.state === 'missing') return "event not found (moved, or on a USB stick that isn't in)";
  if (r.state === 'unreadable') return "event file can't be read";
  return '';
}

function build(setup: SeriesSetup, juniorInitials: boolean) {
  const rounds = orderedRounds(setup);
  const final = rounds.flatMap((r, i) => (r.results ? [{ round: i + 1, results: r.results }] : []));
  const tally = computeSeries(final, setup.rules, {
    ...(juniorInitials && {
      juniorSurnameInitialClasses: [...new Set(rounds.flatMap((r) => r.juniorClasses))],
    }),
  });
  // The tally has a column per counted round; label them with their round number.
  const labels = rounds.flatMap((r, i) =>
    r.results ? [`Rd ${i + 1}${r.date ? ` (${shortDate(r.date)})` : ''}`] : [],
  );
  const notCounted = rounds
    .map((r, i) =>
      r.state === 'final' ? '' : `Round ${i + 1} (${r.name || r.folder}): ${stateWords(r)}`,
    )
    .filter(Boolean);
  return { rounds, tally, labels, notCounted };
}

export function seriesSummaries(eventsDir: string): SeriesSummary[] {
  return listSeries(eventsDir).map(({ file, setup }) => ({
    file,
    name: setup.name,
    rounds: setup.rounds.length,
  }));
}

export function seriesView(eventsDir: string, file: string): SeriesView {
  const found = listSeries(eventsDir).find((s) => s.file === file);
  if (!found) throw new StoreError('APP_NO_SERIES', "That series isn't on this laptop any more.");
  const { rounds, tally, labels, notCounted } = build(found.setup, false);
  return {
    file,
    name: found.setup.name,
    rules: found.setup.rules,
    rounds: rounds.map((r, i) => ({
      round: i + 1,
      folder: r.folder,
      name: r.name,
      code: r.code,
      ...(r.date !== undefined && { date: r.date }),
      state: r.state,
      ...(r.revision !== undefined && { revision: r.revision }),
    })),
    roundLabels: labels,
    tally,
    notCounted,
  };
}

export function newSeries(eventsDir: string, name: string): string {
  const rules: SeriesRules = { points: DEFAULT_SERIES_POINTS, ties: 'share' };
  return saveSeries(eventsDir, { schema: SERIES_FORMAT, name, rounds: [], rules });
}

function setupOf(eventsDir: string, file: string): SeriesSetup {
  const found = listSeries(eventsDir).find((s) => s.file === file);
  if (!found) throw new StoreError('APP_NO_SERIES', "That series isn't on this laptop any more.");
  return found.setup;
}

export function updateSeries(
  eventsDir: string,
  file: string,
  change: { name?: string; rules?: SeriesRules; addRound?: string; removeRound?: string },
): void {
  const setup = setupOf(eventsDir, file);
  const rounds = setup.rounds.filter((f) => f !== change.removeRound);
  if (change.addRound && !rounds.includes(change.addRound)) rounds.push(change.addRound);
  saveSeries(
    eventsDir,
    {
      ...setup,
      ...(change.name !== undefined && { name: change.name }),
      ...(change.rules && { rules: change.rules }),
      rounds,
    },
    file,
  );
}

export function removeSeries(eventsDir: string, file: string): void {
  deleteSeries(eventsDir, file);
}

export async function exportSeries(
  eventsDir: string,
  file: string,
  kind: 'pdf' | 'csv',
  juniorInitials: boolean,
  win: BrowserWindow | null,
): Promise<string | null> {
  const setup = setupOf(eventsDir, file);
  const options: Electron.SaveDialogOptions = {
    title: kind === 'pdf' ? 'Save series points as PDF' : 'Save series points as CSV',
    defaultPath: join(
      app.getPath('documents'),
      `${setup.name.replace(/[<>:"/\\|?*]/g, '')} points.${kind}`,
    ),
    filters:
      kind === 'pdf'
        ? [{ name: 'PDF', extensions: ['pdf'] }]
        : [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  };
  const picked = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (picked.canceled || !picked.filePath) return null;
  const { tally, labels, notCounted } = build(setup, juniorInitials);
  const opts = {
    name: setup.name,
    roundLabels: labels,
    rules: setup.rules,
    footer: `Produced by tScore ${app.getVersion()} on ${new Date().toLocaleString('en-AU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })}.`,
    ...(notCounted.length && { notCounted: `Not counted yet: ${notCounted.join('; ')}.` }),
  };
  if (kind === 'csv') writeFileSync(picked.filePath, seriesCsv(tally, opts), 'utf8');
  else writeFileSync(picked.filePath, await pdfOf(seriesHtml(tally, opts)));
  rememberExport(picked.filePath);
  return picked.filePath;
}
