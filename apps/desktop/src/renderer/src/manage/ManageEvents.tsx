import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  List,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { AppError, ManagedEventInfo, ManageView } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';
import { formatDate } from '../format';
import { formatBytes, totalBytes } from './manageLogic';

export type ManageAction = 'remove' | 'delete';

interface Props {
  /** Events to tick on arrival (from the home screen's prompt or a row's ⋯ menu). */
  readonly preselect?: readonly string[];
  /** A dialog to open on arrival for the ticked events. */
  readonly action?: ManageAction;
  readonly onBack: () => void;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );

/**
 * Manage events: every event folder on this laptop with the space it uses, and tidying up old
 * ones. Remove card scans keeps a small copy of each card; Delete event goes to the Recycle Bin.
 */
export function ManageEvents({ preselect, action, onBack }: Props) {
  const [view, setView] = useState<ManageView | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(preselect ?? []));
  const [sort, setSort] = useState<'date' | 'size'>('date');
  const [dialog, setDialog] = useState<ManageAction | null>(action ?? null);
  const [done, setDone] = useState<string | null>(null);

  const load = () =>
    void window.tscore.manageEvents().then((r) => (r.ok ? setView(r.value) : setError(r.error)));
  useEffect(load, []);

  const events = useMemo(() => {
    const list = [...(view?.events ?? [])];
    return sort === 'size'
      ? list.sort((a, b) => totalBytes(b) - totalBytes(a))
      : list.sort((a, b) => (b.firstDate ?? '').localeCompare(a.firstDate ?? ''));
  }, [view, sort]);
  const chosen = events.filter((e) => picked.has(e.folder) && !e.open);
  const total = events.reduce((n, e) => n + totalBytes(e), 0);
  const cards = events.reduce((n, e) => n + e.cardBytes, 0);

  const toggle = (folder: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  const finished = (words: string, next: ManageView | null = null) => {
    setDialog(null);
    setPicked(new Set());
    setDone(words);
    if (next) setView(next);
    else load();
  };

  return (
    <Stack gap="lg" maw={1200} mx="auto" py="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Button variant="subtle" px={0} onClick={onBack}>
            ← All events
          </Button>
          <Title order={2}>Manage events</Title>
          <Text c="dimmed" maw={760}>
            Every event on this laptop and the space it uses. Tidy up old ones: remove their card
            scans (a small copy of each card is kept), or delete the whole event to the Recycle Bin.
          </Text>
        </div>
      </Group>

      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      {done && (
        <Alert color="green" role="status" withCloseButton onClose={() => setDone(null)}>
          {done}
        </Alert>
      )}

      {view && (
        <Paper withBorder radius="md" p="lg" component="section" aria-label="Events on this laptop">
          <Group justify="space-between" wrap="wrap" mb="md">
            <Text fw={700} fz="lg">
              {events.length === 1 ? '1 event' : `${events.length} events`} use {formatBytes(total)}
              <Text span c="dimmed" fw={400}>
                {' '}
                ({formatBytes(cards)} of it card photos)
              </Text>
            </Text>
            <Group gap="sm">
              <SegmentedControl
                aria-label="Sort by"
                value={sort}
                onChange={(v) => setSort(v as 'date' | 'size')}
                data={[
                  { value: 'date', label: 'Newest first' },
                  { value: 'size', label: 'Biggest first' },
                ]}
              />
            </Group>
          </Group>

          {events.length === 0 ? (
            <Text c="dimmed">No events on this laptop yet.</Text>
          ) : (
            <Table.ScrollContainer minWidth={900}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={40}>
                      <Checkbox
                        aria-label="Tick every event"
                        checked={
                          chosen.length > 0 &&
                          chosen.length === events.filter((e) => !e.open).length
                        }
                        indeterminate={
                          chosen.length > 0 && chosen.length < events.filter((e) => !e.open).length
                        }
                        onChange={(e) =>
                          setPicked(
                            new Set(
                              e.currentTarget.checked
                                ? events.filter((x) => !x.open).map((x) => x.folder)
                                : [],
                            ),
                          )
                        }
                      />
                    </Table.Th>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th ta="right">Card photos</Table.Th>
                    <Table.Th ta="right">Everything else</Table.Th>
                    <Table.Th>Second copy</Table.Th>
                    <Table.Th>
                      <VisuallyHidden>Actions</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {events.map((e) => (
                    <Table.Tr key={e.folder}>
                      <Table.Td>
                        <Checkbox
                          aria-label={`Tick ${e.name}`}
                          disabled={e.open}
                          checked={picked.has(e.folder) && !e.open}
                          onChange={() => toggle(e.folder)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Text fw={700}>{e.name}</Text>
                        <Group gap={6} mt={2}>
                          <Text size="sm" c="dimmed">
                            {e.code}
                          </Text>
                          {e.open && (
                            <Badge color="blue" variant="light">
                              Open: close it to tidy
                            </Badge>
                          )}
                          {e.final ? (
                            <Badge color="green" variant="light">
                              Results final
                            </Badge>
                          ) : (
                            <Badge color="gray" variant="light">
                              Not final
                            </Badge>
                          )}
                          {e.keep && (
                            <Badge color="gray" variant="outline">
                              Kept
                            </Badge>
                          )}
                          {e.scansRemovedAt && (
                            <Badge color="gray" variant="outline">
                              Scans removed {when(e.scansRemovedAt)}
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>{e.firstDate ? formatDate(e.firstDate) : '–'}</Table.Td>
                      <Table.Td ta="right">
                        {formatBytes(e.cardBytes)}
                        <Text size="xs" c="dimmed">
                          {e.cardFiles === 1 ? '1 file' : `${e.cardFiles} files`}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">{formatBytes(e.otherBytes)}</Table.Td>
                      <Table.Td>
                        {e.lastSecondCopy ? (
                          when(e.lastSecondCopy)
                        ) : (
                          <Text size="sm" c="dimmed">
                            {view.secondPlaceChosen ? 'None found' : 'No second place'}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button
                            variant="default"
                            size="xs"
                            aria-label={`Show in folder: ${e.name}`}
                            onClick={() => void window.tscore.showEventFolder(e.folder)}
                          >
                            Show in folder
                          </Button>
                          {!e.keep && !e.open && (
                            <Button
                              variant="subtle"
                              size="xs"
                              aria-label={`Keep ${e.name}: don't offer it for tidying`}
                              onClick={() =>
                                void window.tscore
                                  .keepEvent(e.folder)
                                  .then((r) => (r.ok ? setView(r.value) : setError(r.error)))
                              }
                            >
                              Keep
                            </Button>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

          <Group gap="sm" mt="md">
            <Button
              variant="default"
              disabled={chosen.length === 0}
              onClick={() => setDialog('remove')}
            >
              Remove card scans…
            </Button>
            <Button
              color="red"
              variant="light"
              disabled={chosen.length === 0}
              onClick={() => setDialog('delete')}
            >
              {chosen.length > 1 ? `Delete ${chosen.length} events…` : 'Delete event…'}
            </Button>
            <Text size="sm" c="dimmed">
              {chosen.length === 0
                ? 'Tick events to tidy them.'
                : `${chosen.length === 1 ? '1 event' : `${chosen.length} events`} ticked, ${formatBytes(chosen.reduce((n, e) => n + totalBytes(e), 0))}.`}
            </Text>
          </Group>
        </Paper>
      )}

      {dialog === 'remove' && chosen.length > 0 && (
        <RemoveScansDialog
          events={chosen}
          onClose={() => setDialog(null)}
          onDone={(images, bytes) =>
            finished(
              `Card scans removed: ${images === 1 ? '1 photo' : `${images} photos`} shrunk to small copies, ${formatBytes(bytes)} freed.`,
            )
          }
          onError={setError}
        />
      )}
      {dialog === 'delete' && chosen.length > 0 && (
        <DeleteDialog
          events={chosen}
          secondPlaceChosen={view?.secondPlaceChosen ?? false}
          onClose={() => setDialog(null)}
          onDone={(n) =>
            finished(
              `${n === 1 ? '1 event' : `${n} events`} moved to the Recycle Bin. Restore from there if it was a mistake.`,
            )
          }
          onError={setError}
        />
      )}
    </Stack>
  );
}

function RemoveScansDialog(props: {
  events: ManagedEventInfo[];
  onClose: () => void;
  onDone: (images: number, bytes: number) => void;
  onError: (e: AppError) => void;
}) {
  const [busy, setBusy] = useState(false);
  const notFinal = props.events.filter((e) => !e.final);
  const bytes = props.events.reduce((n, e) => n + e.cardBytes, 0);
  return (
    <Modal
      opened
      onClose={props.onClose}
      title="Remove card scans"
      size="lg"
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <Stack gap="md">
        <Text>
          Card photos for{' '}
          {props.events.length === 1 ? (
            <strong>{props.events[0]?.name}</strong>
          ) : (
            `${props.events.length} events`
          )}{' '}
          ({formatBytes(bytes)}) are shrunk to small copies.
        </Text>
        <List size="sm" spacing={4}>
          <List.Item>
            <strong>Kept:</strong> riders, every score, the audit log, results (PDF, CSV) and
            backups. Results can still be reopened and revised.
          </List.Item>
          <List.Item>
            <strong>Lost:</strong> the full-size photos. Scores stay, but if a result is questioned
            you&apos;ll only have a small copy of the card to look at.
          </List.Item>
        </List>
        {notFinal.length > 0 && (
          <Alert color="yellow" title="Results aren't final">
            {notFinal.map((e) => e.name).join(', ')} {notFinal.length === 1 ? "hasn't" : "haven't"}{' '}
            had results marked final. Mark them final first if you can.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              setBusy(true);
              void window.tscore.removeCardScans(props.events.map((e) => e.folder)).then((r) => {
                setBusy(false);
                if (r.ok) props.onDone(r.value.images, r.value.bytesFreed);
                else {
                  props.onError(r.error);
                  props.onClose();
                }
              });
            }}
          >
            Remove card scans
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function DeleteDialog(props: {
  events: ManagedEventInfo[];
  secondPlaceChosen: boolean;
  onClose: () => void;
  onDone: (deleted: number) => void;
  onError: (e: AppError) => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const one = props.events.length === 1 ? props.events[0] : undefined;
  const ready = one
    ? typed.trim().toUpperCase() === one.code.toUpperCase()
    : typed.trim() === String(props.events.length);

  return (
    <Modal
      opened
      onClose={props.onClose}
      title={one ? `Delete ${one.name}` : `Delete ${props.events.length} events`}
      size="lg"
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <Stack gap="md">
        <Text>
          The whole event folder goes to the <strong>Windows Recycle Bin</strong>: riders, every
          score, card photos, results and the event&apos;s own backups. Until the bin is emptied it
          can be put back from there. Backups on a second place (USB) aren&apos;t touched.
        </Text>
        <Stack gap="xs">
          {props.events.map((e) => (
            <Paper key={e.folder} withBorder radius="sm" p="sm">
              <Group justify="space-between" wrap="wrap" gap="xs">
                <div>
                  <Text fw={700}>
                    {e.name}{' '}
                    <Text span c="dimmed" fw={400}>
                      {e.code}
                    </Text>
                  </Text>
                  <Text size="sm">
                    {e.final ? 'Results marked final.' : "Results aren't marked final."}{' '}
                    {e.lastSecondCopy
                      ? `Backup on the second place from ${when(e.lastSecondCopy)}.`
                      : props.secondPlaceChosen
                        ? 'No backup found on the second place.'
                        : 'No second place for backups is set up.'}
                  </Text>
                  {saved[e.folder] && (
                    <Text size="sm" c="green.8" role="status">
                      Copy saved: {saved[e.folder]}
                    </Text>
                  )}
                </div>
                <Button
                  variant="default"
                  size="xs"
                  onClick={() =>
                    void window.tscore.saveEventCopy(e.folder).then((r) => {
                      if (!r.ok) props.onError(r.error);
                      else if (r.value) {
                        const file = r.value.file;
                        setSaved((s) => ({ ...s, [e.folder]: file }));
                      }
                    })
                  }
                >
                  Save a copy first…
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
        <TextInput
          label={
            one
              ? `To confirm, type the event's code: ${one.code}`
              : `To confirm, type how many events: ${props.events.length}`
          }
          required
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
          maw={320}
          autoComplete="off"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={!ready}
            loading={busy}
            onClick={() => {
              setBusy(true);
              void window.tscore
                .deleteEvents(
                  props.events.map((e) => ({ folder: e.folder, code: one ? typed : e.code })),
                )
                .then((r) => {
                  setBusy(false);
                  if (r.ok) props.onDone(r.value.deleted);
                  else {
                    props.onError(r.error);
                    props.onClose();
                  }
                });
            }}
          >
            {one ? `Delete ${one.name}` : `Delete ${props.events.length} events`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
