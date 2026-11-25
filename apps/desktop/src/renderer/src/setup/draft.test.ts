import { newEventSetup } from '@tscore/core';
import { describe, expect, it } from 'vitest';
import { newOfficial, problems, sectionsOnDay, toDraft, toSetup } from './draft';

const base = { ...newEventSetup('2027-02-06'), event: { name: 'Example Trial', code: 'EXT' } };

describe('section names, observers and officials in Event setup', () => {
  it('saves only what was entered, and reads it back', () => {
    const draft = toDraft(base);
    expect(draft.thanks).toBe(true);
    expect(sectionsOnDay(draft, 0)).toBe(10);
    const day = draft.days[0]!;
    day.sections = [
      { name: 'Creek bed', observer: ' Pat Brown ' },
      { name: '', observer: '' },
      { name: '', observer: 'Sam Lee' },
    ];
    const official = { ...newOfficial(), role: 'Clerk of Course', name: 'Jo Smith' };
    const setup = toSetup({ ...draft, officials: [official, newOfficial()], thanks: false }, base);
    expect(setup.days[0]?.section_details).toEqual([
      { section: 1, name: 'Creek bed', observer: 'Pat Brown' },
      { section: 3, observer: 'Sam Lee' },
    ]);
    expect(setup.officials).toEqual([{ role: 'Clerk of Course', name: 'Jo Smith' }]);
    expect(setup.thanks_on_results).toBe(false);

    const again = toDraft(setup);
    expect(again.days[0]?.sections[2]).toEqual({ name: '', observer: 'Sam Lee' });
    expect(again.officials.map((o) => o.name)).toEqual(['Jo Smith']);
    expect(again.thanks).toBe(false);
  });

  it('leaves the setup as it was when nothing is entered', () => {
    const setup = toSetup(toDraft(base), base);
    expect(setup.days[0]?.section_details).toBeUndefined();
    expect(setup.officials).toBeUndefined();
    expect(setup.thanks_on_results).toBeUndefined();
  });

  it('asks for the missing half of an official', () => {
    const draft = toDraft(base);
    draft.officials = [
      { ...newOfficial(), name: 'Jo Smith' },
      { ...newOfficial(), role: 'Secretary' },
    ];
    const found = problems(draft, base).map((p) => p.field);
    expect(found).toEqual(['officials[0].role', 'officials[1].name']);
  });
});
