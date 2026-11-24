import { Alert, Button, Group, NativeSelect, Text } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import type { AppError, CourseView, Outcome } from '../../../shared/ipc';

/** How often the screens refresh on their own, so "overdue" keeps up with the clock. */
const REFRESH_MS = 30_000;

/** The course view for a day, refreshed every 30 s and whenever the window comes back. */
export function useCourse(changed: unknown) {
  const [day, setDay] = useState<number | undefined>(undefined);
  const [view, setView] = useState<CourseView | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const apply = useCallback((r: Outcome<CourseView>) => {
    if (r.ok) {
      setView(r.value);
      setError(null);
    } else setError(r.error);
  }, []);
  const load = useCallback(async () => apply(await window.tscore.course(day)), [apply, day]);

  useEffect(() => {
    void window.tscore.course(day).then(apply);
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [apply, day, load, changed]);

  return { view, error, setError, reload: load, setDay };
}

export function DayPicker(props: { view: CourseView; onChange: (day: number) => void }) {
  if (props.view.days.length < 2) return null;
  return (
    <NativeSelect
      label="Day"
      w={110}
      value={String(props.view.day)}
      data={props.view.days.map((d) => ({ value: String(d), label: `Day ${d}` }))}
      onChange={(e) => props.onChange(Number(e.currentTarget.value))}
    />
  );
}

export function ErrorAlert({ error, onClose }: { error: AppError; onClose?: () => void }) {
  return (
    <Alert color="red" role="alert" {...(onClose && { withCloseButton: true, onClose })}>
      {error.message}{' '}
      <Text span c="dimmed" size="sm">
        ({error.code})
      </Text>
    </Alert>
  );
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

export const minutes = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;

/**
 * Mark a rider DNF, with Undo. Uses the Riders screen's own change (logged). Overdue never marks
 * anyone DNF by itself; the desk decides.
 */
export function useDnf(reload: () => Promise<void>, onError: (e: AppError) => void) {
  const [done, setDone] = useState<{ number: number; name: string } | null>(null);

  async function mark(number: number, name: string) {
    const r = await window.tscore.updateRider(number, { status: 'dnf' });
    if (!r.ok) return onError(r.error);
    setDone({ number, name });
    await reload();
  }

  async function undo() {
    if (!done) return;
    const r = await window.tscore.updateRider(done.number, { status: 'riding' });
    if (!r.ok) return onError(r.error);
    setDone(null);
    await reload();
  }

  const flash = done ? (
    <Alert color="gray" role="status" withCloseButton onClose={() => setDone(null)}>
      <Group justify="space-between" wrap="wrap" gap="sm">
        <span>
          Rider {done.number} ({done.name}) marked DNF. Logged.
        </span>
        <Button variant="default" size="xs" onClick={() => void undo()}>
          Undo
        </Button>
      </Group>
    </Alert>
  ) : null;

  return { mark, flash };
}

/** "Mark DNF…", then a confirm step in place. */
export function MarkDnf(props: {
  number: number;
  name: string;
  onMark: (number: number, name: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="default" onClick={() => setAsking(true)}>
        Mark DNF…
      </Button>
    );
  }
  return (
    <Group gap="xs" wrap="nowrap">
      <Text fw={600} size="sm">
        Mark rider {props.number} DNF?
      </Text>
      <Button color="red.9" onClick={() => void props.onMark(props.number, props.name)}>
        Mark DNF
      </Button>
      <Button variant="default" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </Group>
  );
}
