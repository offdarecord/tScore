/**
 * The pre-event check (mock-up "Check"): run on arrival at the venue, before the first card.
 * Each item is worked out from what tScore already has, and says what to do if it isn't right.
 * The camera check comes with scanning.
 */
import { validateEventSetup } from '@tscore/core';
import type { EventStore } from '@tscore/store';
import type { CheckItem, PreEventCheck } from '../shared/ipc';
import { backupStatus } from './backups';
import { labelsView } from './labels';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function todayIso(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function preEventCheck(store: EventStore, now = new Date()): PreEventCheck {
  const setup = store.setup;
  const items: CheckItem[] = [];

  // 1. Event setup.
  const valid = validateEventSetup(setup);
  const undated = setup.days.filter((d) => !d.date).length;
  const riding = setup.classes.filter(
    (c) => c.scored !== false && Object.values(c.days).some((d) => d.laps > 0),
  ).length;
  items.push(
    !valid.ok || undated > 0 || riding === 0
      ? {
          id: 'setup',
          state: 'problem',
          title: 'Event setup',
          detail: !valid.ok
            ? `The setup has ${plural(valid.issues.length, 'problem')}: ${valid.issues[0]?.message ?? ''}`
            : undated > 0
              ? 'A day has no date.'
              : 'No class has any laps to ride.',
          fix: 'setup',
        }
      : {
          id: 'setup',
          state: 'ok',
          title: 'Event setup',
          detail: `${plural(setup.days.length, 'day')}, ${plural(riding, 'class', 'classes')} riding. Lap 1 starts at ${setup.days.map((d) => d.start_time ?? '?').join(' and ')}.`,
        },
  );

  // 2. Riders, and 3. card labels (the same plan tells us both).
  const entries = store.entries();
  const labels = labelsView(store, {
    layout: 'auto',
    start: 1,
    qr: true,
    minders: false,
    which: 'all',
  });
  const unknown = labels.skipped.filter((s) => s.reason === 'unknown_class');
  if (entries.length === 0) {
    items.push({
      id: 'riders',
      state: 'problem',
      title: 'Riders',
      detail: 'No riders yet. Import the entry list.',
      fix: 'riders',
    });
  } else if (unknown.length > 0) {
    items.push({
      id: 'riders',
      state: 'problem',
      title: 'Riders',
      detail: `${plural(unknown.length, 'rider')} in a class the setup doesn't have (rider ${unknown
        .slice(0, 5)
        .map((s) => s.number)
        .join(', ')}).`,
      fix: 'riders',
    });
  } else {
    const classes = new Set(entries.map((e) => e.classes[0])).size;
    items.push({
      id: 'riders',
      state: 'ok',
      title: 'Riders',
      detail: `${plural(entries.length, 'rider')} in ${plural(classes, 'class', 'classes')}.`,
    });
  }
  const wanted = labels.printed + labels.notPrinted;
  items.push(
    entries.length === 0
      ? {
          id: 'labels',
          state: 'info',
          title: 'Card labels',
          detail: 'Printed once riders are in.',
        }
      : labels.notPrinted === 0
        ? {
            id: 'labels',
            state: 'ok',
            title: 'Card labels',
            detail: `All ${plural(wanted, 'label')} printed.`,
          }
        : {
            id: 'labels',
            state: 'warning',
            title: 'Card labels',
            detail:
              labels.printed === 0
                ? `None printed yet (${plural(labels.notPrinted, 'label')}). Riders' cards can still be typed by number.`
                : `${plural(labels.notPrinted, 'label')} not printed yet: late entries or laps added since.`,
            fix: 'labels',
          },
  );

  // 4. The clock: lap times and "overdue" depend on it.
  const eventDay = setup.days.find((d) => d.date === todayIso(now));
  items.push({
    id: 'clock',
    state: eventDay ? 'ok' : 'warning',
    title: 'Clock',
    detail: eventDay
      ? `The laptop's date is day ${eventDay.day} of the event. Check its time is right: lap times and "overdue" depend on it.`
      : `Today isn't one of the event's dates (${setup.days.map((d) => d.date ?? '?').join(', ')}). If you're at the event, set the laptop's date and time before any card comes in.`,
    clock: now.toISOString(),
  });

  // 5. Backups: a second copy, off this laptop.
  const backup = backupStatus(store);
  items.push(
    !backup.secondPlace
      ? {
          id: 'backups',
          state: 'warning',
          title: 'Backups',
          detail:
            "Backups are kept on this laptop only. Choose a USB stick or another drive for a second copy, so a dead laptop doesn't take the event with it.",
          fix: 'backup',
        }
      : backup.secondPlaceAvailable
        ? {
            id: 'backups',
            state: 'ok',
            title: 'Backups',
            detail: `Every backup is also copied to ${backup.secondPlace}.`,
          }
        : {
            id: 'backups',
            state: 'problem',
            title: 'Backups',
            detail: `${backup.secondPlace} isn't available. Is the USB stick plugged in? Scoring still works, but there's no second copy.`,
            fix: 'backup',
          },
  );

  const problems = items.filter((i) => i.state === 'problem').length;
  const warnings = items.filter((i) => i.state === 'warning').length;
  return {
    items,
    summary:
      problems > 0
        ? `${plural(problems, 'thing')} to fix before the first card.`
        : warnings > 0
          ? `Ready, with ${plural(warnings, 'thing')} to look at.`
          : 'Ready for the first card.',
    ready: problems === 0,
  };
}
