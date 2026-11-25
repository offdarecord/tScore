import {
  Alert,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  NumberInput,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DEFAULT_SERIES_POINTS, parsePointsScale, type SeriesRules } from '@tscore/core';
import { useEffect, useState } from 'react';
import type {
  AppError,
  ExportKind,
  Outcome,
  RecentEventInfo,
  SeriesChange,
  SeriesSummary,
  SeriesView,
} from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';
import { formatDate } from '../format';

/**
 * Series points: a tally across the rounds of a series, from each round's final results. Lists
 * the series on this laptop; one opens to its rounds, rules and tally.
 */
export function Series({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<SeriesSummary[] | null>(null);
  const [open, setOpen] = useState<SeriesView | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    void window.tscore.listSeries().then((r) => (r.ok ? setList(r.value) : setError(r.error)));
  }, [open]);

  async function show(call: Promise<Outcome<SeriesView>>) {
    setError(null);
    const r = await call;
    if (r.ok) setOpen(r.value);
    else setError(r.error);
  }

  if (open) {
    return <SeriesDetail view={open} onChange={setOpen} onBack={() => setOpen(null)} />;
  }

  return (
    <Stack gap="lg" maw={900}>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Series points</Title>
          <Text c="dimmed">
            A points tally across the rounds of a series, worked out from each round&apos;s final
            results.
          </Text>
        </div>
        <Button variant="subtle" color="gray" onClick={onBack}>
          ← All events
        </Button>
      </Group>
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="series-new">
        <Title order={3} size="h4" id="series-new" mb="sm">
          New series
        </Title>
        <Group align="flex-end">
          <TextInput
            label="Series name"
            required
            placeholder="e.g. Winter Series 2027"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            onClick={() => {
              void show(window.tscore.newSeries(name));
              setName('');
            }}
          >
            Make series
          </Button>
        </Group>
      </Paper>
      <section aria-labelledby="series-list">
        <Title order={3} size="h4" id="series-list" mb="sm">
          Series on this laptop
        </Title>
        {list?.length === 0 && <Text c="dimmed">None yet.</Text>}
        <Stack gap="xs">
          {list?.map((s) => (
            <Group key={s.file} justify="space-between">
              <Button variant="default" onClick={() => void show(window.tscore.seriesView(s.file))}>
                {s.name}
              </Button>
              <Text size="sm" c="dimmed">
                {s.rounds} {s.rounds === 1 ? 'round' : 'rounds'}
              </Text>
            </Group>
          ))}
        </Stack>
      </section>
    </Stack>
  );
}

const STATE_WORDS: Record<SeriesView['rounds'][number]['state'], string> = {
  final: 'Final',
  provisional: 'Not final yet',
  reopened: 'Reopened',
  missing: 'Not found',
  unreadable: "Can't be read",
};

function SeriesDetail(props: {
  view: SeriesView;
  onChange: (v: SeriesView) => void;
  onBack: () => void;
}) {
  const { view } = props;
  const [error, setError] = useState<AppError | null>(null);
  const [recent, setRecent] = useState<RecentEventInfo[]>([]);
  const [pick, setPick] = useState('');
  const [scale, setScale] = useState(view.rules.points.join(', '));
  const [initials, setInitials] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>('class-0');

  useEffect(() => {
    void window.tscore.recentEvents().then(setRecent);
  }, []);
  async function change(c: SeriesChange) {
    setError(null);
    const r = await window.tscore.updateSeries(view.file, c);
    if (r.ok) props.onChange(r.value);
    else setError(r.error);
  }
  const rules = (patch: {
    points?: readonly number[];
    bestOf?: number | undefined;
    ties?: SeriesRules['ties'];
  }) => {
    const { bestOf, ...rest } = { ...view.rules, ...patch };
    const next: SeriesRules = { ...rest, ...(bestOf !== undefined && { bestOf }) };
    if (patch.points) setScale(patch.points.join(', '));
    void change({ rules: next });
  };
  const points = parsePointsScale(scale);
  const inSeries = new Set(view.rounds.map((r) => r.folder));
  const addable = recent.filter((r) => !r.missing && !inSeries.has(r.folder));

  async function save(kind: ExportKind) {
    setSaved(null);
    setError(null);
    const r = await window.tscore.exportSeries(view.file, kind, initials);
    if (!r.ok) setError(r.error);
    else if (r.value) setSaved(r.value);
  }

  const classes = view.tally.classes;
  const best = view.rules.bestOf !== undefined;

  return (
    <Stack gap="lg" maw={1300}>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{view.name}</Title>
          <Text c="dimmed">Series points. Only rounds with final results count.</Text>
        </div>
        <Button variant="subtle" color="gray" onClick={props.onBack}>
          ← All series
        </Button>
      </Group>
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}

      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="rounds-h">
        <Title order={3} size="h4" id="rounds-h" mb="sm">
          Rounds
        </Title>
        {view.rounds.length === 0 && (
          <Text c="dimmed">No rounds yet. Add each round&apos;s event.</Text>
        )}
        <Stack gap={6}>
          {view.rounds.map((r) => (
            <Group key={r.folder} justify="space-between" wrap="nowrap">
              <Text>
                <strong>Round {r.round}</strong>: {r.name || r.folder}
                {r.date ? ` · ${formatDate(r.date)}` : ''}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Text
                  span
                  size="sm"
                  fw={700}
                  px={10}
                  py={2}
                  style={{
                    borderRadius: 999,
                    background: r.state === 'final' ? '#e3f4e6' : '#fff0de',
                    color: r.state === 'final' ? '#1f5f26' : '#7a3500',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {STATE_WORDS[r.state]}
                  {r.state === 'final' && r.revision && r.revision > 1
                    ? ` (rev ${r.revision})`
                    : ''}
                </Text>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="gray"
                  aria-label={`Remove round ${r.round}`}
                  onClick={() => void change({ removeRound: r.folder })}
                >
                  Remove
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
        <Group mt="md" align="flex-end">
          <NativeSelect
            label="Add a round from your events"
            value={pick}
            onChange={(e) => setPick(e.currentTarget.value)}
            data={[
              { value: '', label: addable.length ? 'Choose an event…' : 'No other recent events' },
              ...addable.map((r) => ({
                value: r.folder,
                label: `${r.date ? `${formatDate(r.date)} · ` : ''}${r.name}`,
              })),
            ]}
            style={{ flex: 1 }}
          />
          <Button
            variant="default"
            disabled={!pick}
            onClick={() => {
              void change({ addRound: pick });
              setPick('');
            }}
          >
            Add round
          </Button>
          <Button
            variant="default"
            onClick={() =>
              void window.tscore.addSeriesRoundFile(view.file).then((r) => {
                if (!r.ok) setError(r.error);
                else if (r.value) props.onChange(r.value);
              })
            }
          >
            Add from file…
          </Button>
        </Group>
      </Paper>

      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="rules-h">
        <Title order={3} size="h4" id="rules-h" mb="sm">
          Rules
        </Title>
        <Stack gap="sm">
          <Group align="flex-end">
            <TextInput
              label="Points for 1st, 2nd, 3rd …"
              required
              description="Places past the end score 0."
              value={scale}
              onChange={(e) => setScale(e.currentTarget.value)}
              error={points ? null : 'Whole numbers, highest first, separated by commas.'}
              style={{ flex: 1 }}
            />
            <Button
              variant="default"
              disabled={!points || points.join(',') === view.rules.points.join(',')}
              onClick={() => points && rules({ points })}
            >
              Save points
            </Button>
            <Button
              variant="subtle"
              color="gray"
              onClick={() => rules({ points: [...DEFAULT_SERIES_POINTS] })}
            >
              Usual points
            </Button>
          </Group>
          <Group align="flex-start">
            <NativeSelect
              label="Rounds that count"
              value={best ? 'best' : 'all'}
              onChange={(e) =>
                rules(
                  e.currentTarget.value === 'best'
                    ? { bestOf: Math.max(1, view.rounds.length - 1) }
                    : { bestOf: undefined },
                )
              }
              data={[
                { value: 'all', label: 'Every round' },
                { value: 'best', label: 'Best rounds only' },
              ]}
            />
            {best && (
              <NumberInput
                label="Best how many?"
                min={1}
                max={50}
                value={view.rules.bestOf}
                onChange={(v) => typeof v === 'number' && v >= 1 && rules({ bestOf: v })}
                w={160}
              />
            )}
            <NativeSelect
              label="Equal totals"
              value={view.rules.ties}
              onChange={(e) => rules({ ties: e.currentTarget.value as SeriesRules['ties'] })}
              data={[
                { value: 'share', label: 'Share the place' },
                { value: 'split', label: 'Split: most round wins, then latest round' },
              ]}
            />
          </Group>
          <Text size="sm" c="dimmed">
            DNF and No award score 0 for the round. A round not ridden is blank. Non-competitive
            riders take no series points. Riders are matched by name in each class.
          </Text>
        </Stack>
      </Paper>

      {view.notCounted.length > 0 && (
        <Paper
          radius="md"
          p="md"
          role="status"
          style={{ background: '#fff0de', color: '#6b2e00', border: '2px solid #b35c00' }}
        >
          <Text fw={800}>Not counted yet</Text>
          <Stack gap={2}>
            {view.notCounted.map((n) => (
              <Text key={n} size="sm">
                {n}
              </Text>
            ))}
          </Stack>
        </Paper>
      )}

      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="tally-h">
        <Group justify="space-between" mb="sm">
          <Title order={3} size="h4" id="tally-h">
            Points after {view.tally.rounds} {view.tally.rounds === 1 ? 'round' : 'rounds'}
          </Title>
          <Group gap="sm">
            <Checkbox
              label="Junior surnames as an initial"
              checked={initials}
              onChange={(e) => setInitials(e.currentTarget.checked)}
            />
            <Button onClick={() => void save('pdf')} disabled={classes.length === 0}>
              Save PDF…
            </Button>
            <Button
              variant="default"
              onClick={() => void save('csv')}
              disabled={classes.length === 0}
            >
              Save CSV…
            </Button>
          </Group>
        </Group>
        {saved && (
          <Alert
            color="green"
            role="status"
            withCloseButton
            closeButtonLabel="Close"
            onClose={() => setSaved(null)}
            mb="sm"
          >
            Saved {saved}
          </Alert>
        )}
        {classes.length === 0 ? (
          <Text c="dimmed">No final rounds yet.</Text>
        ) : (
          <Tabs value={tab} onChange={setTab}>
            <Tabs.List>
              {classes.map((c, i) => (
                <Tabs.Tab key={c.name} value={`class-${i}`}>
                  {c.name} ({c.rows.length})
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {classes.map((c, i) => (
              <Tabs.Panel key={c.name} value={`class-${i}`} pt="sm">
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Place</Table.Th>
                      <Table.Th>Rider</Table.Th>
                      <Table.Th ta="right">No.</Table.Th>
                      {view.roundLabels.map((l) => (
                        <Table.Th key={l} ta="right">
                          {l}
                        </Table.Th>
                      ))}
                      <Table.Th ta="right">Total</Table.Th>
                      {best && <Table.Th ta="right">Best {view.rules.bestOf}</Table.Th>}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {c.rows.map((r) => (
                      <Table.Tr key={`${r.name}-${r.number}`}>
                        <Table.Td fw={700}>
                          {r.place}
                          {r.shared ? '=' : ''}
                        </Table.Td>
                        <Table.Td>{r.name}</Table.Td>
                        <Table.Td ta="right">{r.number}</Table.Td>
                        {r.rounds.map((p, k) => (
                          <Table.Td key={k} ta="right">
                            {p ?? ''}
                          </Table.Td>
                        ))}
                        <Table.Td ta="right" fw={best ? 400 : 700}>
                          {r.total}
                        </Table.Td>
                        {best && (
                          <Table.Td ta="right" fw={700}>
                            {r.counted}
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            ))}
          </Tabs>
        )}
      </Paper>
    </Stack>
  );
}
