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
import { Trans, useTranslation } from 'react-i18next';
import type { AppError, OpenEvent, Outcome } from '../../../shared/ipc';
import { ComingSoonButton } from '../ComingSoonButton';
import { RequiredMark } from '../RequiredMark';
import i18next from '../i18n';
import { SectionsCard } from './SectionsCard';
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
  const { t } = useTranslation();
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
            {mode === 'new' ? t('setup.newEvent') : t('setup.title')}
          </Title>
          <Text c="dimmed">
            <Trans i18nKey="setup.intro" components={{ mark: <RequiredMark /> }} />
          </Text>
        </div>
        <Group gap="sm">
          <ComingSoonButton variant="default">{t('setup.copyPrevious')}</ComingSoonButton>
          <ComingSoonButton variant="default">{t('setup.saveTemplate')}</ComingSoonButton>
        </Group>
      </Group>

      <Card title={t('setup.event')}>
        <Group align="flex-start" grow wrap="wrap">
          <TextInput
            label={t('setup.name')}
            required
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
            label={t('setup.code')}
            required
            description={t('setup.codeHelp')}
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
            label={t('setup.club')}
            value={draft.club}
            onChange={(e) => update({ club: e.currentTarget.value })}
            miw={220}
          />
        </Group>
        <Group align="flex-start" grow wrap="wrap">
          <NativeSelect
            label={t('setup.days')}
            value={String(days)}
            data={Array.from({ length: MAX_DAYS }, (_, i) => ({
              value: String(i + 1),
              label: t('setup.day', { count: i + 1 }),
            }))}
            onChange={(e) => update(withDayCount(draft, Number(e.currentTarget.value)))}
          />
          <NativeSelect
            label={t('setup.scorecard')}
            data={[{ value: 'regional-16', label: t('setup.regional16') }]}
            value="regional-16"
            onChange={() => undefined}
          />
          <TextInput
            label={t('setup.firstNumber')}
            required
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
              label={days > 1 ? t('setup.dayDate', { day: i + 1 }) : t('setup.date')}
              required
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
              label={days > 1 ? t('setup.dayLap1', { day: i + 1 }) : t('setup.lap1')}
              required
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
          label={t('setup.type')}
          description={draft.direction === 'low_wins' ? t('setup.lowHelp') : t('setup.highHelp')}
          value={draft.direction}
          data={[
            { value: 'low_wins', label: t('setup.low') },
            { value: 'high_wins', label: t('setup.high') },
          ]}
          onChange={(e) => update({ direction: e.currentTarget.value as Draft['direction'] })}
          maw={520}
        />
        <TextInput
          label={t('setup.overdue')}
          required
          description={t('setup.overdueHelp')}
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
        title={t('setup.classes')}
        action={
          <Button
            variant="default"
            onClick={() => update({ classes: [...draft.classes, newClass(days)] })}
          >
            {t('setup.addClass')}
          </Button>
        }
      >
        <Table.ScrollContainer minWidth={days > 1 ? 1000 : 760}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th rowSpan={days > 1 ? 2 : 1}>
                  {t('setup.class')} <RequiredMark />
                </Table.Th>
                {days > 1
                  ? draft.days.map((_, j) => (
                      <Table.Th key={j} colSpan={2} ta="center">
                        {t('setup.dayN', { day: j + 1 })}
                      </Table.Th>
                    ))
                  : dayHeads()}
                <Table.Th rowSpan={days > 1 ? 2 : 1}>{t('setup.junior')}</Table.Th>
                {anyRiders && <Table.Th rowSpan={days > 1 ? 2 : 1}>{t('setup.riders')}</Table.Th>}
                {anyRiders && <Table.Th rowSpan={days > 1 ? 2 : 1}>{t('setup.labels')}</Table.Th>}
                <Table.Th rowSpan={days > 1 ? 2 : 1}>
                  <VisuallyHidden>{t('setup.remove')}</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
              {days > 1 && <Table.Tr>{draft.days.flatMap((_, j) => dayHeads(j))}</Table.Tr>}
            </Table.Thead>
            <Table.Tbody>
              {draft.classes.map((c, i) => {
                const label = c.name.trim() || t('setup.classN', { n: i + 1 });
                const inUse = (ridersByClass[c.original?.name ?? ''] ?? 0) > 0;
                const classRiders = ridersByClass[c.original?.name ?? ''] ?? 0;
                return (
                  <Table.Tr key={c.key}>
                    <Table.Td>
                      <TextInput
                        aria-label={t('setup.nameOf', { label })}
                        required
                        data-field={`classes[${i}].name`}
                        value={c.name}
                        onChange={(e) => updateClass(i, { name: e.currentTarget.value })}
                        onBlur={touch(`classes[${i}].name`)}
                        error={!!errorFor(`classes[${i}].name`)}
                        miw={150}
                      />
                    </Table.Td>
                    {c.days.map((d, j) => {
                      const on = days > 1 ? t('setup.onDay', { day: j + 1 }) : '';
                      const f = `classes[${i}].days.${j + 1}`;
                      return [
                        <Table.Td key={`s${j}`}>
                          <TextInput
                            inputMode="numeric"
                            aria-label={t('setup.sectionsFor', { label, on })}
                            required
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
                            aria-label={t('setup.lapsFor', { label, on })}
                            required
                            data-field={`${f}.laps`}
                            value={d.laps}
                            onChange={(e) => updateClassDay(i, j, { laps: e.currentTarget.value })}
                            error={!!problems.find((p) => p.field === `${f}.laps`)}
                            w={70}
                          />
                        </Table.Td>,
                      ];
                    })}
                    <Table.Td>
                      <Checkbox
                        aria-label={t('setup.juniorFor', { label })}
                        checked={isJunior(c)}
                        onChange={(e) => updateClass(i, { junior: e.currentTarget.checked })}
                        size="md"
                      />
                    </Table.Td>
                    {anyRiders && <Table.Td>{classRiders}</Table.Td>}
                    {anyRiders && (
                      <Table.Td>{labelsFor(c, classRiders) || t('setup.notScored')}</Table.Td>
                    )}
                    <Table.Td>
                      <Button
                        variant="subtle"
                        color="red"
                        aria-label={t('setup.removeClass', { label })}
                        disabled={inUse}
                        title={inUse ? t('setup.hasRiders') : undefined}
                        onClick={() => update({ classes: draft.classes.filter((_, j) => j !== i) })}
                      >
                        {t('setup.remove')}
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
            ? t('setup.total', {
                labels: draft.classes.reduce(
                  (n, c) => n + labelsFor(c, ridersByClass[c.original?.name ?? ''] ?? 0),
                  0,
                ),
                riders,
              })
            : t('setup.ridersLater')}
        </Text>
      </Card>

      <Card title={t('setup.sectionsCard')}>
        <SectionsCard draft={draft} update={update} errorFor={errorFor} />
      </Card>

      <div ref={summaryRef} tabIndex={-1} aria-live="polite">
        {(listed.length > 0 || saveError) && (
          <Alert color="red" title={listed.length ? t('setup.fixThese') : t('setup.notSaved')}>
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
          {mode === 'new' ? t('setup.create') : t('setup.save')}
        </Button>
        {onCancel && (
          <Button size="md" variant="default" onClick={onCancel}>
            {t('setup.cancel')}
          </Button>
        )}
        {mode === 'edit' && !dirty && savedAt && tried && (
          <Text c="light-dark(#2b8a3e, #8ce99a)" role="status">
            {t('setup.saved')}
          </Text>
        )}
      </Group>
    </Stack>
  );
}

function dayHeads(day?: number) {
  const k = day ?? 0;
  return [
    <Table.Th key={`s${k}`}>
      {i18next.t('setup.sections')} <RequiredMark />
    </Table.Th>,
    <Table.Th key={`l${k}`}>
      {i18next.t('setup.laps')} <RequiredMark />
    </Table.Th>,
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
