import {
  classSummary,
  computeResults,
  english,
  gapWords,
  lapColumns,
  placeChanges,
  placeLabels,
  resultsHtml,
  tieBreakWords,
  type ResultsTypes,
} from '@tscore/core';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import {
  DEMO_EVENT,
  DEMO_OPTIONS,
} from '../../../../packages/core/src/results/demo-event.test-fixture';
import { coreTranslator, messagesFor } from './i18n';

// Core writes its own English; the app's message file has the same words under `core.*` for
// translators. The two must never drift: run core both ways and compare.

const instance = i18next.createInstance();
void instance.init({
  lng: 'en',
  resources: { en: { translation: messagesFor('en') } },
  interpolation: { escapeValue: false },
  initAsync: false,
});
const app = coreTranslator((key, options) => String(instance.t(key, options as never)));
const { results } = computeResults(DEMO_EVENT, DEMO_OPTIONS);

const gap = (kind: 'missing_card' | 'undecided_score', number: number, section?: number) => ({
  kind,
  number,
  className: 'Trial 2',
  day: 1,
  lap: 1,
  ...(section !== undefined && { section }),
});

describe("core's English and the message file agree", () => {
  it('for places, including every ordinal ending', () => {
    const entries = Array.from(
      { length: 113 },
      (_, i) =>
        ({
          number: i + 1,
          riders: [{ name: 'A' }],
          competition_status: 'competitive',
          status: 'finished',
          position: i + 1,
          total: i,
        }) as unknown as ResultsTypes.Entry,
    );
    expect(placeLabels(entries, app)).toEqual(placeLabels(entries, english));
    for (const cls of results.classes) {
      expect(placeLabels(cls.entries, app)).toEqual(placeLabels(cls.entries, english));
      expect(lapColumns(cls, app)).toEqual(lapColumns(cls, english));
      expect(classSummary(cls, app)).toBe(classSummary(cls, english));
    }
  });

  it('for the tie rule, the gaps, and what changed', () => {
    expect(tieBreakWords(results, app)).toBe(tieBreakWords(results, english));
    for (const gaps of [
      [gap('missing_card', 1)],
      [gap('missing_card', 1), gap('missing_card', 2)],
      [gap('undecided_score', 1, 3)],
      [gap('missing_card', 1), gap('undecided_score', 2, 3), gap('undecided_score', 2, 4)],
    ]) {
      expect(gapWords(gaps, app)).toBe(gapWords(gaps, english));
    }
    const fewer = {
      ...results,
      classes: results.classes.map((c) => ({ ...c, entries: c.entries.slice(1) })),
    };
    expect(placeChanges(results, fewer, app)).toEqual(placeChanges(results, fewer, english));
    expect(placeChanges(fewer, results, app)).toEqual(placeChanges(fewer, results, english));
  });

  it('for the whole results PDF, provisional and final', () => {
    const base = { dates: 'Sat 6 Feb 2027', footer: 'tScore' };
    for (const opts of [
      { ...base, gaps: [gap('missing_card', 1)] },
      {
        ...base,
        gaps: [],
        revisionNote: { replaces: 1, replacedAt: 'Sat', reason: 'Misread', changes: [] },
        thanks: {
          sections: [{ day: 1, section: 1, name: 'Creek', observer: 'Pat' }],
          officials: [{ role: 'Clerk of Course', name: 'Jo' }],
        },
        logos: { sponsors: ['data:image/png;base64,AAAA'] },
      },
    ]) {
      const final = { ...results, status: 'final' as const, revision: 2 };
      expect(resultsHtml(final, { ...opts, t: app })).toBe(resultsHtml(final, opts));
      expect(resultsHtml(results, { ...opts, t: app })).toBe(resultsHtml(results, opts));
    }
  });
});
