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
  type SeriesSameRider,
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
import { coreT, pageLanguage, t } from './i18n';

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
  if (r.state === 'provisional') return t('series.stateProvisional');
  if (r.state === 'reopened') return t('series.stateReopened');
  if (r.state === 'missing') return t('series.stateMissing');
  if (r.state === 'unreadable') return t('series.stateUnreadable');
  return '';
}

function build(setup: SeriesSetup, juniorInitials: boolean) {
  const rounds = orderedRounds(setup);
  // Licence numbers go in only to match riders across rounds (#125); they never come out.
  const final = rounds.flatMap((r, i) =>
    r.results
      ? [{ round: i + 1, results: r.results, ...(r.licences && { licences: r.licences }) }]
      : [],
  );
  const tally = computeSeries(
    final,
    setup.rules,
    {
      ...(juniorInitials && {
        juniorSurnameInitialClasses: [...new Set(rounds.flatMap((r) => r.juniorClasses))],
      }),
    },
    setup.sameRider ?? [],
  );
  // The tally has a column per counted round; label them with their round number.
  const labels = rounds.flatMap((r, i) =>
    r.results
      ? [
          r.date
            ? t('series.roundLabelDate', { round: i + 1, date: shortDate(r.date) })
            : t('series.roundLabel', { round: i + 1 }),
        ]
      : [],
  );
  const notCounted = rounds
    .map((r, i) =>
      r.state === 'final'
        ? ''
        : t('series.notCountedRound', {
            round: i + 1,
            name: r.name || r.folder,
            state: stateWords(r),
          }),
    )
    .filter(Boolean);
  return { rounds, tally, labels, notCounted, clubLogo: seriesClubLogo(rounds) };
}

/**
 * The club logo for the series PDF (#111): only when every round that names a club names the
 * same one (a championship across clubs shows none), from the latest round that has it.
 */
function seriesClubLogo(rounds: readonly SeriesRoundInfo[]): string | undefined {
  const clubs = new Set(
    rounds.flatMap((r) => (r.club ? [r.club.trim().replace(/\s+/g, ' ').toLowerCase()] : [])),
  );
  if (clubs.size !== 1) return undefined;
  return rounds.toReversed().find((r) => r.clubLogo)?.clubLogo;
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
  if (!found)
    throw new StoreError('APP_NO_SERIES', "That series isn't on this laptop any more.", {
      key: 'errors.APP_NO_SERIES',
    });
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
  if (!found)
    throw new StoreError('APP_NO_SERIES', "That series isn't on this laptop any more.", {
      key: 'errors.APP_NO_SERIES',
    });
  return found.setup;
}

export function updateSeries(
  eventsDir: string,
  file: string,
  change: {
    name?: string;
    rules?: SeriesRules;
    addRound?: string;
    removeRound?: string;
    sameRider?: SeriesSameRider;
    notSameRider?: SeriesSameRider;
  },
): void {
  const setup = setupOf(eventsDir, file);
  const rounds = setup.rounds.filter((f) => f !== change.removeRound);
  if (change.addRound && !rounds.includes(change.addRound)) rounds.push(change.addRound);
  const same = (a: SeriesSameRider) => (b: SeriesSameRider) =>
    a.class === b.class && a.key === b.key;
  let sameRider = (setup.sameRider ?? []).filter(
    (s) => !change.notSameRider || !same(change.notSameRider)(s),
  );
  if (change.sameRider && !sameRider.some(same(change.sameRider))) {
    sameRider = [...sameRider, { class: change.sameRider.class, key: change.sameRider.key }];
  }
  saveSeries(
    eventsDir,
    {
      schema: setup.schema,
      name: change.name ?? setup.name,
      rules: change.rules ?? setup.rules,
      rounds,
      ...(sameRider.length > 0 && { sameRider }),
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
    title: kind === 'pdf' ? t('dialog.seriesPdf') : t('dialog.seriesCsv'),
    defaultPath: join(
      app.getPath('documents'),
      `${setup.name.replace(/[<>:"/\\|?*]/g, '')} points.${kind}`,
    ),
    filters:
      kind === 'pdf'
        ? [{ name: t('dialog.pdf'), extensions: ['pdf'] }]
        : [{ name: t('dialog.csv'), extensions: ['csv'] }],
  };
  const picked = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (picked.canceled || !picked.filePath) return null;
  const { tally, labels, notCounted, clubLogo } = build(setup, juniorInitials);
  const opts = {
    name: setup.name,
    roundLabels: labels,
    rules: setup.rules,
    footer: t('dialog.produced', {
      version: app.getVersion(),
      when: new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }),
    }),
    ...(notCounted.length && {
      notCounted: t('series.notCountedYet', { rounds: notCounted.join('; ') }),
    }),
    t: coreT,
    lang: pageLanguage(),
    ...(clubLogo && { clubLogo }),
  };
  if (kind === 'csv') writeFileSync(picked.filePath, seriesCsv(tally, opts), 'utf8');
  else writeFileSync(picked.filePath, await pdfOf(seriesHtml(tally, opts)));
  rememberExport(picked.filePath);
  return picked.filePath;
}
