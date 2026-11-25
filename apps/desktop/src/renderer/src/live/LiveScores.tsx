import type { ResultsTypes } from '@tscore/core';
import { useEffect, useMemo, useState } from 'react';
import type { LiveScores as LiveData } from '../../../shared/ipc';
import './live.css';
type ClassResults = ResultsTypes.ClassResults;
type Entry = ResultsTypes.Entry;

/** How often the page asks for fresh scores, and how long each class page stays up. */
const REFRESH_MS = 3_000;
const PAGE_MS = 12_000;
const ROW_PX = 64;
/** Space for the header, the class title and the footer. */
const CHROME_PX = 300;

interface Page {
  readonly cls: ClassResults;
  readonly rows: readonly Entry[];
  readonly page: number;
  readonly pages: number;
}

/** "Lap 2 of 4", "Finished", "DNF" or "DNS", from the laps in the payload. */
function lapsDone(e: Entry): number {
  return (e.days ?? []).reduce((n, d) => n + d.laps.filter((l) => l.total !== null).length, 0);
}

/** No card in yet: no place or total to show. */
const notStarted = (e: Entry) =>
  e.status === 'finished' && e.competition_status !== 'non_competitive' && lapsDone(e) === 0;

export function progressWords(cls: ClassResults, e: Entry): string {
  if (e.status === 'dns') return 'DNS';
  if (e.status === 'dnf') return 'DNF';
  const laps = cls.days.reduce((n, d) => n + d.laps, 0);
  const done = lapsDone(e);
  if (e.competition_status === 'non_competitive') return '';
  if (done === 0) return 'No card in yet';
  return done >= laps ? 'Finished' : `Lap ${done} of ${laps}`;
}

const place = (e: Entry) =>
  e.position !== null
    ? String(e.position)
    : e.competition_status === 'no_award'
      ? 'NA'
      : e.competition_status === 'non_competitive'
        ? 'NC'
        : '';

const names = (e: Entry) => e.riders.map((r) => r.name).join(' / ');

/** NC riders: counts only, never a total (governing-body rule). */
const countWords = (e: Entry) =>
  e.counts
    ? Object.entries(e.counts)
        .filter(([, n]) => n > 0)
        .map(([v, n]) => `${n}×${v}`)
        .join('  ')
    : '';

function paginate(classes: readonly ClassResults[], perPage: number): Page[] {
  const pages: Page[] = [];
  for (const cls of classes) {
    const shown = cls.entries.filter((e) => e.status !== 'dns');
    if (shown.length === 0) continue;
    const count = Math.max(1, Math.ceil(shown.length / perPage));
    for (let i = 0; i < count; i++) {
      pages.push({
        cls,
        rows: shown.slice(i * perPage, (i + 1) * perPage),
        page: i + 1,
        pages: count,
      });
    }
  }
  return pages;
}

/**
 * The big screen: made to be read from across the room, with no controls. Pages through the
 * classes on a timer, and refreshes as cards are saved. Provisional until results are final.
 */
export function LiveScores() {
  const [data, setData] = useState<LiveData | null>(null);
  const [noEvent, setNoEvent] = useState(false);
  const [index, setIndex] = useState(0);
  const [height, setHeight] = useState(window.innerHeight);

  useEffect(() => {
    document.title = 'tScore live scores';
    let stop = false;
    const load = async () => {
      const r = await window.tscore.liveScores();
      if (stop || !r.ok) return;
      setNoEvent(r.value === null);
      setData(r.value);
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const resize = () => setHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    // No controls on screen: Esc closes the big screen, F11 toggles full screen.
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void window.tscore.closeLiveScores();
      else if (e.key === 'F11') {
        e.preventDefault();
        void window.tscore.toggleLiveFullScreen();
      }
    };
    window.addEventListener('keydown', keys);
    return () => {
      stop = true;
      clearInterval(timer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keys);
    };
  }, []);

  const perPage = Math.max(3, Math.floor((height - CHROME_PX) / ROW_PX));
  const pages = useMemo(
    () => (data ? paginate(data.results.classes, perPage) : []),
    [data, perPage],
  );

  useEffect(() => {
    if (pages.length < 2) return;
    const timer = setInterval(() => setIndex((i) => i + 1), PAGE_MS);
    return () => clearInterval(timer);
  }, [pages.length]);

  if (noEvent || !data) {
    return (
      <main className="live" onDoubleClick={() => void window.tscore.toggleLiveFullScreen()}>
        <h1 className="live-event">{noEvent ? 'Live scores' : ''}</h1>
        {noEvent && <p className="live-wait">Waiting for the results desk to open an event.</p>}
      </main>
    );
  }

  const { results, missingCards, logos } = data;
  const current = pages[index % Math.max(1, pages.length)];
  const final = results.status === 'final';
  return (
    <main className="live" onDoubleClick={() => void window.tscore.toggleLiveFullScreen()}>
      <header className="live-head">
        <div className="live-title">
          {logos.event && <img className="live-logo" src={logos.event} alt="" />}
          <h1 className="live-event">{results.event.name}</h1>
        </div>
        <p className={final ? 'live-status live-final' : 'live-status live-provisional'}>
          {final
            ? `FINAL${results.revision > 1 ? ` · REVISION ${results.revision}` : ''}`
            : `PROVISIONAL${missingCards ? ` · ${missingCards} ${missingCards === 1 ? 'card' : 'cards'} to come` : ''}`}
        </p>
      </header>
      {current && (
        <section aria-label={current.cls.name}>
          <h2 className="live-class">
            {current.cls.name}
            {current.pages > 1 && (
              <span className="live-page">
                {' '}
                · page {current.page} of {current.pages}
              </span>
            )}
          </h2>
          <table className="live-table">
            <thead>
              <tr>
                <th scope="col">Pos</th>
                <th scope="col">No.</th>
                <th scope="col">Rider</th>
                <th scope="col">Progress</th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {current.rows.map((e) => {
                const nc = e.competition_status === 'non_competitive';
                return (
                  <tr key={e.number}>
                    <td className="num">{notStarted(e) ? '' : place(e)}</td>
                    <td className="num">{e.number}</td>
                    <td className="live-name">{names(e)}</td>
                    <td>{nc ? countWords(e) : progressWords(current.cls, e)}</td>
                    <td className="num live-total">{nc || notStarted(e) ? '' : (e.total ?? '')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <footer className="live-foot">
        <div className="live-tabs" aria-label="Classes">
          {results.classes
            .filter((c) => pages.some((p) => p.cls === c))
            .map((c) => (
              <span
                key={c.name}
                className={c === current?.cls ? 'live-tab live-tab-on' : 'live-tab'}
              >
                {c.name}
              </span>
            ))}
        </div>
        {logos.sponsors.length > 0 && (
          <div className="live-sponsors" aria-label="Sponsors">
            {logos.sponsors.map((uri, i) => (
              <img key={i} className="live-sponsor" src={uri} alt="" />
            ))}
          </div>
        )}
      </footer>
    </main>
  );
}
