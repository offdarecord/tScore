import { describe, expect, it } from 'vitest';
import type { ManagedEventInfo, ManageView } from '../../../shared/ipc';
import { formatBytes, oldEvents } from './manageLogic';

const event = (code: string, firstDate: string, more: Partial<ManagedEventInfo> = {}) =>
  ({
    folder: `C:\\events\\${firstDate} ${code}`,
    name: `Example ${code}`,
    code,
    firstDate,
    lastDate: firstDate,
    days: 1,
    cardFiles: 40,
    cardBytes: 8_000_000,
    otherBytes: 1_000_000,
    final: true,
    open: false,
    keep: false,
    ...more,
  }) satisfies ManagedEventInfo;

const view = (events: ManagedEventInfo[], more: Partial<ManageView> = {}): ManageView => ({
  events,
  secondPlaceChosen: false,
  ...more,
});

const NOW = new Date('2027-03-15T09:00:00');

describe('which events are offered for tidying', () => {
  it('offers events whose last day is more than 30 days ago', () => {
    const v = view([event('OLD', '2027-02-01'), event('NEW', '2027-03-01')]);
    expect(oldEvents(v, '2027-03-15', NOW).map((e) => e.code)).toEqual(['OLD']);
  });

  it('goes by the last day of a two-day event', () => {
    const v = view([event('TWO', '2027-02-01', { lastDate: '2027-02-14', days: 2 })]);
    expect(oldEvents(v, '2027-03-15', NOW)).toEqual([]);
    expect(oldEvents(v, '2027-03-17', NOW).map((e) => e.code)).toEqual(['TWO']);
  });

  it('never offers the open event, a kept event, or one already tidied', () => {
    const v = view([
      event('OPN', '2027-01-01', { open: true }),
      event('KPT', '2027-01-01', { keep: true }),
      event('TDY', '2027-01-01', { scansRemovedAt: '2027-02-20T10:00:00Z' }),
    ]);
    expect(oldEvents(v, '2027-03-15', NOW)).toEqual([]);
  });

  it('offers nothing on an event day', () => {
    const v = view([event('OLD', '2027-01-01'), event('TOD', '2027-03-15')]);
    expect(oldEvents(v, '2027-03-15', NOW)).toEqual([]);
  });

  it('offers nothing until Remind me later runs out', () => {
    const v = view([event('OLD', '2027-01-01')], { remindAfter: '2027-04-10T00:00:00Z' });
    expect(oldEvents(v, '2027-03-15', NOW)).toEqual([]);
    expect(oldEvents(v, '2027-04-11', new Date('2027-04-11T09:00:00Z'))).toHaveLength(1);
  });
});

describe('sizes', () => {
  it('reads as a desk would say them', () => {
    expect(formatBytes(1_400_000_000)).toBe('1.4 GB');
    expect(formatBytes(320_400_000)).toBe('320 MB');
    expect(formatBytes(12_300)).toBe('12 KB');
    expect(formatBytes(512)).toBe('512 bytes');
  });
});
