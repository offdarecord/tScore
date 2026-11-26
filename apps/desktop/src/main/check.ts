/**
 * The pre-event check (mock-up "Check"): run on arrival at the venue, before the first card.
 * Each item is worked out from what tScore already has, and says what to do if it isn't right.
 * The camera check comes with scanning.
 */
import { validateEventSetup } from '@tscore/core';
import type { EventStore } from '@tscore/store';
import type { CheckItem, PreEventCheck } from '../shared/ipc';
import { backupStatus } from './backups';
import { t } from './i18n';
import { labelsView } from './labels';

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
          title: t('checkItem.setup'),
          detail: !valid.ok
            ? t('checkItem.problems', {
                count: valid.issues.length,
                first: valid.issues[0]?.message ?? '',
              })
            : undated > 0
              ? t('checkItem.undated')
              : t('checkItem.noLaps'),
          fix: 'setup',
        }
      : {
          id: 'setup',
          state: 'ok',
          title: t('checkItem.setup'),
          detail: t('checkItem.setupOk', {
            days: t('checkItem.days', { count: setup.days.length }),
            classes: t('checkItem.classes', { count: riding }),
            times: setup.days.map((d) => d.start_time ?? '?').join(t('checkItem.and')),
          }),
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
      title: t('checkItem.riders'),
      detail: t('checkItem.noRiders'),
      fix: 'riders',
    });
  } else if (unknown.length > 0) {
    items.push({
      id: 'riders',
      state: 'problem',
      title: t('checkItem.riders'),
      detail: t('checkItem.unknownClass', {
        riders: t('checkItem.riderCount', { count: unknown.length }),
        numbers: unknown
          .slice(0, 5)
          .map((s) => s.number)
          .join(', '),
      }),
      fix: 'riders',
    });
  } else {
    const classes = new Set(entries.map((e) => e.classes[0])).size;
    items.push({
      id: 'riders',
      state: 'ok',
      title: t('checkItem.riders'),
      detail: t('checkItem.ridersOk', {
        riders: t('checkItem.riderCount', { count: entries.length }),
        classes: t('checkItem.classes', { count: classes }),
      }),
    });
  }
  const wanted = labels.printed + labels.notPrinted;
  items.push(
    entries.length === 0
      ? {
          id: 'labels',
          state: 'info',
          title: t('checkItem.labels'),
          detail: t('checkItem.labelsLater'),
        }
      : labels.notPrinted === 0
        ? {
            id: 'labels',
            state: 'ok',
            title: t('checkItem.labels'),
            detail: t('checkItem.allPrinted', {
              labels: t('checkItem.labelCount', { count: wanted }),
            }),
          }
        : {
            id: 'labels',
            state: 'warning',
            title: t('checkItem.labels'),
            detail:
              labels.printed === 0
                ? t('checkItem.nonePrinted', {
                    labels: t('checkItem.labelCount', { count: labels.notPrinted }),
                  })
                : t('checkItem.notPrinted', {
                    labels: t('checkItem.labelCount', { count: labels.notPrinted }),
                  }),
            fix: 'labels',
          },
  );

  // 4. The clock: lap times and "overdue" depend on it.
  const eventDay = setup.days.find((d) => d.date === todayIso(now));
  items.push({
    id: 'clock',
    state: eventDay ? 'ok' : 'warning',
    title: t('checkItem.clock'),
    detail: eventDay
      ? t('checkItem.clockOk', { day: eventDay.day })
      : t('checkItem.clockWrong', { dates: setup.days.map((d) => d.date ?? '?').join(', ') }),
    clock: now.toISOString(),
  });

  // 5. Backups: a second copy, off this laptop.
  const backup = backupStatus(store);
  items.push(
    !backup.secondPlace
      ? {
          id: 'backups',
          state: 'warning',
          title: t('checkItem.backups'),
          detail: t('checkItem.backupLocal'),
          fix: 'backup',
        }
      : backup.secondPlaceAvailable
        ? {
            id: 'backups',
            state: 'ok',
            title: t('checkItem.backups'),
            detail: t('checkItem.backupOk', { place: backup.secondPlace }),
          }
        : {
            id: 'backups',
            state: 'problem',
            title: t('checkItem.backups'),
            detail: t('checkItem.backupMissing', { place: backup.secondPlace }),
            fix: 'backup',
          },
  );

  const problems = items.filter((i) => i.state === 'problem').length;
  const warnings = items.filter((i) => i.state === 'warning').length;
  return {
    items,
    summary:
      problems > 0
        ? t('checkItem.toFix', { things: t('checkItem.thing', { count: problems }) })
        : warnings > 0
          ? t('checkItem.toLook', { things: t('checkItem.thing', { count: warnings }) })
          : t('checkItem.ready'),
    ready: problems === 0,
  };
}
