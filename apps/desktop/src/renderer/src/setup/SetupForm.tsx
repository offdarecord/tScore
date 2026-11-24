import {
  Alert,
  Button,
  Checkbox,
  Group,
  List,
  NativeSelect,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { suggestEventCode, type EventSetup } from '@tscore/core';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppError, OpenEvent, Outcome } from '../../../shared/ipc';
import { ComingSoonButton } from '../ComingSoonButton';
import {
  MAX_DAYS,
  isJunior,
  labelsFor,
  newClass,
  problems as findProblems,
  toDraft,
  toSetup,
  withDayCount,
  type Draft,
  type DraftClass,
  type DraftClassDay,
  type Problem,
} from './draft';

const SESSIONS = [
  { value: 'full', label: 'All day' },
  { value: 'am', label: 'Morning' },
  { value: 'pm', label: 'Afternoon' },
];

interface Props {
  /** The setup to start from: a new event's defaults, or the open event's. */
  readonly setup: EventSetup;
  readonly mode: 'new' | 'edit';
  /** Riders already entered, per class (edit mode). */
  readonly ridersByClass?: Readonly<Record<string, number>>;
  readonly onSave: (setup: EventSetup) => Promise<Outcome<OpenEvent>>;
  readonly onCancel?: () => void;
}

export function SetupForm({ setup, mode, ridersByClass = {}, onSave, onCancel }: Props) {
  const [base, setBase] = useState(setup);
  const [draft, setDraft] = useState<Draft>(() => toDraft(setup));
  const [codeEdited, setCodeEdited] = useState(mode === 'edit');
  const [tried, setTried] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<AppError | null>(null);
  const [savedAt, setSavedAt] = useState<Draft | null>(mode === 'edit' ? draft : null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const problems = useMemo(() => findProblems(draft, base), [draft, base]);
  const serverProblems: Problem[] =
    saveError?.issues?.map((i) => ({ field: i.path, message: i.message })) ?? [];
  const shown = (field: string) => tried || touched.has(field);
  const errorFor = (field: string): string | undefined =>
    shown(field) ? problems.find((p) => p.field === field)?.message : undefined;
  const touch = (field: string) => () =>
    setTouched((t) => (t.has(field) ? t : new Set(t).add(field)));
  const dirty = savedAt !== draft;
  const riders = Object.values(ridersByClass).reduce((a, b) => a + b, 0);
  const anyRiders = riders > 0;

  const update = (change: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...change }));
    setSaveError(null);
  };
  const updateClass = (i: number, change: Partial<DraftClass>) =>
    update({ classes: draft.classes.map((c, j) => (j === i ? { ...c, ...change } : c)) });
  const updateClassDay = (i: number, day: number, change: Partial<DraftClassDay>) =>
    updateClass(i, {
      days: (draft.classes[i]?.days ?? []).map((d, j) => (j === day ? { ...d, ...change } : d)),
    });

  async function save() {
    setTried(true);
    if (problems.length) {
      summaryRef.current?.focus();
      return;
    }
    setSaving(true);
    const next = toSetup(draft, base);
    const outcome = await onSave(next);
    setSaving(false);
    if (outcome.ok) {
      setBase(outcome.value.setup);
      setSavedAt(draft);
      setSaveError(null);
    } else {
      setSaveError(outcome.error);
      summaryRef.current?.focus();
    }
  }

  const listed = tried ? [...problems, ...serverProblems] : [];
  const days = draft.days.length;

  return (
    <Stack gap="lg" maw={1200}>
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Title order={1} size="h2">
            {mode === 'new' ? 'New event' : 'Event setup'}
          </Title>
          <Text c="dimmed">
            Everything else (labels, scanning, results) follows from this page.
          </Text>
        </div>
        <Group gap="sm">
          <ComingSoonButton variant="default">Copy from a previous event…</ComingSoonButton>
          <ComingSoonButton variant="default">Save as template</ComingSoonButton>
        </Group>
      </Group>

      <Card title="Event">
        <Group align="flex-start" grow wrap="wrap">
          <TextInput
            label="Event name"
            data-field="event.name"
            value={draft.name}
            onChange={(e) => {
              const name = e.currentTarget.value;
              update(codeEdited ? { name } : { name, code: suggestEventCode(name) });
            }}
            onBlur={touch('event.name')}
            error={errorFor('event.name')}
            miw={260}
          />
          <TextInput
            label="Event code"
            description="Goes in each label's QR code"
            data-field="event.code"
            value={draft.code}
            onChange={(e) => {
              setCodeEdited(true);
              update({ code: e.currentTarget.value.toUpperCase() });
            }}
            onBlur={touch('event.code')}
            error={errorFor('event.code')}
            miw={160}
          />
          <TextInput
            label="Club"
            value={draft.club}
            onChange={(e) => update({ club: e.currentTarget.value })}
            miw={220}
          />
        </Group>
        <Group align="flex-start" grow wrap="wrap">
          <NativeSelect
            label="Days"
            value={String(days)}
            data={Array.from({ length: MAX_DAYS }, (_, i) => ({
              value: String(i + 1),
              label: i === 0 ? '1 day' : `${i + 1} days`,
            }))}
            onChange={(e) => update(withDayCount(draft, Number(e.currentTarget.value)))}
          />
          <NativeSelect
            label="Scorecard"
            data={[{ value: 'regional-16', label: 'Regional card (16 sections)' }]}
            value="regional-16"
            onChange={() => undefined}
          />
          <TextInput
            label="First rider number"
            inputMode="numeric"
            data-field="event.first_rider_number"
            value={draft.firstNumber}
            onChange={(e) => update({ firstNumber: e.currentTarget.value })}
            onBlur={touch('event.first_rider_number')}
            error={errorFor('event.first_rider_number')}
          />
        </Group>
        {draft.days.map((d, i) => (
          <Group key={i} align="flex-start" grow wrap="wrap">
            <TextInput
              type="date"
              label={days > 1 ? `Day ${i + 1} date` : 'Date'}
              data-field={`days[${i}].date`}
              value={d.date}
              onChange={(e) => {
                const date = e.currentTarget.value;
                update({ days: draft.days.map((x, j) => (j === i ? { ...x, date } : x)) });
              }}
              onBlur={touch(`days[${i}].date`)}
              error={errorFor(`days[${i}].date`)}
            />
            <TextInput
              type="time"
              label={days > 1 ? `Day ${i + 1}: lap 1 starts` : 'Lap 1 starts'}
              data-field={`days[${i}].start_time`}
              value={d.startTime}
              onChange={(e) => {
                const startTime = e.currentTarget.value;
                update({ days: draft.days.map((x, j) => (j === i ? { ...x, startTime } : x)) });
              }}
              onBlur={touch(`days[${i}].start_time`)}
              error={errorFor(`days[${i}].start_time`)}
            />
          </Group>
        ))}
        <NativeSelect
          label="Type of trial"
          description={
            draft.direction === 'low_wins'
              ? 'Ties are split by most cleans, then most 1s, 2s and 3s, then fewest 5s'
              : 'The highest total wins'
          }
          value={draft.direction}
          data={[
            { value: 'low_wins', label: 'Normal trial: lowest total wins' },
            { value: 'high_wins', label: 'Gate trial: highest total wins' },
          ]}
          onChange={(e) => update({ direction: e.currentTarget.value as Draft['direction'] })}
          maw={520}
        />
        <TextInput
          label="Overdue after (minutes)"
          description="A rider is overdue this long past their class's average lap. Overdue never marks anyone DNF."
          inputMode="numeric"
          data-field="overdue_margin_minutes"
          value={draft.overdueMargin}
          onChange={(e) => update({ overdueMargin: e.currentTarget.value })}
          onBlur={touch('overdue_margin_minutes')}
          error={errorFor('overdue_margin_minutes')}
          maw={520}
        />
      </Card>

      <Card
        title="Classes"
        action={
          <Button
            variant="default"
            onClick={() => update({ classes: [...draft.classes, newClass(days)] })}
          >
            Add class
          </Button>
        }
      >
        <Table.ScrollContainer minWidth={days > 1 ? 1000 : 760}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th rowSpan={days > 1 ? 2 : 1}>Class</Table.Th>
                {days > 1
                  ? draft.days.map((_, j) => (
                      <Table.Th key={j} colSpan={3} ta="center">
                        Day {j + 1}
                      </Table.Th>
                    ))
                  : dayHeads()}
                <Table.Th rowSpan={days > 1 ? 2 : 1}>Junior class</Table.Th>
                {anyRiders && <Table.Th rowSpan={days > 1 ? 2 : 1}>Riders</Table.Th>}
                {anyRiders && <Table.Th rowSpan={days > 1 ? 2 : 1}>Labels</Table.Th>}
                <Table.Th rowSpan={days > 1 ? 2 : 1}>
                  <VisuallyHidden>Remove</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
              {days > 1 && <Table.Tr>{draft.days.flatMap((_, j) => dayHeads(j))}</Table.Tr>}
            </Table.Thead>
            <Table.Tbody>
              {draft.classes.map((c, i) => {
                const label = c.name.trim() || `class ${i + 1}`;
                const inUse = (ridersByClass[c.original?.name ?? ''] ?? 0) > 0;
                const classRiders = ridersByClass[c.original?.name ?? ''] ?? 0;
                return (
                  <Table.Tr key={c.key}>
                    <Table.Td>
                      <TextInput
                        aria-label={`Name of ${label}`}
                        data-field={`classes[${i}].name`}
                        value={c.name}
                        onChange={(e) => updateClass(i, { name: e.currentTarget.value })}
                        onBlur={touch(`classes[${i}].name`)}
                        error={!!errorFor(`classes[${i}].name`)}
                        miw={150}
                      />
                    </Table.Td>
                    {c.days.map((d, j) => {
                      const on = days > 1 ? ` on day ${j + 1}` : '';
                      const f = `classes[${i}].days.${j + 1}`;
                      return [
                        <Table.Td key={`s${j}`}>
                          <TextInput
                            inputMode="numeric"
                            aria-label={`Sections per lap for ${label}${on}`}
                            data-field={`${f}.sections`}
                            value={d.sections}
                            onChange={(e) =>
                              updateClassDay(i, j, { sections: e.currentTarget.value })
                            }
                            error={!!problems.find((p) => p.field === `${f}.sections`)}
                            w={80}
                          />
                        </Table.Td>,
                        <Table.Td key={`l${j}`}>
                          <TextInput
                            inputMode="numeric"
                            aria-label={`Laps for ${label}${on}`}
                            data-field={`${f}.laps`}
                            value={d.laps}
                            onChange={(e) => updateClassDay(i, j, { laps: e.currentTarget.value })}
                            error={!!problems.find((p) => p.field === `${f}.laps`)}
                            w={70}
                          />
                        </Table.Td>,
                        <Table.Td key={`p${j}`}>
                          <NativeSelect
                            aria-label={`Session for ${label}${on}`}
                            data={SESSIONS}
                            value={d.session}
                            onChange={(e) =>
                              updateClassDay(i, j, {
                                session: e.currentTarget.value as DraftClassDay['session'],
                              })
                            }
                            w={130}
                          />
                        </Table.Td>,
                      ];
                    })}
                    <Table.Td>
                      <Checkbox
                        aria-label={`${label} is a junior class`}
                        checked={isJunior(c)}
                        onChange={(e) => updateClass(i, { junior: e.currentTarget.checked })}
                        size="md"
                      />
                    </Table.Td>
                    {anyRiders && <Table.Td>{classRiders}</Table.Td>}
                    {anyRiders && (
                      <Table.Td>{labelsFor(c, classRiders) || 'none (not scored)'}</Table.Td>
                    )}
                    <Table.Td>
                      <Button
                        variant="subtle"
                        color="red"
                        aria-label={`Remove ${label}`}
                        disabled={inUse}
                        title={inUse ? 'This class has riders' : undefined}
                        onClick={() => update({ classes: draft.classes.filter((_, j) => j !== i) })}
                      >
                        Remove
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {/* Card limits are shown as soon as they're typed, as in the mock-up. */}
        {!tried &&
          problems
            .filter((p) => /^classes\[\d+\]\.days\./.test(p.field))
            .map((p) => (
              <Alert key={p.field} color="red" variant="light">
                {p.message}
              </Alert>
            ))}
        <Text c="dimmed" size="sm">
          {anyRiders
            ? `Total: ${draft.classes.reduce((n, c) => n + labelsFor(c, ridersByClass[c.original?.name ?? ''] ?? 0), 0)} labels for ${riders} riders. Changes after scanning starts are allowed, and logged.`
            : 'Riders are added after setup. Set laps to 0 for a class that is not scored, such as minders.'}
        </Text>
      </Card>

      <div ref={summaryRef} tabIndex={-1} aria-live="polite">
        {(listed.length > 0 || saveError) && (
          <Alert
            color="red"
            title={listed.length ? 'Fix these before saving' : "The event wasn't saved"}
          >
            {listed.length > 0 ? (
              <List size="sm" spacing={2}>
                {listed.map((p, k) => (
                  <List.Item key={k}>{p.message}</List.Item>
                ))}
              </List>
            ) : (
              <Text size="sm">
                {saveError?.message}{' '}
                <Text span c="dimmed">
                  ({saveError?.code})
                </Text>
              </Text>
            )}
          </Alert>
        )}
      </div>

      <Group>
        <Button
          size="md"
          onClick={() => void save()}
          loading={saving}
          disabled={mode === 'edit' && !dirty}
        >
          {mode === 'new' ? 'Create event' : 'Save changes'}
        </Button>
        {onCancel && (
          <Button size="md" variant="default" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {mode === 'edit' && !dirty && savedAt && tried && (
          <Text c="green.9" role="status">
            Saved
          </Text>
        )}
      </Group>
    </Stack>
  );
}

function dayHeads(day?: number) {
  const k = day ?? 0;
  return [
    <Table.Th key={`s${k}`}>Sections per lap</Table.Th>,
    <Table.Th key={`l${k}`}>Laps</Table.Th>,
    <Table.Th key={`p${k}`}>Session</Table.Th>,
  ];
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="lg" component="section" aria-label={title}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2} size="h3">
            {title}
          </Title>
          {action}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}
