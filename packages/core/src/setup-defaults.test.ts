import { describe, expect, it } from 'vitest';
import { isEventCode, newEventSetup, suggestEventCode } from './setup-defaults.js';
import { validateEventSetup } from './setup-validation.js';

describe('a new event', () => {
  it('starts with the usual classes and is valid once named', () => {
    const setup = { ...newEventSetup('2027-02-06'), event: { name: 'Club Trial', code: 'CT' } };
    expect(validateEventSetup(setup).ok).toBe(true);
    expect(setup.classes.map((c) => c.name)).toContain('Trial 4 Plus');
    expect(setup.classes.find((c) => c.name === 'Minder')).toMatchObject({
      scored: false,
      days: { '1': { laps: 0 } },
    });
  });

  it('needs a name and code before it can be saved', () => {
    const r = validateEventSetup(newEventSetup('2027-02-06'));
    expect(r.ok).toBe(false);
  });
});

describe('suggested event codes', () => {
  it.each([
    ['Summer Series Round 3', 'SSR3'],
    ['Example Club Trial', 'ECT'],
    ['  state champs — day 2 ', 'SCD2'],
    ['', ''],
  ])('%s → %s', (name, code) => {
    expect(suggestEventCode(name)).toBe(code);
  });

  it('fit the QR code rules whenever there are at least two characters', () => {
    expect(isEventCode(suggestEventCode('Summer Series Round 3'))).toBe(true);
    expect(isEventCode('X')).toBe(false);
    expect(isEventCode('ssr3')).toBe(false);
  });
});
