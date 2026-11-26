import {
  classSummary,
  computeResults,
  computeSeries,
  describeTypedScoreProblem,
  IMPORT_PRESETS,
  labelTemplate,
  planLabels,
  seriesHtml,
  SUGGESTION_QUESTIONS,
  type EventSetup,
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

describe("the rest of core's English and the message file agree", () => {
  it('for typed-score problems', () => {
    const values = [0, 1, 2, 3, 5];
    for (const p of [
      { kind: 'not_a_score', section: 4, text: '7' },
      { kind: 'too_few', missing: 1 },
      { kind: 'too_few', missing: 3 },
      { kind: 'too_many', sections: 10 },
    ] as const) {
      for (const cls of [undefined, 'Trial 2']) {
        expect(describeTypedScoreProblem(p, values, cls, app)).toBe(
          describeTypedScoreProblem(p, values, cls, english),
        );
      }
    }
  });

  it('for card labels', () => {
    for (const days of [1, 2]) {
      const setup: EventSetup = {
        schema: 'tscore.event_setup/1',
        event: { name: 'Example Club Trial', code: 'DEMO1' },
        days: Array.from({ length: days }, (_, i) => ({ day: i + 1 })),
        classes: [{ name: 'Trial 2', days: { '1': { sections: 10, laps: 2 } } }],
      };
      const entries = (['competitive', 'no_award', 'non_competitive'] as const).map((s, i) => ({
        number: i + 1,
        riders: [{ givenName: 'Avery', familyName: 'Stone' }],
        competitionStatus: s,
        status: 'riding' as const,
        classes: ['Trial 2'],
      }));
      const template = labelTemplate('L7651');
      expect(planLabels(setup, entries, template, { t: app })).toEqual(
        planLabels(setup, entries, template),
      );
    }
  });

  it('for the series PDF', () => {
    const tally = computeSeries([{ round: 1, results }], { points: [20, 17, 15], ties: 'share' });
    const base = { name: 'Series', roundLabels: ['Rd 1'], footer: 'tScore' };
    for (const rules of [
      { points: [20, 17, 15, 13, 11, 10, 9], ties: 'share' as const },
      { points: [20, 17], ties: 'split' as const, bestOf: 1 },
      { points: [20, 17], ties: 'split' as const, bestOf: 4 },
    ]) {
      expect(seriesHtml(tally, { ...base, rules, t: app })).toBe(
        seriesHtml(tally, { ...base, rules }),
      );
    }
  });

  it('for the suggestion questions', () => {
    for (const q of SUGGESTION_QUESTIONS) {
      expect(app(`core.suggest_${q.id}`, '')).toBe(q.label);
      if (q.help) expect(app(`core.suggest_${q.id}_help`, '')).toBe(q.help);
      (q.options ?? []).forEach((o, i) => {
        expect(app(`core.suggest_${q.id}_${i + 1}`, '')).toBe(o);
      });
    }
  });

  it('for the import skip reasons', () => {
    const reasons = IMPORT_PRESETS.flatMap((p) => (p.skip_rows ?? []).map((r) => r.reason));
    for (const reason of ['no class', ...reasons]) {
      expect(app(`core.skipReason_${reason.replace(/\W+/g, '_')}`, '')).toBe(reason);
    }
  });
});
