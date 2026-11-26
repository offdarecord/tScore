/**
 * Series points: a tally across the rounds of a series, worked out from each round's final
 * results (`tscore.results/1`), so it's pure and can be golden-tested like round results.
 *
 * Rules seen in past published tallies (issue #14), all settable per series:
 * - round points by place in the class, e.g. 25, 22, 20, 18, 16, 15, 14 … 1;
 * - riders who rode but weren't placed (DNF, No award) get 0 for that round; a round they
 *   didn't ride is blank. Non-competitive riders take no series points and aren't listed;
 * - series total: every round, or the best N rounds;
 * - an equal total shares the place (1, 2, 2, 4), or is split by most round wins, then the
 *   better result in the latest round.
 *
 * One tally per class, matched by class name across rounds. Riders are matched by licence
 * number where the entry has one (#125), otherwise by name (not number, which can change between
 * events); a rider who changes class has a separate line in each class. Licence numbers are used
 * only for matching: they never reach the tally, its checks, the PDF or the CSV.
 */
import type { Results } from './generated/results.js';
import { BOM, csvField, esc, headHtml } from './results/output.js';
import { CREDIT_CSS, creditHtml } from './credit.js';
import { english, type Translate } from './words.js';

type Entry = Results['classes'][number]['entries'][number];

/** The scale most published tallies use: 25, 22, 20, 18, 16, then 15 down to 1. */
export const DEFAULT_SERIES_POINTS: readonly number[] = [
  25, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
];

export interface SeriesRules {
  /** Points for 1st, 2nd, 3rd … Places past the end score 0. */
  readonly points: readonly number[];
  /** Count only the best N rounds; undefined counts every round. */
  readonly bestOf?: number;
  /** `share`: equal totals share a place. `split`: most round wins, then the latest round. */
  readonly ties: 'share' | 'split';
}

export interface SeriesRound {
  /** Round number, from 1, in date order. */
  readonly round: number;
  readonly results: Results;
  /**
   * Licence numbers by rider number, one per rider on the entry (null where it has none), from
   * the round's entry list. Only for matching riders across rounds; never shown or saved.
   */
  readonly licences?: ReadonlyMap<number, readonly (string | null)[]>;
}

export interface SeriesRow {
  /** Display name (as in the latest round ridden). */
  readonly name: string;
  /** Number in the latest round ridden. */
  readonly number: number;
  readonly club?: string;
  /** Points per round, in round order; null = didn't ride that round. */
  readonly rounds: readonly (number | null)[];
  /** Every round added up. */
  readonly total: number;
  /** The best N rounds (equal to `total` when every round counts). */
  readonly counted: number;
  readonly place: number;
  /** True when the place is shared with another rider. */
  readonly shared: boolean;
}

export interface SeriesClass {
  readonly name: string;
  readonly rows: readonly SeriesRow[];
}

/**
 * Something for the series keeper to check in the entry lists (#125), never guessed at:
 * - `licence_names`: one licence number under different names (matched as one rider);
 * - `name_licences`: one name under different licence numbers (kept as separate lines).
 * Names only: never the licence numbers.
 */
export interface SeriesCheck {
  readonly kind: 'licence_names' | 'name_licences';
  readonly class: string;
  /** The names as entered, in round order; for `name_licences`, the one name. */
  readonly names: readonly string[];
}

export interface SeriesTally {
  readonly rounds: number;
  readonly classes: readonly SeriesClass[];
  /** Riders the keeper should check: matching never guesses past these. */
  readonly checks: readonly SeriesCheck[];
}

/** Points for one entry in one round, or null if it isn't in the series. */
export function roundPoints(e: Entry, rules: SeriesRules): number | null {
  if (e.competition_status === 'non_competitive' || e.status === 'dns') return null;
  if (e.competition_status !== 'competitive' || e.status !== 'finished' || e.position === null) {
    return 0;
  }
  return rules.points[e.position - 1] ?? 0;
}

/** How riders are matched across rounds: names, ignoring case, spacing and accents. */
export function riderKey(e: Entry): string {
  return e.riders
    .map((r) =>
      r.name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    )
    .join(' & ');
}

/** A licence number as compared: no spaces, upper case; null if it has no digit ("N/A"). */
function licenceKey(raw: string | null | undefined): string | null {
  const s = raw?.replace(/\s+/g, '').toUpperCase();
  return s && /\d/.test(s) ? s : null;
}

/** The entry's licences, joined: only when every rider on it has one (both of a sidecar pair). */
function entryLicence(
  e: Entry,
  licences: ReadonlyMap<number, readonly (string | null)[]> | undefined,
): string | null {
  const found = licences?.get(e.number);
  if (!found || found.length !== e.riders.length) return null;
  const keys = found.map(licenceKey);
  return keys.every((k) => k !== null) ? keys.join(' & ') : null;
}

const bestSum = (points: readonly (number | null)[], n: number | undefined) => {
  const ridden = points.filter((p): p is number => p !== null).sort((a, b) => b - a);
  return (n === undefined ? ridden : ridden.slice(0, n)).reduce((s, p) => s + p, 0);
};

/** For anything shared: classes whose surnames become an initial (any round's junior classes). */
export interface SeriesPrivacy {
  readonly juniorSurnameInitialClasses?: readonly string[];
}

function displayName(e: Entry, initial: boolean): string {
  return e.riders
    .map((r) =>
      initial && r.given_name !== undefined && r.family_name
        ? `${r.given_name} ${r.family_name.trim().charAt(0).toUpperCase()}.`.trim()
        : r.name,
    )
    .join(' & ');
}

/** One scoring entry in one round, as matched. */
interface Item {
  readonly index: number;
  readonly entry: Entry;
  readonly pts: number;
  /** Every rider's licence, joined, or null when any rider on the entry has none. */
  readonly licence: string | null;
  /** The name key (`riderKey`). */
  readonly key: string;
  /** The name as shown. */
  readonly shown: string;
}

/**
 * One class's entries grouped into riders (#125), each group in round order:
 * 1. entries with licence numbers are one rider per licence (both riders' for a sidecar),
 *    whatever the names;
 * 2. an entry without one joins the licensed rider of the same name, when exactly one has it.
 *    When two licences share the name it isn't guessed, and it matches by name alone;
 * 3. otherwise entries match by name, as before licence numbers were used.
 * A licence under two names, or a name under two licences, goes to `check`.
 */
function matchRiders(
  items: readonly Item[],
  check: (c: Omit<SeriesCheck, 'class'>) => void,
): Item[][] {
  const groups: Item[][] = [];
  const add = (index: Map<string, Item[]>, key: string, item: Item) => {
    let group = index.get(key);
    if (!group) {
      index.set(key, (group = []));
      groups.push(group);
    }
    group.push(item);
  };
  const byLicence = new Map<string, Item[]>();
  for (const item of items) if (item.licence !== null) add(byLicence, item.licence, item);

  // Licensed riders by name key: who an entry without a licence could be.
  const licensedNames = new Map<string, Item[][]>();
  for (const group of byLicence.values()) {
    const keys = [...new Set(group.map((i) => i.key))];
    const names = [...new Set(group.map((i) => i.shown))];
    if (keys.length > 1 && names.length > 1) check({ kind: 'licence_names', names });
    for (const key of keys) licensedNames.set(key, [...(licensedNames.get(key) ?? []), group]);
  }
  for (const [key, found] of licensedNames) {
    if (found.length < 2) continue;
    const shown = found[0]?.find((i) => i.key === key)?.shown ?? key;
    check({ kind: 'name_licences', names: [shown] });
  }

  const byName = new Map<string, Item[]>();
  for (const item of items) {
    if (item.licence !== null) continue;
    const found = licensedNames.get(item.key);
    if (found?.length === 1 && found[0]) found[0].push(item);
    else add(byName, item.key, item);
  }
  return groups.map((g) => g.sort((a, b) => a.index - b.index));
}

/** The tally after the given rounds (round numbers from 1, any order in). */
export function computeSeries(
  rounds: readonly SeriesRound[],
  rules: SeriesRules,
  privacy: SeriesPrivacy = {},
): SeriesTally {
  const juniors = new Set(privacy.juniorSurnameInitialClasses ?? []);
  const ordered = [...rounds].sort((a, b) => a.round - b.round);
  const count = ordered.length;
  const winPoints = rules.points[0];
  // Every scoring entry, by class (class order: as first seen, in round order).
  const entries = new Map<string, Item[]>();
  ordered.forEach((round, index) => {
    for (const cls of round.results.classes) {
      for (const e of cls.entries) {
        const pts = roundPoints(e, rules);
        if (pts === null) continue;
        let items = entries.get(cls.name);
        if (!items) entries.set(cls.name, (items = []));
        items.push({
          index,
          entry: e,
          pts,
          licence: entryLicence(e, round.licences),
          key: riderKey(e),
          shown: displayName(e, juniors.has(cls.name)),
        });
      }
    }
  });

  type Row = { name: string; number: number; club?: string; rounds: (number | null)[] };
  const checks: SeriesCheck[] = [];
  const classes = [...entries].map(([cls, items]): [string, Row[]] => [
    cls,
    matchRiders(items, (c) => checks.push({ ...c, class: cls })).map((group) => {
      const row: Row = { name: '', number: 0, rounds: Array<number | null>(count).fill(null) };
      // In round order, so the name, number and club shown are the latest round's.
      for (const { index, entry: e, pts, shown } of group) {
        // Two entries for one rider in a round (unlikely): keep the better.
        row.rounds[index] = Math.max(row.rounds[index] ?? 0, pts);
        row.name = shown;
        row.number = e.number;
        if (e.club !== undefined) row.club = e.club;
        else delete row.club;
      }
      return row;
    }),
  ]);

  return {
    rounds: count,
    checks,
    classes: classes.map(([name, riders]) => {
      const rows = riders.map((r) => ({
        ...r,
        total: bestSum(r.rounds, undefined),
        counted: bestSum(r.rounds, rules.bestOf),
      }));
      const wins = (r: (typeof rows)[number]) =>
        winPoints === undefined ? 0 : r.rounds.filter((p) => p === winPoints).length;
      const latest = (r: (typeof rows)[number]) => {
        for (let i = r.rounds.length - 1; i >= 0; i--) {
          const p = r.rounds[i];
          if (p !== null && p !== undefined) return p;
        }
        return 0;
      };
      const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
        b.counted - a.counted ||
        (rules.ties === 'split' ? wins(b) - wins(a) || latest(b) - latest(a) : 0);
      rows.sort((a, b) => compare(a, b) || b.total - a.total || a.name.localeCompare(b.name));
      const placed: SeriesRow[] = [];
      rows.forEach((r, i) => {
        const prev = rows[i - 1];
        const place = prev && compare(prev, r) === 0 ? (placed[i - 1]?.place ?? i + 1) : i + 1;
        placed.push({ ...r, place, shared: false });
      });
      return {
        name,
        rows: placed.map((r) => ({
          ...r,
          shared: placed.filter((o) => o.place === r.place).length > 1,
        })),
      };
    }),
  };
}

/** "25, 22, 20" → numbers, or null if it isn't a list of whole numbers that don't go up. */
export function parsePointsScale(text: string): number[] | null {
  const parts = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 100) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 1000)) return null;
  if (nums.some((n, i) => i > 0 && n > (nums[i - 1] ?? Infinity))) return null;
  return nums;
}

// ---- Saved to share: PDF and CSV ----

export interface SeriesPrintOptions {
  readonly name: string;
  /** One label per round, e.g. "Rd 1 (6 Feb)". */
  readonly roundLabels: readonly string[];
  readonly rules: SeriesRules;
  /** e.g. "Produced by tScore 0.7.0 on 6 Feb 2027." */
  readonly footer: string;
  /** Rounds in the series not counted yet (not final), in words. */
  readonly notCounted?: string;
  /** The PDF's words in the app's language (#64); the CSV stays English. English if omitted. */
  readonly t?: Translate;
  /** The page's language, e.g. "en-AU". */
  readonly lang?: string;
  /** The organising club's logo (#111), when every round is the same club's. */
  readonly clubLogo?: string;
}

const placeWords = (r: SeriesRow) => `${r.place}${r.shared ? '=' : ''}`;

/** The tally as CSV for Excel (UTF-8 with BOM). */
export function seriesCsv(tally: SeriesTally, opts: SeriesPrintOptions): string {
  const best = opts.rules.bestOf !== undefined;
  const rows: (string | number | null)[][] = [
    [
      'Class',
      'Place',
      'Name',
      'Number',
      'Club',
      ...opts.roundLabels,
      'Total',
      ...(best ? [`Best ${opts.rules.bestOf}`] : []),
    ],
  ];
  for (const cls of tally.classes) {
    for (const r of cls.rows) {
      rows.push([
        cls.name,
        placeWords(r),
        r.name,
        r.number,
        r.club ?? '',
        ...r.rounds,
        r.total,
        ...(best ? [r.counted] : []),
      ]);
    }
  }
  return `${BOM}${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}

/** A complete HTML page for A4 printing: one table per class. */
export function seriesHtml(tally: SeriesTally, opts: SeriesPrintOptions): string {
  const best = opts.rules.bestOf !== undefined;
  const t = opts.t ?? english;
  const points = `${opts.rules.points.slice(0, 6).join(', ')}${opts.rules.points.length > 6 ? ' …' : ''}`;
  const bestOf = opts.rules.bestOf ?? 0;
  const rule = [
    t('core.seriesPoints', 'Points by place: {{points}}.', { points }),
    best
      ? t(
          'core.seriesBest',
          bestOf === 1 ? 'Best 1 round counts.' : 'Best {{count}} rounds count.',
          { count: bestOf },
        )
      : t('core.seriesEvery', 'Every round counts.'),
    opts.rules.ties === 'share'
      ? t('core.seriesTiesShare', 'Equal totals share a place (=).')
      : t(
          'core.seriesTiesSplit',
          'Equal totals are split by most round wins, then the latest round; = if still equal.',
        ),
    t(
      'core.seriesZero',
      'DNF and No award score 0. A blank is a round not ridden. Non-competitive riders take no series points.',
    ),
  ].join(' ');
  const bestHead = t('core.seriesBestHead', 'Best {{rounds}}', { rounds: bestOf });
  const classes = tally.classes
    .map(
      (cls) => `
<section>
  <h2>${esc(cls.name)}</h2>
  <table>
    <thead><tr><th>${esc(t('core.headPlace', 'Place'))}</th><th>${esc(t('core.headRider', 'Rider'))}</th><th class="n">${esc(t('core.headNumber', 'No.'))}</th><th>${esc(t('core.headClub', 'Club'))}</th>${opts.roundLabels
      .map((l) => `<th class="n">${esc(l)}</th>`)
      .join(
        '',
      )}<th class="n">${esc(t('core.headTotal', 'Total'))}</th>${best ? `<th class="n">${esc(bestHead)}</th>` : ''}</tr></thead>
    <tbody>${cls.rows
      .map(
        (r) =>
          `<tr><td class="place">${esc(placeWords(r))}</td><td>${esc(r.name)}</td><td class="n">${r.number}</td><td>${esc(r.club)}</td>${r.rounds
            .map((p) => `<td class="n">${p ?? ''}</td>`)
            .join(
              '',
            )}<td class="n${best ? '' : ' total'}">${r.total}</td>${best ? `<td class="n total">${r.counted}</td>` : ''}</tr>`,
      )
      .join('')}</tbody>
  </table>
</section>`,
    )
    .join('');
  return `<!doctype html>
<html lang="${esc(opts.lang ?? 'en-AU')}"><head><meta charset="utf-8"><title>${esc(opts.name)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #111; margin: 0; }
  h1 { font-size: 17pt; margin: 0; }
  .sub { color: #444; margin: 2px 0 8px; }
  .note { border: 2px solid #b35c00; color: #6b2e00; padding: 6px 10px; margin: 6px 0 10px; font-weight: 700; }
  section { break-inside: avoid; margin-top: 12px; }
  h2 { font-size: 12pt; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5pt; color: #333; border-bottom: 1.5px solid #333; padding: 3px 4px; }
  td { border-bottom: 0.5px solid #ccc; padding: 3px 4px; }
  .n { text-align: right; }
  .place { font-weight: 700; width: 3.5em; }
  .total { font-weight: 700; }
  footer { margin-top: 14px; color: #444; font-size: 8pt; }
  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .event-logo { max-height: 20mm; max-width: 45mm; object-fit: contain; }${CREDIT_CSS}
</style></head><body>
${headHtml(
  opts.clubLogo ? { club: opts.clubLogo } : undefined,
  `<h1>${esc(opts.name)}</h1>
<div class="sub">${esc(
    t(
      'core.seriesAfter',
      tally.rounds === 1 ? 'Series points after 1 round' : 'Series points after {{count}} rounds',
      { count: tally.rounds },
    ),
  )}</div>`,
)}
${opts.notCounted ? `<div class="note">${esc(opts.notCounted)}</div>` : ''}
${classes}
<footer>${esc(rule)}<br>${esc(opts.footer)}</footer>
${creditHtml(t)}
</body></html>`;
}
