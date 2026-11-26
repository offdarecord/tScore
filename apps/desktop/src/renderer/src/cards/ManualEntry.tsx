import {
  Alert,
  Badge,
  Button,
  Group,
  Kbd,
  NativeSelect,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { describeTypedScoreProblem, readTypedScores, singleDigitScores } from '@tscore/core';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type {
  AppError,
  CardDesk,
  CardRow,
  DeskRider,
  OpenEvent,
  PenaltyReason,
  PenaltyRow,
} from '../../../shared/ipc';
import { pickedText, RiderPicker } from '../riders/RiderPicker';
import { riderName } from '../riders/Riders';
import { CardPreview } from './CardPreview';
import { ErrorAlert } from '../ErrorAlert';
import { coreT } from '../i18n';

export const PENALTY_LABEL = {
  time: 'penalty.time',
  dissent: 'penalty.dissent',
  outside_assistance: 'penalty.outsideAssistance',
  course_cutting: 'penalty.courseCutting',
  other: 'penalty.other',
} as const satisfies Record<PenaltyReason, string>;

/** The reason as it reads in a list (no explanation in brackets). */
const PENALTY_SHORT = { ...PENALTY_LABEL, time: 'penalty.timeShort' } as const;

const HOW: Record<
  string,
  { label: 'manual.scanned' | 'manual.typed' | 'manual.edited'; bg: string; fg: string }
> = {
  scan: {
    label: 'manual.scanned',
    bg: 'light-dark(#e9ecef, #2e3236)',
    fg: 'light-dark(#343a40, #dee2e6)',
  },
  manual: {
    label: 'manual.typed',
    bg: 'light-dark(#e3eefa, #1a3049)',
    fg: 'light-dark(#0b4a8b, #a5d8ff)',
  },
  edited: {
    label: 'manual.edited',
    bg: 'light-dark(#fff0de, #3f2a10)',
    fg: 'light-dark(#8a3b00, #ffc078)',
  },
};

const pad = (n: number) => String(n).padStart(2, '0');
const nowHHMM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/**
 * The time the desk typed, on the event day's date (today if the day has no date), in the
 * laptop's time zone. Not today's date: cards are often typed in after midnight or the next
 * morning, and they must still count on the day they were ridden.
 */
function dayAt(date: string | undefined, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  const [y, mo, dd] = (date ?? '').split('-').map(Number);
  if (y && mo && dd) d.setFullYear(y, mo - 1, dd);
  d.setHours(h ?? d.getHours(), m ?? d.getMinutes(), 0, 0);
  return d.toISOString();
}
const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Where {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
}

/**
 * Manual entry: type a card in by hand when it won't scan, there's no camera, or the desk would
 * rather type. Keyboard first: number, Enter, scores, Enter. Also where earlier cards are edited
 * and where the rare penalties are added (agreed with the scorer, 24 Nov).
 */
export function ManualEntry({ event }: { readonly event: OpenEvent }) {
  const { t } = useTranslation();
  const [desk, setDesk] = useState<CardDesk | null>(null);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [day, setDay] = useState(1);
  const [lap, setLap] = useState(1);
  const [inAt, setInAt] = useState(nowHHMM);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Where | null>(null);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState<AppError | null>(null);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const riderRef = useRef<HTMLInputElement>(null);
  const scoresRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.tscore.cardDesk().then((r) => (r.ok ? setDesk(r.value) : setError(r.error)));
  }, [event]);

  const rider = desk?.riders.find((r) => r.number === sel) ?? null;
  const rides = rider?.rides[day];
  const sections = rides?.sections ?? 0;
  const scoreValues = desk?.scoreValues ?? [0, 1, 2, 3, 5];
  const typed = readTypedScores(text, sections, scoreValues);
  const cardsFor = (w: Pick<Where, 'number'>) =>
    desk?.cards.filter((c) => c.number === w.number) ?? [];
  const existing =
    rider && !editing
      ? desk?.cards.find((c) => c.number === rider.number && c.day === day && c.lap === lap)
      : undefined;
  const multiDay = (desk?.days.length ?? 1) > 1;

  function clear(message = '') {
    setQuery('');
    setSel(null);
    setText('');
    setEditing(null);
    setPenaltyOpen(false);
    setError(null);
    setFlash(message);
    setInAt(nowHHMM());
    riderRef.current?.focus();
  }

  function pick(r: DeskRider) {
    // Stay on the day being typed, unless this rider's class doesn't ride it.
    const d = r.rides[day] ? day : Number(Object.keys(r.rides)[0] ?? 1);
    const laps = r.rides[d]?.laps ?? 1;
    const done = new Set(
      cardsFor(r)
        .filter((c) => c.day === d)
        .map((c) => c.lap),
    );
    let next = 1;
    while (next < laps && done.has(next)) next++;
    setSel(r.number);
    setQuery(pickedText(r));
    setDay(d);
    setLap(next);
    setText('');
    setFlash('');
    setError(null);
    setTimeout(() => scoresRef.current?.focus(), 0);
  }

  function edit(c: CardRow) {
    const r = desk?.riders.find((x) => x.number === c.number);
    if (!r) return;
    setEditing({ number: c.number, day: c.day, lap: c.lap });
    setSel(c.number);
    setQuery(`${c.number} ${riderName(r)}`);
    setDay(c.day);
    setLap(c.lap);
    setText(c.scores.map((s) => s ?? '?').join(singleDigitScores(scoreValues) ? '' : ' '));
    setFlash('');
    setError(null);
    setTimeout(() => scoresRef.current?.focus(), 0);
  }

  async function save() {
    if (!rider || !typed.complete) return;
    const scores = typed.scores.filter((s): s is number => s !== null);
    const r = await window.tscore.saveCard({
      number: rider.number,
      day,
      lap,
      scores,
      receivedAt: dayAt(desk?.days.find((d) => d.day === day)?.date, inAt),
      editing: editing !== null,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDesk(r.value);
    clear(
      editing
        ? t('manual.changed', { number: rider.number, lap, total: typed.total })
        : t('manual.saved', { number: rider.number, lap, total: typed.total }),
    );
  }

  function onKey(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      clear();
    }
  }

  if (!desk) {
    return error ? <ErrorAlert error={error} /> : null;
  }

  const problem =
    rider && rides && text.trim() !== '' && typed.problem
      ? describeTypedScoreProblem(typed.problem, scoreValues, rider.classes[0], coreT)
      : null;
  // Not finished yet isn't an error: it's shown plainly, not in red.
  const stillTyping = typed.problem?.kind === 'too_few';
  const shownCards = rider ? cardsFor(rider) : desk.cards.slice(0, 20);
  const riderPenalties = rider ? desk.penalties.filter((p) => p.number === rider.number) : [];

  return (
    <Stack gap="lg" maw={1200} onKeyDown={onKey}>
      <Group justify="space-between" wrap="wrap" align="flex-start">
        <div>
          <Title order={2}>{t('manual.title')}</Title>
          <Text c="dimmed">
            <Trans i18nKey="manual.intro" components={{ kbd: <Kbd /> }} />
          </Text>
        </div>
      </Group>

      {desk.riders.length === 0 && <Alert color="blue">{t('manual.noRiders')}</Alert>}

      <Group align="flex-start" gap="lg" wrap="wrap">
        <Paper
          withBorder
          radius="md"
          p="lg"
          component="section"
          aria-label={t('manual.card')}
          style={{
            flex: '999 1 440px',
            minWidth: 0,
            borderWidth: 2,
            borderColor: editing ? 'light-dark(#1864ab, #4dabf7)' : undefined,
          }}
        >
          <Stack gap="md">
            {editing && (
              <Alert color="blue" role="status">
                {t('manual.editing', { number: editing.number, lap: editing.lap })}
              </Alert>
            )}

            <Group align="flex-start" gap="md" wrap="wrap">
              <div style={{ flex: '1 1 260px' }}>
                <RiderPicker
                  ref={riderRef}
                  riders={desk?.riders}
                  label={t('manual.rider')}
                  required
                  placeholder={t('manual.riderPlaceholder')}
                  size="md"
                  query={query}
                  picked={sel !== null}
                  disabled={editing !== null}
                  data-autofocus
                  autoFocus
                  onQueryChange={(q) => {
                    setQuery(q);
                    setSel(null);
                    setFlash('');
                  }}
                  onPick={pick}
                />
              </div>
              {multiDay && (
                <NativeSelect
                  label={t('manual.day')}
                  size="md"
                  w={110}
                  value={String(day)}
                  disabled={!rider || editing !== null}
                  onChange={(e) => setDay(Number(e.currentTarget.value))}
                  data={desk.days
                    .filter((d) => !rider || rider.rides[d.day])
                    .map((d) => ({
                      value: String(d.day),
                      label: t('manual.dayN', { day: d.day }),
                    }))}
                />
              )}
              <NativeSelect
                label={t('manual.lap')}
                size="md"
                w={110}
                value={String(lap)}
                disabled={!rider || editing !== null}
                onChange={(e) => setLap(Number(e.currentTarget.value))}
                data={Array.from({ length: rides?.laps ?? 1 }, (_, i) => String(i + 1))}
              />
              <TextInput
                label={t('manual.inAt')}
                type="time"
                size="md"
                w={150}
                value={inAt}
                disabled={editing !== null}
                onChange={(e) => setInAt(e.currentTarget.value || nowHHMM())}
                description={t('manual.inAtHelp')}
              />
            </Group>

            {rider && (
              <Group gap="md" align="baseline" wrap="wrap">
                <Text fz={48} fw={800} lh={1}>
                  {rider.number}
                </Text>
                <Text fz={24} fw={700}>
                  {riderName(rider)}
                </Text>
                <Text fz={18}>
                  {t('manual.riderLine', {
                    class: rider.classes[0] ?? '',
                    sections,
                    lap,
                    laps: rides?.laps ?? 0,
                  })}
                  {multiDay ? t('manual.riderLineDay', { day }) : ''}
                </Text>
                {rider.status !== 'riding' && (
                  <Badge color="gray" variant="light">
                    {t('manual.marked', { status: rider.status.toUpperCase() })}
                  </Badge>
                )}
              </Group>
            )}
            {rider && !rides && (
              <Alert color="orange">
                {t('manual.notThatDay', { class: rider.classes[0] ?? '', day })}
              </Alert>
            )}

            {existing && (
              <Alert color="orange" role="alert">
                <Group justify="space-between" wrap="wrap" gap="sm">
                  <span>{t('manual.alreadyIn', { lap, number: existing.number })}</span>
                  <Button variant="default" onClick={() => edit(existing)}>
                    {t('manual.editInstead')}
                  </Button>
                </Group>
              </Alert>
            )}

            <TextInput
              ref={scoresRef}
              label={t('manual.scores')}
              required
              description={
                singleDigitScores(scoreValues)
                  ? t('manual.oneDigit', { values: scoreValues.join(' ') })
                  : t('manual.spaced', { values: scoreValues.join(' ') })
              }
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('manual.scoresPlaceholder')}
              size="lg"
              value={text}
              disabled={!rider || !rides || existing !== undefined}
              onChange={(e) => {
                setText(e.currentTarget.value);
                setFlash('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                }
              }}
              {...(problem && !stillTyping && { error: problem })}
              styles={{
                input: { fontFamily: 'Consolas, monospace', letterSpacing: '0.2em', fontSize: 26 },
                // Mantine's default red is too light on white for WCAG AA at this size.
                error: { color: 'light-dark(#a51111, #ffa8a8)', fontSize: 15, fontWeight: 600 },
              }}
            />
            {problem && stillTyping && (
              <Text size="sm" mt={-8}>
                {problem}
              </Text>
            )}

            <Group gap="sm">
              <Button
                size="md"
                disabled={!rider || !typed.complete || existing !== undefined}
                onClick={() => void save()}
                rightSection={<Kbd>Enter</Kbd>}
              >
                {editing ? t('manual.saveChange') : t('manual.saveCard')}
              </Button>
              <Button
                size="md"
                variant="default"
                onClick={() => clear()}
                rightSection={<Kbd>Esc</Kbd>}
              >
                {editing ? t('manual.cancelEdit') : t('manual.clear')}
              </Button>
              <Button
                size="md"
                variant="default"
                ml="auto"
                disabled={!rider}
                onClick={() => setPenaltyOpen(true)}
              >
                {t('manual.addPenalty')}
              </Button>
            </Group>

            {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
            {flash && (
              <Alert color="green" role="status" fz="lg">
                ✓ {flash}
              </Alert>
            )}

            {rider && penaltyOpen && (
              <PenaltyForm
                rider={rider}
                laps={rides?.laps ?? 1}
                lap={lap}
                day={day}
                multiDay={multiDay}
                onCancel={() => setPenaltyOpen(false)}
                onSaved={(next, points) => {
                  setDesk(next);
                  setPenaltyOpen(false);
                  setFlash(t('manual.penaltyAdded', { points, number: rider.number }));
                }}
              />
            )}
            {riderPenalties.length > 0 && (
              <PenaltyList
                penalties={riderPenalties}
                onRemoved={(next) => {
                  setDesk(next);
                  setFlash(t('manual.penaltyRemoved', { number: rider?.number ?? '' }));
                }}
                onError={setError}
              />
            )}
          </Stack>
        </Paper>

        <Paper
          withBorder
          radius="md"
          p="md"
          component="section"
          aria-label={t('manual.preview')}
          style={{ flex: '0 1 auto' }}
        >
          <Stack gap="xs">
            <div>
              <Title order={3} size="h4">
                {t('manual.preview')}
              </Title>
              <Text c="dimmed" size="sm" maw={396}>
                {t('manual.previewHelp')}
              </Text>
            </div>
            <CardPreview
              rows={desk.cardRows}
              sections={rider && rides ? sections : 0}
              tokens={typed.tokens}
              scores={typed.scores}
              scoreValues={scoreValues}
              active={rider !== null}
              total={text.trim() ? typed.total : null}
              label={{
                number: rider ? String(rider.number) : '—',
                name: rider ? riderName(rider) : t('manual.pickRider'),
                detail: rider
                  ? t('manual.previewDetail', {
                      class: rider.classes[0] ?? '',
                      lap,
                      laps: rides?.laps ?? 0,
                    })
                  : t('manual.previewEmpty'),
              }}
            />
            <VisuallyHidden role="status">
              {rider && text.trim() ? t('manual.lapTotal', { total: typed.total }) : ''}
            </VisuallyHidden>
          </Stack>
        </Paper>
      </Group>

      <Paper withBorder radius="md" p="md" component="section" aria-label={t('manual.earlier')}>
        <Group justify="space-between" mb="xs" wrap="wrap">
          <Title order={3} size="h4">
            {rider ? t('manual.riderCards', { number: rider.number }) : t('manual.earlier')}
          </Title>
          <Text c="dimmed" size="sm">
            {rider ? t('manual.allLaps') : t('manual.newest')}
          </Text>
        </Group>
        {shownCards.length === 0 ? (
          <Text c="dimmed">{t('manual.noCards')}</Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('manual.number')}</Table.Th>
                  {multiDay && <Table.Th>{t('manual.day')}</Table.Th>}
                  <Table.Th>{t('manual.lap')}</Table.Th>
                  <Table.Th>{t('manual.scoresCol')}</Table.Th>
                  <Table.Th>{t('manual.total')}</Table.Th>
                  <Table.Th>{t('manual.inAtCol')}</Table.Th>
                  <Table.Th>{t('manual.how')}</Table.Th>
                  <Table.Th>
                    <VisuallyHidden>{t('manual.edit')}</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shownCards.map((c) => {
                  const how = HOW[c.edited ? 'edited' : c.source] ?? HOW['scan'];
                  const isEditing =
                    editing?.number === c.number && editing.day === c.day && editing.lap === c.lap;
                  return (
                    <Table.Tr
                      key={`${c.number}-${c.day}-${c.lap}`}
                      {...(isEditing && { bg: 'light-dark(#e3eefa, #1a3049)' })}
                    >
                      <Table.Td fw={700}>{c.number}</Table.Td>
                      {multiDay && <Table.Td>{c.day}</Table.Td>}
                      <Table.Td>{c.lap}</Table.Td>
                      <Table.Td ff="Consolas, monospace" style={{ letterSpacing: '0.08em' }}>
                        {c.scores
                          .map((s) => s ?? '?')
                          .join(singleDigitScores(scoreValues) ? '' : ' ')}
                      </Table.Td>
                      <Table.Td fw={700}>
                        {c.scores.reduce<number>((a, s) => a + (s ?? 0), 0)}
                      </Table.Td>
                      <Table.Td>{timeOf(c.receivedAt)}</Table.Td>
                      <Table.Td>
                        {how && (
                          <Text
                            span
                            size="sm"
                            fw={600}
                            px={10}
                            py={2}
                            style={{ background: how.bg, color: how.fg, borderRadius: 999 }}
                          >
                            {t(how.label)}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Button
                          variant="default"
                          size="xs"
                          aria-label={t('manual.editLabel', { number: c.number, lap: c.lap })}
                          onClick={() => edit(c)}
                        >
                          {t('manual.edit')}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <Text c="dimmed" size="sm" mt="xs">
          {t('manual.editHelp')}
        </Text>
      </Paper>
    </Stack>
  );
}

function PenaltyForm(props: {
  rider: DeskRider;
  laps: number;
  lap: number;
  day: number;
  multiDay: boolean;
  onCancel: () => void;
  onSaved: (desk: CardDesk, points: number) => void;
}) {
  const { t } = useTranslation();
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState<PenaltyReason>('time');
  const [lap, setLap] = useState(String(props.lap));
  const [note, setNote] = useState('');
  const [error, setError] = useState<AppError | null>(null);
  const n = Number(points);
  const valid = Number.isInteger(n) && n >= 1 && (reason !== 'other' || note.trim() !== '');

  async function save() {
    if (!valid) return;
    const r = await window.tscore.addPenalty({
      number: props.rider.number,
      points: n,
      reason,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(lap !== '' && { lap: Number(lap), day: props.day }),
    });
    if (r.ok) props.onSaved(r.value, n);
    else setError(r.error);
  }

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      component="section"
      aria-label={t('manual.addPenaltyRegion')}
      style={{ borderColor: '#f08c00', borderWidth: 2, background: 'light-dark(#fffaf2, #2f2413)' }}
    >
      <Stack gap="sm">
        <Text fw={700} fz="lg">
          {t('manual.penaltyFor', { number: props.rider.number, name: riderName(props.rider) })}
        </Text>
        <Group align="flex-start" gap="md" wrap="wrap">
          <TextInput
            label={t('manual.points')}
            required
            type="number"
            min={1}
            w={110}
            value={points}
            data-autofocus
            autoFocus
            onChange={(e) => setPoints(e.currentTarget.value)}
          />
          <NativeSelect
            label={t('manual.reason')}
            style={{ flex: '1 1 260px' }}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value as PenaltyReason)}
            data={(Object.keys(PENALTY_LABEL) as PenaltyReason[]).map((k) => ({
              value: k,
              label: t(PENALTY_LABEL[k]),
            }))}
          />
          <NativeSelect
            label={t('manual.lap')}
            w={140}
            value={lap}
            onChange={(e) => setLap(e.currentTarget.value)}
            data={[
              { value: '', label: t('manual.notALap') },
              ...Array.from({ length: props.laps }, (_, i) => ({
                value: String(i + 1),
                label: props.multiDay
                  ? t('manual.lapNDay', { lap: i + 1, day: props.day })
                  : t('manual.lapN', { lap: i + 1 }),
              })),
            ]}
          />
        </Group>
        <TextInput
          label={reason === 'other' ? t('manual.whatFor') : t('manual.note')}
          required={reason === 'other'}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <Text size="sm" c="dimmed">
          {t('manual.timeLimit')}
        </Text>
        {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
        <Group gap="sm">
          <Button disabled={!valid} onClick={() => void save()}>
            {t('manual.savePenalty')}
          </Button>
          <Button variant="default" onClick={props.onCancel}>
            {t('manual.cancel')}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function PenaltyList(props: {
  penalties: readonly PenaltyRow[];
  onRemoved: (desk: CardDesk) => void;
  onError: (e: AppError) => void;
}) {
  const { t } = useTranslation();
  async function remove(id: string) {
    const r = await window.tscore.removePenalty(id);
    if (r.ok) props.onRemoved(r.value);
    else props.onError(r.error);
  }
  return (
    <Stack gap={6} component="section" aria-label={t('manual.penalties')}>
      <Text fw={700}>{t('manual.penalties')}</Text>
      {props.penalties.map((p) => (
        <Group
          key={p.id}
          justify="space-between"
          wrap="wrap"
          gap="sm"
          px="sm"
          py={6}
          style={{
            background: 'light-dark(#fff0de, #3f2a10)',
            color: 'light-dark(#6b2e00, #ffc078)',
            borderRadius: 8,
          }}
        >
          <span>
            <strong>+{p.points}</strong> · {t(PENALTY_SHORT[p.reason])}
            {p.note ? ` (${p.note})` : ''} ·{' '}
            {p.lap ? t('manual.penaltyLap', { lap: p.lap }) : t('manual.penaltyNotLap')} ·{' '}
            {t('manual.penaltyAddedAt', { time: timeOf(p.createdAt) })}
          </span>
          <Button
            variant="default"
            size="xs"
            aria-label={t('manual.removePenalty', { points: p.points })}
            onClick={() => void remove(p.id)}
          >
            {t('manual.remove')}
          </Button>
        </Group>
      ))}
      <Text size="sm" c="dimmed">
        {t('manual.penaltiesHelp')}
      </Text>
    </Stack>
  );
}
