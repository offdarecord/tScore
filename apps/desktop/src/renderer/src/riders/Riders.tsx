import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NativeSelect,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import {
  CLUB_MAX,
  MACHINE_MAX,
  NAME_MAX,
  type CompetitionStatus,
  type EntryStatus,
} from '@tscore/core';
import { useEffect, useMemo, useState } from 'react';
import type {
  AppError,
  EntryListFile,
  NewRider,
  OpenEvent,
  RiderChange,
  RiderInfo,
} from '../../../shared/ipc';

export const COMPETITION_STATUS_LABEL: Record<CompetitionStatus, string> = {
  competitive: 'Competitive',
  no_award: 'No award',
  non_competitive: 'Non-competitive (NC)',
};
const COMPETITION_STATUS_SHORT: Record<CompetitionStatus, string> = {
  competitive: '',
  no_award: 'NA',
  non_competitive: 'NC',
};
const STATUS_LABEL: Record<EntryStatus, string> = {
  riding: 'Riding',
  dns: 'Did not start',
  dnf: 'Did not finish',
};

export const riderName = (r: Pick<RiderInfo, 'riders'>) =>
  r.riders.map((p) => `${p.givenName} ${p.familyName}`.trim()).join(' & ');

interface Props {
  readonly event: OpenEvent;
  /** Shown once after an import, e.g. "54 riders imported." */
  readonly notice?: string | undefined;
  readonly onImport: (file: EntryListFile) => void;
  /** Open Card labels (after a late entry, to print their labels). */
  readonly onLabels?: () => void;
  /** The open event changed (e.g. its rider count, after a late entry). */
  readonly onEventChange?: (event: OpenEvent) => void;
}

/**
 * Everyone entered in the event. Find a rider; correct their name, club or machine, or change
 * their class, competition status or riding status.
 */
export function Riders({ event, notice, onImport, onLabels, onEventChange }: Props) {
  const [riders, setRiders] = useState<RiderInfo[] | null>(null);
  const [find, setFind] = useState('');
  const [editing, setEditing] = useState<RiderInfo | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  /** A rider renamed after their labels were printed: remind the desk to reprint them. */
  const [reprint, setReprint] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  /** The rider just added on the day: their labels still need printing. */
  const [added, setAdded] = useState<{ number: number; name: string } | null>(null);

  useEffect(() => void window.tscore.riders().then(setRiders), [event]);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!riders || !q) return riders ?? [];
    return riders.filter((r) => String(r.number) === q || riderName(r).toLowerCase().includes(q));
  }, [riders, find]);

  async function choose() {
    const r = await window.tscore.chooseEntryList();
    if (!r.ok) setError(r.error);
    else if (r.value) onImport(r.value);
  }

  const count = riders?.length ?? 0;
  return (
    <Stack gap="lg" maw={1100}>
      <Group justify="space-between" wrap="wrap" align="flex-start">
        <div>
          <Title order={2}>Riders</Title>
          <Text c="dimmed">
            {count === 1 ? '1 rider.' : `${count} riders.`} Change a name, machine, class or
            competition status, or mark DNS or DNF. Every change is logged.
          </Text>
        </div>
        <Group gap="sm">
          <Button variant={count ? 'default' : 'filled'} onClick={() => void choose()}>
            Import from entry list…
          </Button>
          <Button variant="default" onClick={() => setAdding(true)}>
            Late entry…
          </Button>
        </Group>
      </Group>

      {notice && (
        <Alert color="green" role="status">
          {notice}
        </Alert>
      )}
      {error && (
        <Alert
          color="red"
          title="The entry list wasn't read"
          withCloseButton
          onClose={() => setError(null)}
        >
          {error.message}{' '}
          <Text span c="dimmed" size="sm">
            ({error.code})
          </Text>
        </Alert>
      )}
      {added && (
        <Alert
          color="green"
          role="status"
          title={`Rider ${added.number} added: ${added.name}`}
          withCloseButton
          closeButtonLabel="Dismiss"
          onClose={() => setAdded(null)}
        >
          <Group justify="space-between" wrap="wrap" gap="sm">
            <span>
              Print their card labels: on Card labels, choose “Only labels not printed yet”.
            </span>
            {onLabels && (
              <Button variant="default" size="xs" onClick={onLabels}>
                Go to Card labels
              </Button>
            )}
          </Group>
        </Alert>
      )}
      {reprint !== null && (
        <Alert
          color="yellow"
          role="status"
          title={`Reprint rider ${reprint}'s labels`}
          withCloseButton
          closeButtonLabel="Dismiss"
          onClose={() => setReprint(null)}
        >
          Their card labels were printed with the old name. On Card labels, choose “One rider
          (reprint)” and rider {reprint}.
        </Alert>
      )}

      <Paper withBorder radius="md" p="lg" component="section" aria-label="Rider list">
        {riders === null ? null : count === 0 ? (
          <Text c="dimmed">
            No riders yet. Import the entry list: tScore reads Entryplace and Ridernet exports as
            they come, and the tScore rider list for anything else.
          </Text>
        ) : (
          <Stack gap="sm">
            <TextInput
              label="Find"
              placeholder="number or name"
              value={find}
              onChange={(e) => setFind(e.currentTarget.value)}
              maw={320}
            />
            <Table.ScrollContainer minWidth={640}>
              <Table verticalSpacing="xs" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>No.</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Class</Table.Th>
                    <Table.Th>Club</Table.Th>
                    <Table.Th>Machine</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>
                      <VisuallyHidden>Actions</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {shown.map((r) => (
                    <Table.Tr key={r.number}>
                      <Table.Td fw={700}>{r.number}</Table.Td>
                      <Table.Td>
                        {riderName(r)}{' '}
                        {COMPETITION_STATUS_SHORT[r.competitionStatus] && (
                          <Badge
                            variant="light"
                            color="gray"
                            title={COMPETITION_STATUS_LABEL[r.competitionStatus]}
                          >
                            {COMPETITION_STATUS_SHORT[r.competitionStatus]}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {r.classes[0]}
                        {r.classes[1] && (
                          <Text span c="dimmed" size="sm">
                            {' '}
                            + {r.classes[1]}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>{r.club ?? ''}</Table.Td>
                      <Table.Td>{r.machine ?? ''}</Table.Td>
                      <Table.Td>{r.status === 'riding' ? '' : STATUS_LABEL[r.status]}</Table.Td>
                      <Table.Td ta="right">
                        <Button
                          variant="default"
                          size="xs"
                          aria-label={`Change rider ${r.number}`}
                          onClick={() => setEditing(r)}
                        >
                          Change
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {shown.length === 0 && <Text c="dimmed">No rider matches “{find}”.</Text>}
          </Stack>
        )}
      </Paper>

      {adding && (
        <LateEntryDialog
          event={event}
          riders={riders ?? []}
          onClose={() => setAdding(false)}
          onAdded={(number, list) => {
            setRiders(list);
            const r = list.find((x) => x.number === number);
            setAdded({ number, name: r ? riderName(r) : '' });
            setAdding(false);
            // Refresh the event too, so the sidebar's rider count includes them.
            void window.tscore.currentEvent().then((e) => e && onEventChange?.(e));
          }}
        />
      )}
      {editing && (
        <RiderDialog
          rider={editing}
          classes={event.setup.classes.map((c) => c.name)}
          onClose={() => setEditing(null)}
          onSaved={(list, renamed) => {
            setRiders(list);
            if (renamed && editing.labelsPrinted) setReprint(editing.number);
            setEditing(null);
          }}
        />
      )}
    </Stack>
  );
}

function RiderDialog(props: {
  rider: RiderInfo;
  classes: readonly string[];
  onClose: () => void;
  /** `renamed`: a name was corrected, so printed labels may need reprinting. */
  onSaved: (riders: RiderInfo[], renamed: boolean) => void;
}) {
  const { rider } = props;
  const [names, setNames] = useState(rider.riders.map((p) => ({ ...p })));
  const [club, setClub] = useState(rider.club ?? '');
  const [machine, setMachine] = useState(rider.machine ?? '');
  const [first, setFirst] = useState(rider.classes[0] ?? '');
  const [second, setSecond] = useState(rider.classes[1] ?? '');
  const [competitionStatus, setCompetitionStatus] = useState<CompetitionStatus>(
    rider.competitionStatus,
  );
  const [status, setStatus] = useState<EntryStatus>(rider.status);
  const [error, setError] = useState<AppError | null>(null);

  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
  const tidyNames = names.map((p) => ({
    givenName: tidy(p.givenName),
    familyName: tidy(p.familyName),
  }));
  const renamed = tidyNames.some(
    (p, i) =>
      p.givenName !== rider.riders[i]?.givenName || p.familyName !== rider.riders[i]?.familyName,
  );
  const nameless = tidyNames.some((p) => !p.givenName && !p.familyName);
  const classes = second ? [first, second] : [first];
  const change: RiderChange = {
    ...(renamed ? { riders: tidyNames } : {}),
    ...(tidy(club) !== (rider.club ?? '') ? { club: tidy(club) || null } : {}),
    ...(tidy(machine) !== (rider.machine ?? '') ? { machine: tidy(machine) || null } : {}),
    ...(classes.join('\n') !== rider.classes.join('\n') ? { classes } : {}),
    ...(competitionStatus !== rider.competitionStatus ? { competitionStatus } : {}),
    ...(status !== rider.status ? { status } : {}),
  };
  const changed = Object.keys(change).length > 0;

  function setName(i: number, part: 'givenName' | 'familyName', value: string) {
    setNames((list) => list.map((p, j) => (j === i ? { ...p, [part]: value } : p)));
  }

  async function save() {
    const r = await window.tscore.updateRider(rider.number, change);
    if (r.ok) props.onSaved(r.value, renamed);
    else setError(r.error);
  }

  const sidecar = names.length === 2;

  return (
    <Modal
      opened
      onClose={props.onClose}
      title={`Rider ${rider.number}: ${riderName(rider)}`}
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <Stack gap="md">
        {names.map((p, i) => (
          <Group key={i} grow align="flex-start" wrap="nowrap">
            <TextInput
              label={
                sidecar ? (i === 0 ? 'Driver first name' : 'Passenger first name') : 'First name'
              }
              value={p.givenName}
              maxLength={NAME_MAX}
              onChange={(e) => setName(i, 'givenName', e.currentTarget.value)}
            />
            <TextInput
              label={sidecar ? (i === 0 ? 'Driver surname' : 'Passenger surname') : 'Surname'}
              value={p.familyName}
              maxLength={NAME_MAX}
              onChange={(e) => setName(i, 'familyName', e.currentTarget.value)}
            />
          </Group>
        ))}
        {nameless && (
          <Text c="red.8" size="sm" role="alert">
            A rider needs a first name or a surname.
          </Text>
        )}
        <TextInput
          label="Club"
          value={club}
          maxLength={CLUB_MAX}
          onChange={(e) => setClub(e.currentTarget.value)}
        />
        <TextInput
          label="Machine"
          placeholder="e.g. Beta Evo 300"
          value={machine}
          maxLength={MACHINE_MAX}
          onChange={(e) => setMachine(e.currentTarget.value)}
        />
        <NativeSelect
          label="Class"
          value={first}
          onChange={(e) => setFirst(e.currentTarget.value)}
          data={props.classes.map((c) => c)}
        />
        <NativeSelect
          label="Second class"
          description="Only for a rider whose scores also count in another class."
          value={second}
          onChange={(e) => setSecond(e.currentTarget.value)}
          data={[
            { value: '', label: 'None' },
            ...props.classes.filter((c) => c !== first).map((c) => ({ value: c, label: c })),
          ]}
        />
        <NativeSelect
          label="Competition status"
          value={competitionStatus}
          onChange={(e) => setCompetitionStatus(e.currentTarget.value as CompetitionStatus)}
          data={(Object.keys(COMPETITION_STATUS_LABEL) as CompetitionStatus[]).map((t) => ({
            value: t,
            label: COMPETITION_STATUS_LABEL[t],
          }))}
        />
        <NativeSelect
          label="Riding status"
          value={status}
          onChange={(e) => setStatus(e.currentTarget.value as EntryStatus)}
          data={(Object.keys(STATUS_LABEL) as EntryStatus[]).map((s) => ({
            value: s,
            label: STATUS_LABEL[s],
          }))}
        />
        {error && (
          <Alert color="red" role="alert">
            {error.message}{' '}
            <Text span c="dimmed" size="sm">
              ({error.code})
            </Text>
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={!changed || nameless} onClick={() => void save()}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

const BLANK = { givenName: '', familyName: '' };
const tidyText = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Add a rider on the day. They get the next free number, so nobody else's number moves. */
function LateEntryDialog(props: {
  event: OpenEvent;
  riders: readonly RiderInfo[];
  onClose: () => void;
  onAdded: (number: number, riders: RiderInfo[]) => void;
}) {
  const classes = props.event.setup.classes.filter((c) => c.scored !== false).map((c) => c.name);
  const next =
    props.riders.length > 0
      ? Math.max(...props.riders.map((r) => r.number)) + 1
      : (props.event.setup.event.first_rider_number ?? 1);
  const [number, setNumber] = useState(String(next));
  const [names, setNames] = useState([BLANK, BLANK]);
  const [club, setClub] = useState('');
  const [machine, setMachine] = useState('');
  const [className, setClassName] = useState(classes[0] ?? '');
  const [competitionStatus, setCompetitionStatus] = useState<CompetitionStatus>('competitive');
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  const sidecar = /sidecar/i.test(className);
  const people = (sidecar ? names : names.slice(0, 1)).map((p) => ({
    givenName: tidyText(p.givenName),
    familyName: tidyText(p.familyName),
  }));
  const nameless = people.some((p) => !p.givenName && !p.familyName);
  const wanted = Number(number.trim());
  const numberProblem =
    !/^\d{1,4}$/.test(number.trim()) || wanted < 1
      ? 'A rider number is a whole number from 1 to 9999.'
      : props.riders.some((r) => r.number === wanted)
        ? `Rider number ${wanted} is already taken. The next free number is ${next}.`
        : null;
  const first = people[0];
  const fullName = first ? `${first.givenName} ${first.familyName}`.trim().toLowerCase() : '';
  const sameName = fullName
    ? props.riders.find((r) => {
        const p = r.riders[0];
        return p && `${p.givenName} ${p.familyName}`.trim().toLowerCase() === fullName;
      })
    : undefined;

  function setName(i: number, part: 'givenName' | 'familyName', value: string) {
    setNames((list) => list.map((p, j) => (j === i ? { ...p, [part]: value } : p)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const rider: NewRider = {
      ...(wanted !== next && { number: wanted }),
      riders: people,
      ...(tidyText(club) && { club: tidyText(club) }),
      ...(tidyText(machine) && { machine: tidyText(machine) }),
      className,
      competitionStatus,
    };
    const r = await window.tscore.addLateEntry(rider);
    setBusy(false);
    if (r.ok) props.onAdded(r.value.number, r.value.riders);
    else setError(r.error);
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      title="Late entry"
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <Stack gap="md">
        <TextInput
          label="Rider number"
          description={`The next free number is ${next}. Numbers already given never change.`}
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.currentTarget.value)}
          error={numberProblem}
          maw={260}
        />
        <NativeSelect
          label="Class"
          value={className}
          onChange={(e) => setClassName(e.currentTarget.value)}
          data={classes}
        />
        {(sidecar ? [0, 1] : [0]).map((i) => (
          <Group key={i} grow align="flex-start" wrap="nowrap">
            <TextInput
              label={
                sidecar ? (i === 0 ? 'Driver first name' : 'Passenger first name') : 'First name'
              }
              value={names[i]?.givenName ?? ''}
              maxLength={NAME_MAX}
              onChange={(e) => setName(i, 'givenName', e.currentTarget.value)}
            />
            <TextInput
              label={sidecar ? (i === 0 ? 'Driver surname' : 'Passenger surname') : 'Surname'}
              value={names[i]?.familyName ?? ''}
              maxLength={NAME_MAX}
              onChange={(e) => setName(i, 'familyName', e.currentTarget.value)}
            />
          </Group>
        ))}
        {sameName && (
          <Text c="orange.9" size="sm" role="status">
            Rider {sameName.number} already has this name. If it&apos;s the same person riding a
            second class, use Change on rider {sameName.number} instead.
          </Text>
        )}
        <TextInput
          label="Club"
          value={club}
          maxLength={CLUB_MAX}
          onChange={(e) => setClub(e.currentTarget.value)}
        />
        <TextInput
          label="Machine"
          placeholder="e.g. Beta Evo 300"
          value={machine}
          maxLength={MACHINE_MAX}
          onChange={(e) => setMachine(e.currentTarget.value)}
        />
        <NativeSelect
          label="Competition status"
          value={competitionStatus}
          onChange={(e) => setCompetitionStatus(e.currentTarget.value as CompetitionStatus)}
          data={(Object.keys(COMPETITION_STATUS_LABEL) as CompetitionStatus[]).map((t) => ({
            value: t,
            label: COMPETITION_STATUS_LABEL[t],
          }))}
        />
        {error && (
          <Alert color="red" role="alert">
            {error.message}{' '}
            <Text span c="dimmed" size="sm">
              ({error.code})
            </Text>
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={nameless || numberProblem !== null || !className}
            onClick={() => void save()}
          >
            Add rider
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
