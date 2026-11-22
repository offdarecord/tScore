/**
 * The raw input behind schemas/examples/results.one-day.json: riders, classes and cards.
 * All names are made up. Shared by tests.
 */
import type { EventInput, ResultsOptions } from './model.js';
import { DEFAULT_SCORING } from './model.js';

const p = (givenName: string, familyName: string) => ({ givenName, familyName });
const EMC = 'Example Motorcycle Club';

export const DEMO_EVENT: EventInput = {
  id: '3f2c8a1e-5b7d-4c9e-9a10-2b6e7d4f8c01',
  code: 'DEMO1',
  name: 'Example Club Trial',
  club: EMC,
  venue: 'Example Park',
  days: [{ day: 1, date: '2027-02-06' }],
  scoring: DEFAULT_SCORING,
  classes: [
    { name: 'Sidecar', order: 370, scored: true, days: [{ day: 1, sections: 5, laps: 2 }] },
    { name: 'Trial 2', order: 305, scored: true, days: [{ day: 1, sections: 5, laps: 2 }] },
    { name: 'Juniors', order: 360, scored: true, days: [{ day: 1, sections: 5, laps: 1 }] },
    { name: 'Minder', order: 9999, scored: false, days: [] },
  ],
  entries: [
    {
      number: 1,
      riders: [p('Alex', 'Example')],
      club: EMC,
      tier: 'competitive',
      status: 'riding',
      classes: ['Trial 2'],
    },
    {
      number: 2,
      riders: [p('Sam', 'Sample')],
      club: EMC,
      tier: 'competitive',
      status: 'riding',
      classes: ['Trial 2'],
    },
    {
      number: 3,
      riders: [p('Jo', 'Placeholder')],
      club: 'Another Example MCC',
      tier: 'competitive',
      status: 'riding',
      classes: ['Trial 2'],
      penalties: [{ points: 5, reason: 'dissent', day: 1, lap: 2 }],
    },
    {
      number: 4,
      riders: [p('Pat', 'Test')],
      tier: 'non_competitive',
      status: 'riding',
      classes: ['Trial 2'],
    },
    {
      number: 5,
      riders: [p('Chris', 'Dummy')],
      tier: 'competitive',
      status: 'dnf',
      classes: ['Trial 2'],
    },
    {
      number: 6,
      riders: [p('Lee', 'Absent')],
      tier: 'competitive',
      status: 'dns',
      classes: ['Trial 2'],
    },
    {
      number: 7,
      riders: [p('Riley', 'Mock')],
      tier: 'competitive',
      status: 'riding',
      classes: ['Juniors'],
    },
    {
      number: 8,
      riders: [p('Casey', 'Fake')],
      tier: 'no_award',
      status: 'riding',
      classes: ['Juniors'],
    },
    {
      number: 9,
      riders: [p('Morgan', 'Sample'), p('Taylor', 'Sample')],
      tier: 'competitive',
      status: 'riding',
      classes: ['Sidecar'],
    },
    {
      number: 10,
      riders: [p('Dale', 'Helper')],
      tier: 'competitive',
      status: 'riding',
      classes: ['Minder'],
    },
  ],
  cards: [
    { number: 1, day: 1, lap: 1, scores: [0, 1, 0, 2, 0] },
    { number: 1, day: 1, lap: 2, scores: [0, 0, 0, 1, 0] },
    { number: 2, day: 1, lap: 1, scores: [1, 0, 0, 0, 3] },
    { number: 2, day: 1, lap: 2, scores: [0, 0, 0, 0, 0] },
    { number: 3, day: 1, lap: 1, scores: [0, 0, 0, 0, 0] },
    { number: 3, day: 1, lap: 2, scores: [0, 0, 1, 0, 0] },
    { number: 4, day: 1, lap: 1, scores: [2, 3, 5, 1, 0] },
    { number: 4, day: 1, lap: 2, scores: [1, 1, 0, 0, 2] },
    { number: 5, day: 1, lap: 1, scores: [5, 5, 3, 2, 1] },
    { number: 7, day: 1, lap: 1, scores: [0, 0, 1, 0, 0] },
    { number: 8, day: 1, lap: 1, scores: [0, 2, 0, 0, 0] },
    { number: 9, day: 1, lap: 1, scores: [1, 1, 0, 0, 0] },
    { number: 9, day: 1, lap: 2, scores: [0, 1, 0, 0, 0] },
  ],
};

export const DEMO_OPTIONS: ResultsOptions = {
  generator: { name: 'tScore', version: '0.1.0' },
  generatedAt: '2027-02-06T15:42:10+11:00',
  status: 'final',
  revision: 1,
  privacy: { juniorSurnameInitialClasses: ['Juniors'] },
};
