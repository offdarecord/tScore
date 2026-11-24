import { Alert, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { AppError, BackupStatus, OpenEvent, Outcome } from '../../../shared/ipc';

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

/**
 * Event setup's "Saving and backup": where the event is saved, its automatic backups, and an
 * optional second place for a copy of every backup (a USB stick or another drive).
 */
export function BackupCard({ event }: { event: OpenEvent }) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void window.tscore.backupStatus().then((r) => {
      if (r.ok) setStatus(r.value);
      else setError(r.error);
    });
  }, [event]);

  async function run(call: Promise<Outcome<BackupStatus | null>>, done: string) {
    setError(null);
    setNote(null);
    const r = await call;
    if (!r.ok) setError(r.error);
    else if (r.value) {
      setStatus(r.value);
      setNote(done);
    }
  }

  if (!status) return error ? <Problem error={error} /> : null;
  const missing = status.secondPlace !== undefined && status.secondPlaceAvailable === false;

  return (
    <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="backup-heading">
      <Stack gap="md">
        <Title order={2} size="h3" id="backup-heading">
          Saving and backup
        </Title>
        <div>
          <Text fw={600}>Event saved in</Text>
          <Text style={{ wordBreak: 'break-all' }}>{status.folder}</Text>
          <Text size="sm" c="dimmed">
            Saved as each change is made. Nothing to set.
          </Text>
        </div>
        <div>
          <Text fw={600}>Automatic backups</Text>
          <Text>
            A backup is made within five minutes of a change, and when the event closes. The newest
            20 are kept in the event&apos;s backups folder ({status.backups} there now
            {status.lastAt ? `; last made ${clock(status.lastAt)}` : ''}).
          </Text>
        </div>
        <div>
          <Text fw={600}>Second copy</Text>
          <Text>
            {status.secondPlace
              ? `Every backup is also copied to ${status.secondPlace}.`
              : 'None. Choose a USB stick or another drive, so a dead laptop doesn’t take the event with it.'}
          </Text>
        </div>
        {missing && (
          <Alert color="red" role="alert">
            {status.secondPlace} isn&apos;t available. Is the USB stick plugged in? Scoring still
            works, but there&apos;s no second copy.
          </Alert>
        )}
        {status.problem && !missing && (
          <Alert color="red" role="alert">
            {status.problem}
          </Alert>
        )}
        {error && <Problem error={error} />}
        {note && (
          <Text size="sm" role="status">
            {note}
          </Text>
        )}
        <Group gap="sm">
          <Button
            variant="default"
            onClick={() => void run(window.tscore.backupNow(), 'Backup made.')}
          >
            Back up now
          </Button>
          <Button
            variant="default"
            onClick={() =>
              void run(
                window.tscore.chooseBackupPlace(),
                'Second copy set, and a backup made there.',
              )
            }
          >
            {status.secondPlace ? 'Change second copy…' : 'Choose second copy…'}
          </Button>
          {status.secondPlace && (
            <Button
              variant="subtle"
              color="gray"
              onClick={() => void run(window.tscore.clearBackupPlace(), 'No second copy.')}
            >
              No second copy
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

function Problem({ error }: { error: AppError }) {
  return (
    <Alert color="red" role="alert">
      {error.message}{' '}
      <Text span c="dimmed" size="sm">
        ({error.code})
      </Text>
    </Alert>
  );
}
