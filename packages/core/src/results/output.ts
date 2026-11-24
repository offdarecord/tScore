/**
 * Turning a `tscore.results/1` payload into what people read: place labels, table columns, the
 * results CSV and the printable HTML that becomes the PDF.
 *
 * Everything here reads only the payload, so the screen, the PDF and the CSV always agree, and
 * whatever the payload leaves out (a non-competitive rider's scores) can't appear in any of them.
 */
import type { ClassResults, Entry, Results } from '../generated/results.js';
import type { ResultsGap } from './compute.js';

/** "1st", "2nd", "3rd", "4th", "11th", "21st"... */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

/**
 * What goes in the Place column for each entry, in order. A shared placing gets "=" on every
 * rider in the tie ("2nd=", "2nd="). NA = No award, NC = Non-competitive.
 */
export function placeLabels(entries: readonly Entry[]): string[] {
  return entries.map((e, i) => {
    if (e.status === 'dns') return 'DNS';
    if (e.status === 'dnf') return 'DNF';
    if (e.competition_status === 'non_competitive') return 'NC';
    if (e.competition_status === 'no_award') return 'NA';
    if (e.position === null) return '';
    const tied = e.tied_with_previous === true || entries[i + 1]?.tied_with_previous === true;
    return `${ordinal(e.position)}${tied ? '=' : ''}`;
  });
}

export interface LapColumn {
  readonly day: number;
  readonly lap: number;
  /** "Lap 2", or "D1 L2" when the class rides more than one day. */
  readonly label: string;
}

export function lapColumns(cls: ClassResults): LapColumn[] {
  const multiDay = cls.days.length > 1;
  return cls.days.flatMap((d) =>
    Array.from({ length: d.laps }, (_, i) => ({
      day: d.day,
      lap: i + 1,
      label: multiDay ? `D${d.day} L${i + 1}` : `Lap ${i + 1}`,
    })),
  );
}

/** A lap's total for the table, or null when it isn't in (or isn't published). */
export function lapTotal(e: Entry, col: LapColumn): number | null {
  return e.days?.find((d) => d.day === col.day)?.laps.find((l) => l.lap === col.lap)?.total ?? null;
}

export function penaltyPoints(e: Entry): number {
  return (e.penalties ?? []).reduce((a, p) => a + p.points, 0);
}

/** The rider's name, or "Driver & Passenger" for a sidecar. */
export function entryName(e: Entry): string {
  return e.riders.map((p) => p.name).join(' & ');
}

/** "10 sections × 4 laps", or one part per day for a multi-day class. */
export function classSummary(cls: ClassResults): string {
  const one = (d: ClassResults['days'][number]) =>
    `${d.sections} sections × ${d.laps} ${d.laps === 1 ? 'lap' : 'laps'}`;
  if (cls.days.length === 1 && cls.days[0]) return one(cls.days[0]);
  return cls.days.map((d) => `day ${d.day}: ${one(d)}`).join('; ');
}

/** The tie-break rule in words, e.g. "Ties are split by most 0s, then most 1s… then a ride-off." */
export function tieBreakWords(results: Results): string {
  const { tie_breaks, direction } = results.event.scoring;
  const steps = tie_breaks
    .filter((t) => t !== 'total')
    .map((t) => {
      const most = /^most_(\d+)$/.exec(t);
      if (most) return `most ${most[1] ?? ''}s`;
      const fewest = /^fewest_(\d+)$/.exec(t);
      if (fewest) return `fewest ${fewest[1] ?? ''}s`;
      if (t === 'ride_off') return 'a ride-off';
      return t;
    });
  const win = direction === 'high_wins' ? 'Highest total wins.' : 'Lowest total wins.';
  return steps.length ? `${win} Ties are split by ${steps.join(', then ')}.` : win;
}

/** Gaps in plain words: "2 cards still missing and 1 score undecided." Empty when complete. */
export function gapWords(gaps: readonly ResultsGap[]): string {
  const missing = gaps.filter((g) => g.kind === 'missing_card');
  // A rider in two classes is listed once per class; count each card once.
  const cards = new Set(missing.map((g) => `${g.number}:${g.day}:${g.lap}`)).size;
  const scores = new Set(
    gaps
      .filter((g) => g.kind === 'undecided_score')
      .map((g) => `${g.number}:${g.day}:${g.lap}:${g.section ?? 0}`),
  ).size;
  const parts: string[] = [];
  if (cards) parts.push(`${cards} ${cards === 1 ? 'card' : 'cards'} still missing`);
  if (scores) parts.push(`${scores} ${scores === 1 ? 'score' : 'scores'} undecided`);
  return parts.length ? `${parts.join(' and ')}.` : '';
}

// ---- CSV ----

/** UTF-8 byte-order mark: tells Excel the CSV is UTF-8, so accented names come through. */
export const BOM = String.fromCharCode(0xfeff);

function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  // Text that a spreadsheet would run as a formula gets a leading apostrophe.
  const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * One row per entry per class, in results order. Non-competitive riders have no lap scores,
 * penalties or total (never published). Starts with a byte-order mark so Excel reads it as UTF-8.
 */
export function resultsCsv(results: Results): string {
  const values = results.event.scoring.score_values;
  const maxLaps = Math.max(0, ...results.classes.map((c) => lapColumns(c).length));
  const head = [
    'Class',
    'Place',
    'Number',
    'Name',
    'Club',
    'Status',
    ...Array.from({ length: maxLaps }, (_, i) => `Lap ${i + 1}`),
    'Penalties',
    'Total',
    ...values.map((v) => `${v}s`),
  ];
  const rows: (string | number | null)[][] = [head];
  for (const cls of results.classes) {
    const cols = lapColumns(cls);
    const places = placeLabels(cls.entries);
    cls.entries.forEach((e, i) => {
      const published = e.days !== undefined;
      const laps = Array.from({ length: maxLaps }, (_, k) => {
        const col = cols[k];
        return col ? lapTotal(e, col) : null;
      });
      rows.push([
        cls.name,
        places[i] ?? '',
        e.number,
        entryName(e),
        e.club ?? '',
        e.status === 'finished' ? '' : e.status.toUpperCase(),
        ...laps,
        published && penaltyPoints(e) ? penaltyPoints(e) : null,
        e.total,
        ...values.map((v) => (e.status === 'dns' ? null : (e.counts?.[String(v)] ?? 0))),
      ]);
    });
  }
  return `${BOM}${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}

// ---- Printable HTML (becomes the PDF) ----

const esc = (s: string | number | null | undefined) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

export interface PrintOptions {
  /** Cards missing or scores undecided: printed as PROVISIONAL with the reason. */
  readonly gaps: readonly ResultsGap[];
  /** e.g. "Sat 6 Feb 2027". */
  readonly dates: string;
  /** e.g. "tScore 0.5.0, 24 Nov 2026 3:15 pm". */
  readonly footer: string;
}

/** A complete HTML page for A4 printing: one table per class, provisional marked plainly. */
export function resultsHtml(results: Results, opts: PrintOptions): string {
  const values = results.event.scoring.score_values;
  const ev = results.event;
  const provisional = opts.gaps.length > 0;
  const sub = [ev.club, ev.venue, opts.dates].filter(Boolean).map(esc).join(' · ');

  const classes = results.classes
    .filter((c) => c.entries.length > 0)
    .map((cls) => {
      const cols = lapColumns(cls);
      const places = placeLabels(cls.entries);
      const rows = cls.entries
        .map((e, i) => {
          const muted = e.competition_status !== 'competitive' || e.status !== 'finished';
          const pen = penaltyPoints(e);
          const cells = [
            `<td class="place">${esc(places[i])}</td>`,
            `<td class="num">${e.number}</td>`,
            `<td>${esc(entryName(e))}</td>`,
            `<td>${esc(e.club)}</td>`,
            ...cols.map((c) => `<td class="n">${esc(lapTotal(e, c))}</td>`),
            `<td class="n">${pen ? pen : ''}</td>`,
            `<td class="n total">${esc(e.total)}</td>`,
            ...values.map(
              (v) =>
                `<td class="n count">${e.status === 'dns' ? '' : (e.counts?.[String(v)] ?? 0)}</td>`,
            ),
          ];
          return `<tr${muted ? ' class="muted"' : ''}>${cells.join('')}</tr>`;
        })
        .join('');
      return `
<section>
  <h2>${esc(cls.name)} <span>${esc(classSummary(cls))} · ${cls.entries.length} ${cls.entries.length === 1 ? 'entry' : 'entries'}</span></h2>
  <table>
    <thead><tr><th>Place</th><th class="num">No.</th><th>Rider</th><th>Club</th>${cols
      .map((c) => `<th class="n">${esc(c.label)}</th>`)
      .join(
        '',
      )}<th class="n">Pen.</th><th class="n">Total</th>${values.map((v) => `<th class="n">${v}s</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><title>${esc(ev.name)} results</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #111; margin: 0; }
  h1 { font-size: 17pt; margin: 0; }
  .sub { color: #444; margin: 2px 0 8px; }
  .provisional { border: 2px solid #b35c00; color: #6b2e00; padding: 6px 10px; margin: 6px 0 10px; font-weight: 700; }
  section { break-inside: avoid; margin-top: 12px; }
  h2 { font-size: 12pt; margin: 0 0 4px; }
  h2 span { font-size: 9pt; font-weight: 400; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5pt; color: #333; border-bottom: 1.5px solid #333; padding: 3px 4px; }
  td { border-bottom: 0.5px solid #ccc; padding: 3px 4px; }
  .n { text-align: right; }
  .num { text-align: right; width: 3em; }
  .place { font-weight: 700; width: 3.5em; }
  .total { font-weight: 700; }
  .count { color: #444; }
  tr.muted td { color: #555; }
  footer { margin-top: 14px; color: #444; font-size: 8pt; }
</style></head><body>
<h1>${esc(ev.name)}</h1>
<div class="sub">${sub}</div>
${provisional ? `<div class="provisional">PROVISIONAL: ${esc(gapWords(opts.gaps))} Positions may change.</div>` : ''}
${classes}
<footer>${esc(tieBreakWords(results))} NA = No award (scored, not placed). NC = Non-competitive (counts only; scores are not published). DNF = did not finish. DNS = did not start.<br>${esc(opts.footer)}</footer>
</body></html>`;
}
