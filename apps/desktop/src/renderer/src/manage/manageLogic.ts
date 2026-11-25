import type { ManagedEventInfo, ManageView } from '../../../shared/ipc';

/** Events older than this (by their last day) are offered for tidying. */
export const OLD_AFTER_DAYS = 30;

/** "1.4 GB", "320 MB", "12 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} bytes`;
}

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** An event's day (or days) includes `today` (YYYY-MM-DD). */
export function onToday(e: ManagedEventInfo, today: string): boolean {
  if (!e.firstDate) return false;
  const last = e.lastDate ?? e.firstDate;
  return e.firstDate <= today && today <= last;
}

/**
 * The events to offer for tidying on the home screen: last day more than 30 days ago, not open,
 * not kept, card photos not yet removed. None at all on an event day, or before "Remind me
 * later" runs out.
 */
export function oldEvents(view: ManageView, today: string, now: Date): ManagedEventInfo[] {
  if (view.remindAfter && now.getTime() < Date.parse(view.remindAfter)) return [];
  if (view.events.some((e) => onToday(e, today))) return [];
  const cutoff = dayNumber(today) - OLD_AFTER_DAYS;
  return view.events.filter((e) => {
    const last = e.lastDate ?? e.firstDate;
    return (
      last !== undefined &&
      dayNumber(last) < cutoff &&
      !e.open &&
      !e.keep &&
      e.scansRemovedAt === undefined
    );
  });
}

/** Total space an event uses. */
export const totalBytes = (e: ManagedEventInfo) => e.cardBytes + e.otherBytes;
