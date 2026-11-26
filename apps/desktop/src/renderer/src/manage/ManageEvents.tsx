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
import { Trans } from 'react-i18next';
import i18next, { isMac } from '../i18n';
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
            {i18next.t('manage.allEvents')}
          </Button>
          <Title order={2}>{i18next.t('manage.title')}</Title>
          <Text c="dimmed" maw={760}>
            {i18next.t('manage.intro', {
              bin: i18next.t(isMac ? 'manage.binMac' : 'manage.binWindows'),
            })}
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
        <Paper
          withBorder
          radius="md"
          p="lg"
          component="section"
          aria-label={i18next.t('manage.region')}
        >
          <Group justify="space-between" wrap="wrap" mb="md">
            <Text fw={700} fz="lg">
              {i18next.t('manage.total', { count: events.length, size: formatBytes(total) })}
              <Text span c="dimmed" fw={400}>
                {i18next.t('manage.ofCards', { size: formatBytes(cards) })}
              </Text>
            </Text>
            <Group gap="sm">
              <SegmentedControl
                aria-label={i18next.t('manage.sortBy')}
                value={sort}
                onChange={(v) => setSort(v as 'date' | 'size')}
                data={[
                  { value: 'date', label: i18next.t('manage.newest') },
                  { value: 'size', label: i18next.t('manage.biggest') },
                ]}
              />
            </Group>
          </Group>

          {events.length === 0 ? (
            <Text c="dimmed">{i18next.t('manage.none')}</Text>
          ) : (
            <Table.ScrollContainer minWidth={900}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={40}>
                      <Checkbox
                        aria-label={i18next.t('manage.tickAll')}
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
                    <Table.Th>{i18next.t('manage.event')}</Table.Th>
                    <Table.Th>{i18next.t('manage.date')}</Table.Th>
                    <Table.Th ta="right">{i18next.t('manage.cardPhotos')}</Table.Th>
                    <Table.Th ta="right">{i18next.t('manage.everythingElse')}</Table.Th>
                    <Table.Th>{i18next.t('manage.secondCopy')}</Table.Th>
                    <Table.Th>
                      <VisuallyHidden>{i18next.t('manage.actions')}</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {events.map((e) => (
                    <Table.Tr key={e.folder}>
                      <Table.Td>
                        <Checkbox
                          aria-label={i18next.t('manage.tick', { name: e.name })}
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
                              {i18next.t('manage.openBadge')}
                            </Badge>
                          )}
                          {e.final ? (
                            <Badge color="green" variant="light">
                              {i18next.t('manage.finalBadge')}
                            </Badge>
                          ) : (
                            <Badge color="gray" variant="light">
                              {i18next.t('manage.notFinalBadge')}
                            </Badge>
                          )}
                          {e.keep && (
                            <Badge color="gray" variant="outline">
                              {i18next.t('manage.keptBadge')}
                            </Badge>
                          )}
                          {e.scansRemovedAt && (
                            <Badge color="gray" variant="outline">
                              {i18next.t('manage.scansRemoved', { when: when(e.scansRemovedAt) })}
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>{e.firstDate ? formatDate(e.firstDate) : '–'}</Table.Td>
                      <Table.Td ta="right">
                        {formatBytes(e.cardBytes)}
                        <Text size="xs" c="dimmed">
                          {i18next.t('manage.files', { count: e.cardFiles })}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">{formatBytes(e.otherBytes)}</Table.Td>
                      <Table.Td>
                        {e.lastSecondCopy ? (
                          when(e.lastSecondCopy)
                        ) : (
                          <Text size="sm" c="dimmed">
                            {view.secondPlaceChosen
                              ? i18next.t('manage.noneFound')
                              : i18next.t('manage.noSecondPlace')}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button
                            variant="default"
                            size="xs"
                            aria-label={i18next.t('manage.showLabel', { name: e.name })}
                            onClick={() => void window.tscore.showEventFolder(e.folder)}
                          >
                            {i18next.t('manage.showInFolder')}
                          </Button>
                          {!e.keep && !e.open && (
                            <Button
                              variant="subtle"
                              size="xs"
                              aria-label={i18next.t('manage.keepLabel', { name: e.name })}
                              onClick={() =>
                                void window.tscore
                                  .keepEvent(e.folder)
                                  .then((r) => (r.ok ? setView(r.value) : setError(r.error)))
                              }
                            >
                              {i18next.t('manage.keep')}
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
              {i18next.t('manage.removeScans')}
            </Button>
            <Button
              color="red"
              variant="light"
              disabled={chosen.length === 0}
              onClick={() => setDialog('delete')}
            >
              {chosen.length > 1
                ? i18next.t('manage.deleteMany', { count: chosen.length })
                : i18next.t('manage.deleteOne')}
            </Button>
            <Text size="sm" c="dimmed">
              {chosen.length === 0
                ? i18next.t('manage.tickToTidy')
                : i18next.t('manage.ticked', {
                    count: chosen.length,
                    size: formatBytes(chosen.reduce((n, e) => n + totalBytes(e), 0)),
                  })}
            </Text>
          </Group>
        </Paper>
      )}

      {dialog === 'remove' && chosen.length > 0 && (
        <RemoveScansDialog
          events={chosen}
          onClose={() => setDialog(null)}
          onDone={(images, bytes) =>
            finished(i18next.t('manage.removed', { count: images, size: formatBytes(bytes) }))
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
              i18next.t('manage.deleted', {
                count: n,
                bin: i18next.t(isMac ? 'manage.binMac' : 'manage.binWindows'),
              }),
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
      title={i18next.t('manage.removeTitle')}
      size="lg"
      closeButtonProps={{ 'aria-label': i18next.t('manage.close') }}
    >
      <Stack gap="md">
        <Text>
          {props.events.length === 1 ? (
            <Trans
              i18nKey="manage.removeIntroOne"
              values={{ name: props.events[0]?.name ?? '', size: formatBytes(bytes) }}
              components={{ strong: <strong /> }}
            />
          ) : (
            i18next.t('manage.removeIntroMany', {
              count: props.events.length,
              size: formatBytes(bytes),
            })
          )}
        </Text>
        <List size="sm" spacing={4}>
          <List.Item>
            <Trans i18nKey="manage.kept" components={{ strong: <strong /> }} />
          </List.Item>
          <List.Item>
            <Trans i18nKey="manage.lost" components={{ strong: <strong /> }} />
          </List.Item>
        </List>
        {notFinal.length > 0 && (
          <Alert color="yellow" title={i18next.t('manage.notFinalTitle')}>
            {i18next.t('manage.notFinal', {
              count: notFinal.length,
              names: notFinal.map((e) => e.name).join(', '),
            })}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            {i18next.t('manage.cancel')}
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
            {i18next.t('manage.removeConfirm')}
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
      title={
        one
          ? i18next.t('manage.deleteTitleOne', { name: one.name })
          : i18next.t('manage.deleteTitleMany', { count: props.events.length })
      }
      size="lg"
      closeButtonProps={{ 'aria-label': i18next.t('manage.close') }}
    >
      <Stack gap="md">
        <Text>
          <Trans
            i18nKey="manage.deleteIntro"
            values={{ bin: i18next.t(isMac ? 'manage.binMac' : 'manage.binWindowsFull') }}
            components={{ strong: <strong /> }}
          />
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
                    {e.final ? i18next.t('manage.markedFinal') : i18next.t('manage.notMarkedFinal')}{' '}
                    {e.lastSecondCopy
                      ? i18next.t('manage.backupFrom', { when: when(e.lastSecondCopy) })
                      : props.secondPlaceChosen
                        ? i18next.t('manage.noBackup')
                        : i18next.t('manage.noSecondSetUp')}
                  </Text>
                  {saved[e.folder] && (
                    <Text size="sm" c="green.8" role="status">
                      {i18next.t('manage.copySaved', { file: saved[e.folder] })}
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
                  {i18next.t('manage.saveCopy')}
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
        <TextInput
          label={
            one
              ? i18next.t('manage.typeCode', { code: one.code })
              : i18next.t('manage.typeCount', { count: props.events.length })
          }
          required
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
          maw={320}
          autoComplete="off"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            {i18next.t('manage.cancel')}
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
            {one
              ? i18next.t('manage.deleteTitleOne', { name: one.name })
              : i18next.t('manage.deleteTitleMany', { count: props.events.length })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
