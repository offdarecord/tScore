import { Alert, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppError, BackupStatus, OpenEvent, Outcome } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';

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
  const { t } = useTranslation();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);

  useEffect(() => {
    void window.tscore.backupStatus().then((r) => {
      if (r.ok) setStatus(r.value);
      else setError(r.error);
    });
  }, [event]);

  async function saveForMove() {
    setError(null);
    setNote(null);
    setMoved(null);
    const r = await window.tscore.saveForMove();
    if (!r.ok) setError(r.error);
    else if (r.value) {
      const mb = (r.value.bytes / 1_000_000).toFixed(1);
      setMoved(t('backup.moved', { file: r.value.file, mb }));
    }
  }

  async function run(call: Promise<Outcome<BackupStatus | null>>, done: string) {
    setError(null);
    setNote(null);
    setMoved(null);
    const r = await call;
    if (!r.ok) setError(r.error);
    else if (r.value) {
      setStatus(r.value);
      setNote(done);
    }
  }

  if (!status) return error ? <ErrorAlert error={error} /> : null;
  const missing = status.secondPlace !== undefined && status.secondPlaceAvailable === false;

  return (
    <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="backup-heading">
      <Stack gap="md">
        <Title order={2} size="h3" id="backup-heading">
          {t('backup.title')}
        </Title>
        <div>
          <Text fw={600}>{t('backup.savedIn')}</Text>
          <Text style={{ wordBreak: 'break-all' }}>{status.folder}</Text>
          <Text size="sm" c="dimmed">
            {t('backup.savedAsYouGo')}
          </Text>
        </div>
        <div>
          <Text fw={600}>{t('backup.auto')}</Text>
          <Text>
            {t('backup.autoHelp', {
              count: status.backups,
              last: status.lastAt ? t('backup.lastMade', { time: clock(status.lastAt) }) : '',
            })}
          </Text>
        </div>
        <div>
          <Text fw={600}>{t('backup.second')}</Text>
          <Text>
            {status.secondPlace
              ? t('backup.secondTo', { place: status.secondPlace })
              : t('backup.secondNone')}
          </Text>
        </div>
        {missing && (
          <Alert color="red" role="alert">
            {t('backup.secondMissing', { place: status.secondPlace })}
          </Alert>
        )}
        {status.problem && !missing && (
          <Alert color="red" role="alert">
            {status.problem}
          </Alert>
        )}
        {error && <ErrorAlert error={error} />}
        {note && (
          <Text size="sm" role="status">
            {note}
          </Text>
        )}
        <Group gap="sm">
          <Button
            variant="default"
            onClick={() => void run(window.tscore.backupNow(), t('backup.made'))}
          >
            {t('backup.backUpNow')}
          </Button>
          <Button
            variant="default"
            onClick={() => void run(window.tscore.chooseBackupPlace(), t('backup.secondSet'))}
          >
            {status.secondPlace ? t('backup.changeSecond') : t('backup.chooseSecond')}
          </Button>
          {status.secondPlace && (
            <Button
              variant="subtle"
              color="gray"
              onClick={() => void run(window.tscore.clearBackupPlace(), t('backup.noSecondDone'))}
            >
              {t('backup.noSecond')}
            </Button>
          )}
        </Group>
        <div>
          <Text fw={600}>{t('backup.move')}</Text>
          <Text>{t('backup.moveHelp')}</Text>
        </div>
        {moved && (
          <Text size="sm" role="status" style={{ wordBreak: 'break-all' }}>
            {moved}
          </Text>
        )}
        <Group gap="sm">
          <Button variant="default" onClick={() => void saveForMove()}>
            {t('backup.saveForMove')}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
