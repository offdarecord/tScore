import { Alert, Anchor, Button, Group, Progress, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateState, UpdateStatus } from '../../shared/ipc';

const LATEST_RELEASE = 'https://github.com/offdarecord/tScore/releases/latest';

/** The update status, kept current as the main process reports changes. */
function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    void window.tscore.updateStatus().then(setStatus);
    return window.tscore.onUpdateStatus(setStatus);
  }, []);
  return [status, setStatus] as const;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

/**
 * Home's quiet note while an update downloads, once it's ready, and on the first start after
 * one installed. Home only shows with no event open, so this never shows during an event.
 */
export function UpdateNotice({ version }: { readonly version: string | undefined }) {
  const { t } = useTranslation();
  const [status] = useUpdateStatus();
  const state = status?.state;
  if (state?.kind === 'downloading') {
    return (
      <Alert
        color="gray"
        role="status"
        title={t('updates.downloading', { version: state.version })}
      >
        <Progress
          value={state.percent}
          aria-label={t('updates.progress', { percent: state.percent })}
        />
      </Alert>
    );
  }
  if (state?.kind === 'ready') {
    return (
      <Alert color="gray" role="status">
        {t('updates.ready', { version: state.version })}
      </Alert>
    );
  }
  if (status?.updatedFrom && version) {
    return (
      <Alert color="gray" role="status">
        {t('updates.installed', { version })}
      </Alert>
    );
  }
  return null;
}

const ANSWERS = {
  checking: 'updates.checking',
  latest: 'updates.latest',
  offline: 'updates.offline',
  eventOpen: 'updates.eventOpen',
} as const satisfies Partial<Record<UpdateState['kind'], string>>;

/** About's part: when tScore last checked, Check for updates, and how that went. */
export function UpdateAbout() {
  const { t } = useTranslation();
  const [status, setStatus] = useUpdateStatus();
  if (!status) return null;
  const { state } = status;

  if (state.kind === 'off') return <Text size="sm">{t('updates.off')}</Text>;
  if (state.kind === 'byHand') {
    return (
      <Text size="sm">
        {t('updates.byHand')}{' '}
        <Anchor href={LATEST_RELEASE} target="_blank">
          {t('updates.latestRelease')}
        </Anchor>
      </Text>
    );
  }

  const answer =
    state.kind === 'downloading'
      ? t('updates.downloadingPercent', { version: state.version, percent: state.percent })
      : state.kind === 'ready'
        ? t('updates.readyShort', { version: state.version })
        : state.kind === 'idle'
          ? null
          : t(ANSWERS[state.kind]);

  return (
    <Stack gap={4}>
      <Group gap="sm">
        <Button
          variant="default"
          size="xs"
          loading={state.kind === 'checking'}
          onClick={() => void window.tscore.checkForUpdates().then(setStatus)}
        >
          {t('updates.check')}
        </Button>
        <Text size="sm" role="status">
          {answer}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {status.lastChecked
          ? t('updates.lastChecked', { when: when(status.lastChecked) })
          : t('updates.neverChecked')}
      </Text>
    </Stack>
  );
}
