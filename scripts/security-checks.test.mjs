import { describe, expect, it } from 'vitest';
import { advisories, judge } from './audit.mjs';
import { assess } from './electron-support.mjs';

const rel = (version, date = '2026-01-01') => ({ version, date });
const feed = [
  rel('47.0.0-nightly.20261124'),
  rel('46.0.0-beta.3'),
  rel('45.5.0'),
  rel('45.4.1'),
  rel('45.0.0', '2026-10-20'),
  rel('44.11.6'),
  rel('43.8.13'),
  rel('42.11.18'),
];

describe('electron support', () => {
  it('is quiet on the newest major and patch', () => {
    const r = assess('45.5.0', feed);
    expect(r).toMatchObject({ latestMajor: 45, oldestSupported: 43, supported: true });
    expect(r.findings).toEqual([]);
  });

  it('ignores betas and nightlies', () => {
    expect(assess('45.5.0', feed).latestMajor).toBe(45);
  });

  it('nudges about a newer patch of the same major', () => {
    const r = assess('45.4.1', feed);
    expect(r.findings.map((f) => f.kind)).toEqual(['patch']);
    expect(r.findings[0].text).toContain('45.5.0');
  });

  it('warns ahead of time on the oldest supported major, with a date', () => {
    const r = assess('43.8.13', feed);
    expect(r.supported).toBe(true);
    expect(r.findings.map((f) => f.kind)).toEqual(['last-supported', 'new-major']);
    expect(r.findings[0].text).toContain('2026-12-15'); // 45.0.0 + 8 weeks
  });

  it('fails once the major is out of support', () => {
    const r = assess('42.11.18', feed);
    expect(r.supported).toBe(false);
    expect(r.findings[0]).toMatchObject({ kind: 'unsupported', urgent: true });
  });
});

describe('npm audit', () => {
  const audit = {
    vulnerabilities: {
      minimatch: {
        severity: 'moderate',
        via: [
          { url: 'https://github.com/advisories/GHSA-aaaa', severity: 'moderate', title: 'ReDoS' },
        ],
      },
      'app-builder-lib': { severity: 'moderate', via: ['minimatch'] },
      lodash: {
        severity: 'high',
        via: [
          { url: 'https://github.com/advisories/GHSA-bbbb', severity: 'high', title: 'Pollution' },
        ],
      },
    },
  };
  const found = advisories(audit);

  it('lists each advisory once, at its source', () => {
    expect(found.map((a) => `${a.id} ${a.name}`)).toEqual([
      'GHSA-aaaa minimatch',
      'GHSA-bbbb lodash',
    ]);
  });

  it('fails on high, reports moderate', () => {
    const r = judge(found, [], '2026-11-25');
    expect(r.failing.map((a) => a.id)).toEqual(['GHSA-bbbb']);
    expect(r.notes.map((a) => a.id)).toEqual(['GHSA-aaaa']);
  });

  it('passes a high one with a current exception, and fails once it expires', () => {
    const ex = [{ id: 'GHSA-bbbb', reason: 'build tool only', until: '2026-12-31' }];
    expect(judge(found, ex, '2026-11-25')).toMatchObject({ failing: [], expired: [] });
    const later = judge(found, ex, '2027-01-01');
    expect(later.failing.map((a) => a.id)).toEqual(['GHSA-bbbb']);
    expect(later.expired).toHaveLength(1);
  });
});
