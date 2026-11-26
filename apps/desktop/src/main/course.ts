/**
 * Progress and "still on course" in the main process: worked out from the event as saved, at
 * this laptop's time. See `courseReport` in @tscore/core for the rules.
 */
import { courseReport, DEFAULT_OVERDUE_MARGIN_MINUTES, type CourseCard } from '@tscore/core';
import { StoreError, type EventStore } from '@tscore/store';
import type { CourseView } from '../shared/ipc';

/** A local date and time ("2027-02-06", "10:15") as ms, or undefined if either is missing. */
function localTime(date: string | undefined, time: string | undefined): number | undefined {
  if (!date || !time) return undefined;
  const ms = new Date(`${date}T${time}:00`).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

function todayIso(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function courseView(store: EventStore, requestedDay?: number, now = new Date()): CourseView {
  const setup = store.setup;
  const days = setup.days.map((d) => d.day);
  if (requestedDay !== undefined && !days.includes(requestedDay)) {
    throw new StoreError('APP_BAD_REQUEST', 'That day isn’t in this event.', {
      key: 'errors.APP_BAD_REQUEST_2',
    });
  }
  // The day being ridden today, else the first day.
  const day = requestedDay ?? setup.days.find((d) => d.date === todayIso(now))?.day ?? days[0] ?? 1;
  const setupDay = setup.days.find((d) => d.day === day);
  const start = localTime(setupDay?.date, setupDay?.start_time);
  const margin = setup.overdue_margin_minutes ?? DEFAULT_OVERDUE_MARGIN_MINUTES;

  const cards: CourseCard[] = store.cardLog().map((c) => ({
    number: c.number,
    day: c.day,
    lap: c.lap,
    at: Date.parse(c.receivedAt),
    total: c.scores.every((s) => s !== null)
      ? c.scores.reduce<number>((a, s) => a + (s ?? 0), 0)
      : null,
  }));
  const entries = store.entries();
  const report = courseReport(setup, entries, cards, {
    day,
    now: now.getTime(),
    marginMinutes: margin,
    ...(start !== undefined && { start }),
  });
  const names = new Map(
    entries.map((e) => [
      e.number,
      e.riders.map((r) => `${r.givenName} ${r.familyName}`.trim()).join(' / '),
    ]),
  );

  return {
    day,
    days,
    ...(setupDay?.start_time && { startTime: setupDay.start_time }),
    started: start === undefined || now.getTime() >= start,
    now: now.toISOString(),
    marginMinutes: margin,
    mostLaps: report.mostLaps,
    counts: report.counts,
    averageLap: report.averageLap,
    riders: report.riders
      .filter((r) => r.state !== 'not_riding')
      .map((r) => ({
        number: r.number,
        name: names.get(r.number) ?? '',
        className: r.className,
        state: r.state,
        laps: r.laps,
        total: r.total,
        lapStates: r.lapStates.map((l) =>
          l.kind === 'in' ? { kind: 'in' as const, total: l.total } : { kind: l.kind },
        ),
        ...(r.lastCard && {
          lastCard: { lap: r.lastCard.lap, at: new Date(r.lastCard.at).toISOString() },
        }),
        ...(r.minutesOut !== undefined && { minutesOut: r.minutesOut }),
        ...(r.overdue && { overdue: r.overdue }),
        ...(r.carrying !== undefined && { carrying: r.carrying }),
      })),
  };
}
