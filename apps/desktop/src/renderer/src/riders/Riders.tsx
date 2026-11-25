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
import { useTranslation } from 'react-i18next';
import type {
  AppError,
  EntryListFile,
  NewRider,
  OpenEvent,
  RiderChange,
  RiderInfo,
} from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';

export const COMPETITION_STATUS_LABEL = {
  competitive: 'riders.competitive',
  no_award: 'riders.noAward',
  non_competitive: 'riders.nonCompetitive',
} as const satisfies Record<CompetitionStatus, string>;
export const COMPETITION_STATUS_SHORT = {
  competitive: null,
  no_award: 'riders.na',
  non_competitive: 'riders.nc',
} as const satisfies Record<CompetitionStatus, string | null>;
const STATUS_LABEL = {
  riding: 'riders.riding',
  dns: 'riders.dns',
  dnf: 'riders.dnf',
} as const satisfies Record<EntryStatus, string>;

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
  const { t } = useTranslation();
  /** NA or NC beside a rider's name ('' when competitive). */
  const short = (c: CompetitionStatus) => {
    const key = COMPETITION_STATUS_SHORT[c];
    return key ? t(key) : '';
  };
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
          <Title order={2}>{t('riders.title')}</Title>
          <Text c="dimmed">
            {t('riders.count', { count })} {t('riders.intro')}
          </Text>
        </div>
        <Group gap="sm">
          <Button variant={count ? 'default' : 'filled'} onClick={() => void choose()}>
            {t('riders.import')}
          </Button>
          <Button variant="default" onClick={() => setAdding(true)}>
            {t('riders.late')}
          </Button>
        </Group>
      </Group>

      {notice && (
        <Alert color="green" role="status">
          {notice}
        </Alert>
      )}
      {error && (
        <ErrorAlert error={error} title={t('riders.notRead')} onClose={() => setError(null)} />
      )}
      {added && (
        <Alert
          color="green"
          role="status"
          title={t('riders.added', { number: added.number, name: added.name })}
          withCloseButton
          closeButtonLabel={t('riders.dismiss')}
          onClose={() => setAdded(null)}
        >
          <Group justify="space-between" wrap="wrap" gap="sm">
            <span>{t('riders.printNew')}</span>
            {onLabels && (
              <Button variant="default" size="xs" onClick={onLabels}>
                {t('riders.goToLabels')}
              </Button>
            )}
          </Group>
        </Alert>
      )}
      {reprint !== null && (
        <Alert
          color="yellow"
          role="status"
          title={t('riders.reprint', { number: reprint })}
          withCloseButton
          closeButtonLabel={t('riders.dismiss')}
          onClose={() => setReprint(null)}
        >
          {t('riders.reprintHelp', { number: reprint })}
        </Alert>
      )}

      <Paper withBorder radius="md" p="lg" component="section" aria-label={t('riders.list')}>
        {riders === null ? null : count === 0 ? (
          <Text c="dimmed">{t('riders.none')}</Text>
        ) : (
          <Stack gap="sm">
            <TextInput
              label={t('riders.find')}
              placeholder={t('riders.findPlaceholder')}
              value={find}
              onChange={(e) => setFind(e.currentTarget.value)}
              maw={320}
            />
            <Table.ScrollContainer minWidth={640}>
              <Table verticalSpacing="xs" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('riders.number')}</Table.Th>
                    <Table.Th>{t('riders.name')}</Table.Th>
                    <Table.Th>{t('riders.class')}</Table.Th>
                    <Table.Th>{t('riders.club')}</Table.Th>
                    <Table.Th>{t('riders.machine')}</Table.Th>
                    <Table.Th>{t('riders.dnsDnf')}</Table.Th>
                    <Table.Th>
                      <VisuallyHidden>{t('riders.actions')}</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {shown.map((r) => (
                    <Table.Tr key={r.number}>
                      <Table.Td fw={700}>{r.number}</Table.Td>
                      <Table.Td>
                        {riderName(r)}{' '}
                        {short(r.competitionStatus) && (
                          <Badge
                            variant="light"
                            color="gray"
                            title={t(COMPETITION_STATUS_LABEL[r.competitionStatus])}
                          >
                            {short(r.competitionStatus)}
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
                      <Table.Td>{r.status === 'riding' ? '' : t(STATUS_LABEL[r.status])}</Table.Td>
                      <Table.Td ta="right">
                        <Button
                          variant="default"
                          size="xs"
                          aria-label={t('riders.changeRider', { number: r.number })}
                          onClick={() => setEditing(r)}
                        >
                          {t('riders.change')}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {shown.length === 0 && <Text c="dimmed">{t('riders.noMatch', { find })}</Text>}
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
  const { t } = useTranslation();
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
      title={t('riders.dialogTitle', { number: rider.number, name: riderName(rider) })}
      closeButtonProps={{ 'aria-label': t('riders.close') }}
    >
      <Stack gap="md">
        {names.map((p, i) => (
          <Group key={i} grow align="flex-start" wrap="nowrap">
            <TextInput
              label={
                sidecar
                  ? i === 0
                    ? t('riders.driverFirst')
                    : t('riders.passengerFirst')
                  : t('riders.first')
              }
              value={p.givenName}
              maxLength={NAME_MAX}
              onChange={(e) => setName(i, 'givenName', e.currentTarget.value)}
            />
            <TextInput
              label={
                sidecar
                  ? i === 0
                    ? t('riders.driverSurname')
                    : t('riders.passengerSurname')
                  : t('riders.surname')
              }
              value={p.familyName}
              maxLength={NAME_MAX}
              onChange={(e) => setName(i, 'familyName', e.currentTarget.value)}
            />
          </Group>
        ))}
        {nameless && (
          <Text c="light-dark(#a51111, #ffa8a8)" size="sm" role="alert">
            {t('riders.nameless')}
          </Text>
        )}
        <TextInput
          label={t('riders.club')}
          value={club}
          maxLength={CLUB_MAX}
          onChange={(e) => setClub(e.currentTarget.value)}
        />
        <TextInput
          label={t('riders.machine')}
          placeholder={t('riders.machinePlaceholder')}
          value={machine}
          maxLength={MACHINE_MAX}
          onChange={(e) => setMachine(e.currentTarget.value)}
        />
        <NativeSelect
          label={t('riders.class')}
          value={first}
          onChange={(e) => setFirst(e.currentTarget.value)}
          data={props.classes.map((c) => c)}
        />
        <NativeSelect
          label={t('riders.secondClass')}
          description={t('riders.secondClassHelp')}
          value={second}
          onChange={(e) => setSecond(e.currentTarget.value)}
          data={[
            { value: '', label: t('riders.noSecond') },
            ...props.classes.filter((c) => c !== first).map((c) => ({ value: c, label: c })),
          ]}
        />
        <NativeSelect
          label={t('riders.competitionStatus')}
          value={competitionStatus}
          onChange={(e) => setCompetitionStatus(e.currentTarget.value as CompetitionStatus)}
          data={(Object.keys(COMPETITION_STATUS_LABEL) as CompetitionStatus[]).map((c) => ({
            value: c,
            label: t(COMPETITION_STATUS_LABEL[c]),
          }))}
        />
        <NativeSelect
          label={t('riders.ridingStatus')}
          value={status}
          onChange={(e) => setStatus(e.currentTarget.value as EntryStatus)}
          data={(Object.keys(STATUS_LABEL) as EntryStatus[]).map((s) => ({
            value: s,
            label: t(STATUS_LABEL[s]),
          }))}
        />
        {error && <ErrorAlert error={error} withHelp={false} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            {t('riders.cancel')}
          </Button>
          <Button disabled={!changed || nameless} onClick={() => void save()}>
            {t('riders.save')}
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
  const { t } = useTranslation();
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
  const nameless = people.some((p) => !p.givenName || !p.familyName);
  const wanted = Number(number.trim());
  const numberProblem =
    !/^\d{1,4}$/.test(number.trim()) || wanted < 1
      ? t('riders.numberProblem')
      : props.riders.some((r) => r.number === wanted)
        ? t('riders.taken', { number: wanted, next })
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
      title={t('riders.lateTitle')}
      closeButtonProps={{ 'aria-label': t('riders.close') }}
    >
      <Stack gap="md">
        <TextInput
          label={t('riders.riderNumber')}
          required
          description={t('riders.nextFree', { next })}
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.currentTarget.value)}
          error={numberProblem}
          maw={260}
        />
        <NativeSelect
          label={t('riders.class')}
          value={className}
          onChange={(e) => setClassName(e.currentTarget.value)}
          data={classes}
        />
        {(sidecar ? [0, 1] : [0]).map((i) => (
          <Group key={i} grow align="flex-start" wrap="nowrap">
            <TextInput
              label={
                sidecar
                  ? i === 0
                    ? t('riders.driverFirst')
                    : t('riders.passengerFirst')
                  : t('riders.first')
              }
              required
              value={names[i]?.givenName ?? ''}
              maxLength={NAME_MAX}
              onChange={(e) => setName(i, 'givenName', e.currentTarget.value)}
            />
            <TextInput
              label={
                sidecar
                  ? i === 0
                    ? t('riders.driverSurname')
                    : t('riders.passengerSurname')
                  : t('riders.surname')
              }
              required
              value={names[i]?.familyName ?? ''}
              maxLength={NAME_MAX}
              onChange={(e) => setName(i, 'familyName', e.currentTarget.value)}
            />
          </Group>
        ))}
        {sameName && (
          <Text c="light-dark(#7a3500, #ffc078)" size="sm" role="status">
            {t('riders.sameName', { number: sameName.number })}
          </Text>
        )}
        <TextInput
          label={t('riders.club')}
          required
          value={club}
          maxLength={CLUB_MAX}
          onChange={(e) => setClub(e.currentTarget.value)}
        />
        <TextInput
          label={t('riders.machine')}
          placeholder={t('riders.machinePlaceholder')}
          value={machine}
          maxLength={MACHINE_MAX}
          onChange={(e) => setMachine(e.currentTarget.value)}
        />
        <NativeSelect
          label={t('riders.competitionStatus')}
          value={competitionStatus}
          onChange={(e) => setCompetitionStatus(e.currentTarget.value as CompetitionStatus)}
          data={(Object.keys(COMPETITION_STATUS_LABEL) as CompetitionStatus[]).map((c) => ({
            value: c,
            label: t(COMPETITION_STATUS_LABEL[c]),
          }))}
        />
        {error && <ErrorAlert error={error} withHelp={false} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            {t('riders.cancel')}
          </Button>
          <Button
            loading={busy}
            disabled={nameless || !tidyText(club) || numberProblem !== null || !className}
            onClick={() => void save()}
          >
            {t('riders.addRider')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
