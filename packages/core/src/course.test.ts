import { describe, expect, it } from 'vitest';
import { courseReport, type CourseCard } from './course.js';
import type { EventSetup } from './generated/event-setup.js';
import type { EntryInput } from './results/model.js';

// Invented riders only.
const setup: EventSetup = {
  schema: 'tscore.event_setup/1',
  event: { name: 'Example Club Trial', code: 'DEMO1' },
  days: [{ day: 1, date: '2027-02-06', start_time: '10:00' }],
  classes: [
    { name: 'Trial 2', days: { '1': { sections: 10, laps: 3 } } },
    { name: 'Juniors', days: { '1': { sections: 10, laps: 2 } } },
    { name: 'Minder', scored: false, days: { '1': { sections: 10, laps: 3 } } },
  ],
};

const rider = (number: number, cls = 'Trial 2', extra: Partial<EntryInput> = {}): EntryInput => ({
  number,
  riders: [{ givenName: 'Avery', familyName: `Stone ${number}` }],
  competitionStatus: 'competitive',
  status: 'riding',
  classes: [cls],
  ...extra,
});

const START = Date.parse('2027-02-06T10:00:00');
const at = (minutes: number) => START + minutes * 60_000;
const card = (number: number, lap: number, minutes: number, total = 3): CourseCard => ({
  number,
  day: 1,
  lap,
  at: at(minutes),
  total,
});
const report = (entries: EntryInput[], cards: CourseCard[], nowMinutes: number) =>
  courseReport(setup, entries, cards, { day: 1, now: at(nowMinutes), start: START });
const find = (r: ReturnType<typeof report>, n: number) => r.riders.find((x) => x.number === n);

describe('still on course', () => {
  it('nobody is out before the start; everyone riding is out after it', () => {
    expect(
      courseReport(setup, [rider(1)], [], { day: 1, now: at(-5), start: START }).counts,
    ).toMatchObject({ out: 0, waiting: 1 });
    expect(report([rider(1)], [], 5).counts).toMatchObject({ out: 1, waiting: 0 });
  });

  it('a rider is in once their last lap card is in, and DNF or DNS riders are accounted for', () => {
    const r = report(
      [
        rider(1),
        rider(2),
        rider(3, 'Trial 2', { status: 'dnf' }),
        rider(4, 'Trial 2', { status: 'dns' }),
      ],
      [card(1, 1, 40), card(1, 2, 80), card(1, 3, 120), card(2, 1, 40)],
      130,
    );
    expect(r.riders.map((x) => `${x.number}:${x.state}`)).toEqual([
      '1:in',
      '2:out',
      '3:dnf',
      '4:dns',
    ]);
    expect(r.counts).toMatchObject({ out: 1, in: 1, dnf: 1, dns: 1, cardsIn: 4, cardsExpected: 9 });
  });

  it("leaves minders out, and doesn't count riders whose class isn't riding that day", () => {
    const r = report([rider(1, 'Minder'), rider(2)], [], 5);
    expect(r.riders.map((x) => x.number)).toEqual([2]);
  });
});

describe('overdue', () => {
  // Trial 2 laps take 40 minutes (riders 1 and 2), so with the 30-minute margin rider 3's
  // next card is overdue after 70 minutes.
  const others = [card(1, 1, 40), card(1, 2, 80), card(2, 1, 40), card(2, 2, 80)];

  it('flags a rider whose card is later than the class average plus the margin', () => {
    const r = report([rider(1), rider(2), rider(3)], [...others, card(3, 1, 40)], 105);
    expect(r.averageLap['Trial 2']).toBe(40);
    expect(find(r, 3)?.overdue).toBeUndefined(); // 65 min: within 40 + 30
    const later = report([rider(1), rider(2), rider(3)], [...others, card(3, 1, 40)], 111);
    expect(find(later, 3)?.overdue).toEqual({ lap: 2, minutes: 71, averageLap: 40 });
    expect(find(later, 3)?.lapStates.map((l) => l.kind)).toEqual(['in', 'overdue', 'due']);
    expect(later.counts.overdue).toBe(1);
  });

  it('uses the margin from Event setup', () => {
    const r = courseReport(setup, [rider(1), rider(2), rider(3)], [...others, card(3, 1, 40)], {
      day: 1,
      now: at(111),
      start: START,
      marginMinutes: 45,
    });
    expect(find(r, 3)?.overdue).toBeUndefined();
  });

  it('gives a rider carrying two laps two laps of time', () => {
    // Rider 3 handed in laps 1 and 2 together at 80 minutes.
    const cards = [...others, card(3, 1, 79), card(3, 2, 80)];
    expect(
      find(report([rider(1), rider(2), rider(3)], cards, 80 + 75), 3)?.overdue,
    ).toBeUndefined();
    expect(find(report([rider(1), rider(2), rider(3)], cards, 80 + 75), 3)?.carrying).toBe(2);
    expect(find(report([rider(1), rider(2), rider(3)], cards, 80 + 111), 3)?.overdue?.lap).toBe(3);
  });

  it("never flags anyone until there's a lap time to go by, and never marks DNF itself", () => {
    const r = report([rider(1)], [], 500);
    expect(find(r, 1)).toMatchObject({ state: 'out', minutesOut: 500 });
    expect(find(r, 1)?.overdue).toBeUndefined();
  });
});

describe('progress', () => {
  it('shows each lap: in with its total, due, DNF, DNS or not ridden', () => {
    const r = report(
      [rider(1), rider(2, 'Juniors', { status: 'dnf' }), rider(3, 'Trial 2', { status: 'dns' })],
      [card(1, 1, 40, 7), card(2, 1, 45, 2)],
      50,
    );
    expect(r.mostLaps).toBe(3); // Trial 2's laps; the Juniors' 2 fit inside
    expect(find(r, 1)?.lapStates.map((l) => l.kind)).toEqual(['in', 'due', 'due']);
    expect(find(r, 1)?.total).toBe(7);
    expect(find(r, 2)?.lapStates.map((l) => l.kind)).toEqual(['in', 'dnf', 'not_ridden']);
    expect(find(r, 3)?.lapStates.map((l) => l.kind)).toEqual(['dns', 'dns', 'dns']);
  });
});
