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
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core';
import { describeTypedScoreProblem, readTypedScores, singleDigitScores } from '@tscore/core';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type {
  AppError,
  CardDesk,
  CardRow,
  DeskRider,
  OpenEvent,
  PenaltyReason,
  PenaltyRow,
} from '../../../shared/ipc';
import { riderName } from '../riders/Riders';
import { CardPreview } from './CardPreview';
import { ErrorAlert } from '../ErrorAlert';

export const PENALTY_LABEL: Record<PenaltyReason, string> = {
  time: 'Time (e.g. lap not finished in the time allowed)',
  dissent: 'Dissent / arguing with an observer',
  outside_assistance: 'Outside assistance',
  course_cutting: 'Course cutting',
  other: 'Other',
};

const HOW: Record<string, { label: string; bg: string; fg: string }> = {
  scan: {
    label: 'Scanned',
    bg: 'light-dark(#e9ecef, #2e3236)',
    fg: 'light-dark(#343a40, #dee2e6)',
  },
  manual: {
    label: 'Typed',
    bg: 'light-dark(#e3eefa, #1a3049)',
    fg: 'light-dark(#0b4a8b, #a5d8ff)',
  },
  edited: {
    label: 'Edited',
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

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!desk || sel !== null || !q) return [];
    return desk.riders
      .filter((r) => String(r.number).startsWith(q) || riderName(r).toLowerCase().includes(q))
      .slice(0, 6);
  }, [desk, query, sel]);

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
    setQuery(`${r.number} ${riderName(r)}`);
    setDay(d);
    setLap(next);
    setText('');
    setFlash('');
    setError(null);
    setTimeout(() => scoresRef.current?.focus(), 0);
  }

  function onRiderKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !desk || sel !== null) return;
    const q = query.trim();
    const exact = desk.riders.find((r) => String(r.number) === q);
    const only = suggestions.length === 1 ? suggestions[0] : undefined;
    const choice = exact ?? only;
    if (choice) {
      e.preventDefault();
      pick(choice);
    }
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
        ? `Changed rider ${rider.number} lap ${lap}: total now ${typed.total}.`
        : `Saved rider ${rider.number} lap ${lap}: total ${typed.total}. Next card.`,
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
      ? describeTypedScoreProblem(typed.problem, scoreValues, rider.classes[0])
      : null;
  // Not finished yet isn't an error: it's shown plainly, not in red.
  const stillTyping = typed.problem?.kind === 'too_few';
  const shownCards = rider ? cardsFor(rider) : desk.cards.slice(0, 20);
  const riderPenalties = rider ? desk.penalties.filter((p) => p.number === rider.number) : [];

  return (
    <Stack gap="lg" maw={1200} onKeyDown={onKey}>
      <Group justify="space-between" wrap="wrap" align="flex-start">
        <div>
          <Title order={2}>Manual entry</Title>
          <Text c="dimmed">
            Type a card in by hand: when it won&apos;t scan, there&apos;s no camera, or you&apos;d
            rather type. Keyboard only: number, <Kbd>Enter</Kbd>, scores, <Kbd>Enter</Kbd>.
            Penalties are added here too.
          </Text>
        </div>
      </Group>

      {desk.riders.length === 0 && (
        <Alert color="blue">No riders yet. Import the entry list on the Riders screen first.</Alert>
      )}

      <Group align="flex-start" gap="lg" wrap="wrap">
        <Paper
          withBorder
          radius="md"
          p="lg"
          component="section"
          aria-label="Card"
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
                Editing an earlier card: rider {editing.number}, lap {editing.lap}. The old scores
                are kept in the audit log.
              </Alert>
            )}

            <Group align="flex-start" gap="md" wrap="wrap">
              <div style={{ flex: '1 1 260px', position: 'relative' }}>
                <TextInput
                  ref={riderRef}
                  label="Rider: number or name"
                  placeholder="e.g. 17 or Sam"
                  size="md"
                  value={query}
                  disabled={editing !== null}
                  data-autofocus
                  autoFocus
                  onChange={(e) => {
                    setQuery(e.currentTarget.value);
                    setSel(null);
                    setFlash('');
                  }}
                  onKeyDown={onRiderKey}
                  {...(!rider &&
                    query.trim() &&
                    suggestions.length === 0 && {
                      error: `No rider matches "${query.trim()}". Check the number, or add them on the Riders screen.`,
                    })}
                  styles={{ error: { color: 'light-dark(#a51111, #ffa8a8)', fontSize: 15 } }}
                />
                {suggestions.length > 0 && (
                  <Paper withBorder mt={4} role="listbox" aria-label="Matching riders">
                    {suggestions.map((s) => (
                      <UnstyledButton
                        key={s.number}
                        role="option"
                        aria-selected="false"
                        onClick={() => pick(s)}
                        style={{
                          display: 'flex',
                          gap: 12,
                          width: '100%',
                          padding: '8px 12px',
                          minHeight: 44,
                          alignItems: 'center',
                          borderTop: '1px solid light-dark(#e9ecef, #2e3236)',
                        }}
                      >
                        <Text fw={800} w={40} size="lg">
                          {s.number}
                        </Text>
                        <Text>
                          {riderName(s)} · {s.classes[0]}
                        </Text>
                      </UnstyledButton>
                    ))}
                  </Paper>
                )}
              </div>
              {multiDay && (
                <NativeSelect
                  label="Day"
                  size="md"
                  w={110}
                  value={String(day)}
                  disabled={!rider || editing !== null}
                  onChange={(e) => setDay(Number(e.currentTarget.value))}
                  data={desk.days
                    .filter((d) => !rider || rider.rides[d.day])
                    .map((d) => ({ value: String(d.day), label: `Day ${d.day}` }))}
                />
              )}
              <NativeSelect
                label="Lap"
                size="md"
                w={110}
                value={String(lap)}
                disabled={!rider || editing !== null}
                onChange={(e) => setLap(Number(e.currentTarget.value))}
                data={Array.from({ length: rides?.laps ?? 1 }, (_, i) => String(i + 1))}
              />
              <TextInput
                label="Card in at"
                type="time"
                size="md"
                w={150}
                value={inAt}
                disabled={editing !== null}
                onChange={(e) => setInAt(e.currentTarget.value || nowHHMM())}
                description="Laptop time. Change for an earlier card."
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
                  {rider.classes[0]} · {sections} sections · lap {lap} of {rides?.laps ?? 0}
                  {multiDay ? ` · day ${day}` : ''}
                </Text>
                {rider.status !== 'riding' && (
                  <Badge color="gray" variant="light">
                    Marked {rider.status.toUpperCase()}
                  </Badge>
                )}
              </Group>
            )}
            {rider && !rides && (
              <Alert color="orange">
                {rider.classes[0]} doesn&apos;t ride on day {day}.
              </Alert>
            )}

            {existing && (
              <Alert color="orange" role="alert">
                <Group justify="space-between" wrap="wrap" gap="sm">
                  <span>
                    Lap {lap} for rider {existing.number} is already in.
                  </span>
                  <Button variant="default" onClick={() => edit(existing)}>
                    Edit that card instead
                  </Button>
                </Group>
              </Alert>
            )}

            <TextInput
              ref={scoresRef}
              label="Scores, section 1 onwards"
              description={
                singleDigitScores(scoreValues)
                  ? `One digit per section (${scoreValues.join(' ')}). Spaces are ignored.`
                  : `Separate the scores with spaces (${scoreValues.join(' ')}).`
              }
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 0102530010"
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
                {editing ? 'Save change' : 'Save card'}
              </Button>
              <Button
                size="md"
                variant="default"
                onClick={() => clear()}
                rightSection={<Kbd>Esc</Kbd>}
              >
                {editing ? 'Cancel edit' : 'Clear'}
              </Button>
              <Button
                size="md"
                variant="default"
                ml="auto"
                disabled={!rider}
                onClick={() => setPenaltyOpen(true)}
              >
                Add penalty…
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
                  setFlash(`Penalty of ${points} added for rider ${rider.number}.`);
                }}
              />
            )}
            {riderPenalties.length > 0 && (
              <PenaltyList
                penalties={riderPenalties}
                onRemoved={(next) => {
                  setDesk(next);
                  setFlash(`Penalty removed for rider ${rider?.number ?? ''}. Logged.`);
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
          aria-label="Card preview"
          style={{ flex: '0 1 auto' }}
        >
          <Stack gap="xs">
            <div>
              <Title order={3} size="h4">
                Card preview
              </Title>
              <Text c="dimmed" size="sm" maw={396}>
                Fills in as you type. Hold it against the card in your hand: the punches should sit
                in the same places.
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
                name: rider ? riderName(rider) : 'Pick a rider',
                detail: rider
                  ? `${rider.classes[0] ?? ''} · Lap ${lap} of ${rides?.laps ?? 0}`
                  : 'Class and lap show here',
              }}
            />
            <VisuallyHidden role="status">
              {rider && text.trim() ? `Lap total ${typed.total}` : ''}
            </VisuallyHidden>
          </Stack>
        </Paper>
      </Group>

      <Paper withBorder radius="md" p="md" component="section" aria-label="Earlier cards">
        <Group justify="space-between" mb="xs" wrap="wrap">
          <Title order={3} size="h4">
            {rider ? `Rider ${rider.number}'s cards` : 'Earlier cards'}
          </Title>
          <Text c="dimmed" size="sm">
            {rider ? 'All laps' : 'Newest first'}
          </Text>
        </Group>
        {shownCards.length === 0 ? (
          <Text c="dimmed">No cards yet.</Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>No.</Table.Th>
                  {multiDay && <Table.Th>Day</Table.Th>}
                  <Table.Th>Lap</Table.Th>
                  <Table.Th>Scores</Table.Th>
                  <Table.Th>Total</Table.Th>
                  <Table.Th>In at</Table.Th>
                  <Table.Th>How</Table.Th>
                  <Table.Th>
                    <VisuallyHidden>Edit</VisuallyHidden>
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
                            {how.label}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Button
                          variant="default"
                          size="xs"
                          aria-label={`Edit rider ${c.number} lap ${c.lap}`}
                          onClick={() => edit(c)}
                        >
                          Edit
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
          Edit loads the card into the form. The old scores, who changed them and when are kept in
          the audit log.
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
      aria-label="Add penalty"
      style={{ borderColor: '#f08c00', borderWidth: 2, background: 'light-dark(#fffaf2, #2f2413)' }}
    >
      <Stack gap="sm">
        <Text fw={700} fz="lg">
          Penalty for rider {props.rider.number} ({riderName(props.rider)})
        </Text>
        <Group align="flex-start" gap="md" wrap="wrap">
          <TextInput
            label="Points"
            type="number"
            min={1}
            w={110}
            value={points}
            data-autofocus
            autoFocus
            onChange={(e) => setPoints(e.currentTarget.value)}
          />
          <NativeSelect
            label="Reason"
            style={{ flex: '1 1 260px' }}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value as PenaltyReason)}
            data={(Object.keys(PENALTY_LABEL) as PenaltyReason[]).map((k) => ({
              value: k,
              label: PENALTY_LABEL[k],
            }))}
          />
          <NativeSelect
            label="Lap"
            w={140}
            value={lap}
            onChange={(e) => setLap(e.currentTarget.value)}
            data={[
              { value: '', label: 'Not a lap' },
              ...Array.from({ length: props.laps }, (_, i) => ({
                value: String(i + 1),
                label: `Lap ${i + 1}${props.multiDay ? ` (day ${props.day})` : ''}`,
              })),
            ]}
          />
        </Group>
        <TextInput
          label={reason === 'other' ? 'What for' : 'Note (optional)'}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <Text size="sm" c="dimmed">
          A section over the 90-second limit isn&apos;t a penalty here: it&apos;s a 5 on the card,
          typed with the scores.
        </Text>
        {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
        <Group gap="sm">
          <Button disabled={!valid} onClick={() => void save()}>
            Save penalty
          </Button>
          <Button variant="default" onClick={props.onCancel}>
            Cancel
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
  async function remove(id: string) {
    const r = await window.tscore.removePenalty(id);
    if (r.ok) props.onRemoved(r.value);
    else props.onError(r.error);
  }
  return (
    <Stack gap={6} component="section" aria-label="Penalties for this rider">
      <Text fw={700}>Penalties for this rider</Text>
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
            <strong>+{p.points}</strong> · {PENALTY_LABEL[p.reason].replace(/ \(.*\)$/, '')}
            {p.note ? ` (${p.note})` : ''} · {p.lap ? `lap ${p.lap}` : 'not a lap'} · added{' '}
            {timeOf(p.createdAt)}
          </span>
          <Button
            variant="default"
            size="xs"
            aria-label={`Remove penalty of ${p.points}`}
            onClick={() => void remove(p.id)}
          >
            Remove
          </Button>
        </Group>
      ))}
      <Text size="sm" c="dimmed">
        Added to the rider&apos;s total on the results. Adding or removing one is logged.
      </Text>
    </Stack>
  );
}
