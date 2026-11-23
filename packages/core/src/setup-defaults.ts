import type { EventSetup } from './generated/event-setup.js';

/**
 * The classes a new event starts with. The club changes them in Event setup: these are only a
 * starting point, so nobody types the usual list out each time. Minders come along with riders
 * but aren't scored.
 */
export const STARTER_CLASSES: readonly { name: string; scored?: false }[] = [
  { name: 'Trial 1' },
  { name: 'Trial 2' },
  { name: 'Trial 3' },
  { name: 'Trial 4 Plus' },
  { name: 'Trial 4' },
  { name: 'Trial 5' },
  { name: 'Juniors' },
  { name: 'Sidecar' },
  { name: 'Minder', scored: false },
];

export const STARTER_SECTIONS = 10;
export const STARTER_LAPS = 4;

/** A new one-day event on `date` (YYYY-MM-DD), with the starter classes. Name and code empty. */
export function newEventSetup(date: string): EventSetup {
  return {
    schema: 'tscore.event_setup/1',
    event: { name: '', code: '' },
    days: [{ day: 1, date }],
    classes: STARTER_CLASSES.map((c, i) => ({
      name: c.name,
      order: (i + 1) * 10,
      ...(c.scored === false && { scored: false }),
      days: {
        '1':
          c.scored === false
            ? { sections: 0, laps: 0 }
            : { sections: STARTER_SECTIONS, laps: STARTER_LAPS },
      },
    })),
  };
}

/**
 * A suggested event code from the event name: the first letter of each word plus any number in
 * it, e.g. "Summer Series Round 3" → "SSR3". The desk can change it.
 */
export function suggestEventCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const code = words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join('');
  return code.slice(0, 16);
}

/** True for a code that fits `event.code`: 2–16 capital letters, digits and hyphens. */
export function isEventCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code);
}
