import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import type { AppError, AppInfo, OpenEvent, Outcome, RecentEventInfo } from '../../shared/ipc';
import { ComingSoonButton } from './ComingSoonButton';
import { formatDate } from './format';

interface Props {
  readonly info: AppInfo | null;
  readonly onNew: () => void;
  readonly onOpened: (event: OpenEvent) => void;
}

/** The start screen: no event open. New event, open one, or pick up a recent one. */
export function Home({ info, onNew, onOpened }: Props) {
  const [recent, setRecent] = useState<RecentEventInfo[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = () => void window.tscore.recentEvents().then(setRecent);
  useEffect(refresh, []);

  async function opened(outcome: Promise<Outcome<OpenEvent | null>>) {
    const r = await outcome;
    if (!r.ok) {
      setError(r.error);
      refresh();
    } else if (r.value) onOpened(r.value);
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
          <ComingSoonButton variant="default">Restore from backup</ComingSoonButton>
        </Group>
      </Group>

      {error && (
        <Alert
          color="red"
          title="The event didn't open"
          withCloseButton
          onClose={() => setError(null)}
        >
          {error.message}{' '}
          <Text span c="dimmed" size="sm">
            ({error.code})
          </Text>
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
                        <Button
                          aria-label={`Open ${r.name}`}
                          onClick={() => void opened(window.tscore.openRecentEvent(r.folder))}
                        >
                          Open
                        </Button>
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
