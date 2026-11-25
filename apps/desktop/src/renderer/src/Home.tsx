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
  /** Manage events, with these events ticked and optionally a dialog open. */
  readonly onManage: (preselect?: string[], action?: ManageAction) => void;
  readonly onOpened: (event: OpenEvent) => void;
}

/** The start screen: no event open. New event, open one, or pick up a recent one. */
export function Home({ info, onNew, onSeries, onManage, onOpened }: Props) {
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
        <Title order={2}>{recent?.length ? 'Events' : 'No event open'}</Title>
        <Group gap="sm">
          <Button onClick={onNew}>New event</Button>
          <Button variant="default" onClick={() => void opened(window.tscore.openEventFile())}>
            Open event file…
          </Button>
          <Button variant="default" onClick={() => void restore()}>
            Restore from backup…
          </Button>
          <Button variant="default" onClick={onSeries}>
            Series points
          </Button>
          <Button variant="default" onClick={() => onManage()}>
            Manage events
          </Button>
        </Group>
      </Group>

      {error && (
        <ErrorAlert error={error} title="The event didn't open" onClose={() => setError(null)} />
      )}

      {old.length > 0 && (
        <Alert color="gray" title="Tidy up old events?" role="status">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text size="sm">
              {old.length === 1 ? '1 event is' : `${old.length} events are`} over a month old and
              use {formatBytes(old.reduce((n, e) => n + totalBytes(e), 0))}.
            </Text>
            <Group gap="sm">
              <Button size="xs" onClick={() => onManage(old.map((e) => e.folder))}>
                Review in Manage events
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => void window.tscore.remindTidyLater().then(() => setOld([]))}
              >
                Remind me later
              </Button>
            </Group>
          </Group>
        </Alert>
      )}

      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="recent-heading">
        <Title order={3} id="recent-heading" mb="sm">
          Recent events
        </Title>
        {recent === null ? null : recent.length === 0 ? (
          <Text c="dimmed">
            No events yet. Start with <strong>New event</strong>; it takes a couple of minutes.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>
                    <VisuallyHidden>Actions</VisuallyHidden>
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
                        {r.days > 1 ? ` · ${r.days} days` : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td>{r.date ? formatDate(r.date) : '–'}</Table.Td>
                    <Table.Td ta="right">
                      {r.missing ? (
                        <Group justify="flex-end" gap="sm">
                          <Badge color="gray" variant="light" title={r.folder}>
                            Can't find its folder
                          </Badge>
                          <Button
                            variant="default"
                            aria-label={`Remove ${r.name} from this list`}
                            onClick={() => void window.tscore.forgetEvent(r.folder).then(refresh)}
                          >
                            Remove from list
                          </Button>
                        </Group>
                      ) : (
                        <Group justify="flex-end" gap="xs" wrap="nowrap">
                          <Button
                            aria-label={`Open ${r.name}`}
                            onClick={() => void opened(window.tscore.openRecentEvent(r.folder))}
                          >
                            Open
                          </Button>
                          <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                              <ActionIcon
                                variant="default"
                                size="lg"
                                aria-label={`More for ${r.name}`}
                              >
                                ⋯
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                onClick={() => void window.tscore.showEventFolder(r.folder)}
                              >
                                Show in folder
                              </Menu.Item>
                              <Menu.Item onClick={() => onManage([r.folder], 'remove')}>
                                Remove card scans…
                              </Menu.Item>
                              <Menu.Item color="red" onClick={() => onManage([r.folder], 'delete')}>
                                Delete event…
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item onClick={() => onManage()}>Manage events</Menu.Item>
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
        Works offline. New events are saved in {info?.eventsDir ?? 'Documents\\tScore'}.
      </Text>
    </Stack>
  );
}
