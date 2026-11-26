import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Paper,
  Stack,
  Table,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type {
  AppError,
  AppInfo,
  ManagedEventInfo,
  OpenEvent,
  Outcome,
  RecentEventInfo,
} from '../../shared/ipc';
import { formatDate, today } from './format';
import type { ManageAction } from './manage/ManageEvents';
import { formatBytes, oldEvents, totalBytes } from './manage/manageLogic';
import { ErrorAlert } from './ErrorAlert';

interface Props {
  readonly info: AppInfo | null;
  readonly onNew: () => void;
  readonly onSeries: () => void;
  readonly onCardTypes: () => void;
  /** Manage events, with these events ticked and optionally a dialog open. */
  readonly onManage: (preselect?: string[], action?: ManageAction) => void;
  readonly onOpened: (event: OpenEvent) => void;
}

/** The start screen: no event open. New event, open one, or pick up a recent one. */
export function Home({ info, onNew, onSeries, onCardTypes, onManage, onOpened }: Props) {
  const { t } = useTranslation();
  const [recent, setRecent] = useState<RecentEventInfo[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const [old, setOld] = useState<ManagedEventInfo[]>([]);

  const refresh = () => {
    void window.tscore.recentEvents().then(setRecent);
    void window.tscore
      .manageEvents()
      .then((r) => setOld(r.ok ? oldEvents(r.value, today(), new Date()) : []));
  };
  useEffect(refresh, []);

  async function opened(outcome: Promise<Outcome<OpenEvent | null>>) {
    const r = await outcome;
    if (!r.ok) {
      setError(r.error);
      refresh();
    } else if (r.value) onOpened(r.value);
  }

  /** A backup opens as a new event folder; nothing existing is touched. */
  async function restore() {
    const r = await window.tscore.restoreFromBackup();
    if (!r.ok) {
      setError(r.error);
      refresh();
    } else if (r.value) onOpened(r.value.event);
  }

  return (
    <Stack gap="xl" maw={1040} mx="auto" py="lg">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>{recent?.length ? t('home.events') : t('home.noEventOpen')}</Title>
        <Group gap="sm">
          <Button onClick={onNew}>{t('home.newEvent')}</Button>
          <Button variant="default" onClick={() => void opened(window.tscore.openEventFile())}>
            {t('home.openFile')}
          </Button>
          <Button variant="default" onClick={() => void restore()}>
            {t('home.restore')}
          </Button>
          <Button variant="default" onClick={onSeries}>
            {t('home.series')}
          </Button>
          <Button variant="default" onClick={() => onManage()}>
            {t('home.manage')}
          </Button>
          <Button variant="default" onClick={onCardTypes}>
            {t('home.cardTypes')}
          </Button>
        </Group>
      </Group>

      {error && (
        <ErrorAlert error={error} title={t('home.didntOpen')} onClose={() => setError(null)} />
      )}

      {old.length > 0 && (
        <Alert color="gray" title={t('home.tidyTitle')} role="status">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text size="sm">
              {t('home.tidyOld', {
                count: old.length,
                size: formatBytes(old.reduce((n, e) => n + totalBytes(e), 0)),
              })}
            </Text>
            <Group gap="sm">
              <Button size="xs" onClick={() => onManage(old.map((e) => e.folder))}>
                {t('home.tidyReview')}
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => void window.tscore.remindTidyLater().then(() => setOld([]))}
              >
                {t('home.remindLater')}
              </Button>
            </Group>
          </Group>
        </Alert>
      )}

      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="recent-heading">
        <Title order={3} id="recent-heading" mb="sm">
          {t('home.recent')}
        </Title>
        {recent === null ? null : recent.length === 0 ? (
          <Text c="dimmed">
            <Trans i18nKey="home.none" components={{ strong: <strong /> }} />
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('home.event')}</Table.Th>
                  <Table.Th>{t('home.date')}</Table.Th>
                  <Table.Th>
                    <VisuallyHidden>{t('home.actions')}</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recent.map((r) => (
                  <Table.Tr key={r.folder}>
                    <Table.Td>
                      <Text fw={700}>{r.name}</Text>
                      <Text size="sm" c="dimmed">
                        {r.code}
                        {r.days > 1 ? t('home.days', { count: r.days }) : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td>{r.date ? formatDate(r.date) : '–'}</Table.Td>
                    <Table.Td ta="right">
                      {r.missing ? (
                        <Group justify="flex-end" gap="sm">
                          <Badge color="gray" variant="light" title={r.folder}>
                            {t('home.missing')}
                          </Badge>
                          <Button
                            variant="default"
                            aria-label={t('home.forgetLabel', { name: r.name })}
                            onClick={() => void window.tscore.forgetEvent(r.folder).then(refresh)}
                          >
                            {t('home.forget')}
                          </Button>
                        </Group>
                      ) : (
                        <Group justify="flex-end" gap="xs" wrap="nowrap">
                          <Button
                            aria-label={t('home.openLabel', { name: r.name })}
                            onClick={() => void opened(window.tscore.openRecentEvent(r.folder))}
                          >
                            {t('home.open')}
                          </Button>
                          <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                              <ActionIcon
                                variant="default"
                                size="lg"
                                aria-label={t('home.more', { name: r.name })}
                              >
                                ⋯
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                onClick={() => void window.tscore.showEventFolder(r.folder)}
                              >
                                {t('home.showInFolder')}
                              </Menu.Item>
                              <Menu.Item onClick={() => onManage([r.folder], 'remove')}>
                                {t('home.removeScans')}
                              </Menu.Item>
                              <Menu.Item color="red" onClick={() => onManage([r.folder], 'delete')}>
                                {t('home.deleteEvent')}
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item onClick={() => onManage()}>{t('home.manage')}</Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Text size="sm" c="dimmed">
        {t('home.offline', { folder: info?.eventsDir ?? 'Documents\\tScore' })}
      </Text>
    </Stack>
  );
}
