import {
  Alert,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import {
  classSummary,
  entryName,
  gapWords,
  lapColumns,
  lapTotal,
  penaltyPoints,
  placeLabels,
  tieBreakWords,
  type ResultsTypes,
} from '@tscore/core';
import { useEffect, useState } from 'react';
import type {
  AppError,
  ExportKind,
  OpenEvent,
  ResultsGapInfo,
  ResultsView,
} from '../../../shared/ipc';

type ClassResults = ResultsTypes.ClassResults;

/**
 * Results: every class, worked out from the cards in so far. "Provisional" until every expected
 * card is in. Non-competitive riders show counts only (their scores aren't in the results at
 * all). Save as PDF or CSV to print, email or upload.
 */
export function Results({ event }: { readonly event: OpenEvent }) {
  const [view, setView] = useState<ResultsView | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [showGaps, setShowGaps] = useState(false);
  const [initials, setInitials] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<ExportKind | null>(null);

  useEffect(() => {
    void window.tscore.results().then((r) => {
      if (r.ok) setView(r.value);
      else setError(r.error);
    });
  }, [event]);

  async function save(kind: ExportKind) {
    setBusy(kind);
    setSaved(null);
    setError(null);
    const r = await window.tscore.exportResults(kind, initials && hasJuniors);
    setBusy(null);
    if (!r.ok) setError(r.error);
    else if (r.value) setSaved(r.value);
  }

  async function open() {
    const r = await window.tscore.openExport();
    if (!r.ok) setError(r.error);
  }

  if (!view) return error ? <ErrorAlert error={error} /> : null;

  const classes = view.results.classes.filter((c) => c.entries.length > 0);
  // Tabs are keyed by position: class names can have spaces, which aren't valid in ids.
  const current = classes.find((_, i) => `class-${i}` === tab) ? tab : 'class-0';
  const gaps = view.gaps;
  const hasJuniors = view.juniorClasses.some((j) => classes.some((c) => c.name === j));

  return (
    <Stack gap="lg" maw={1300}>
      <Group justify="space-between" wrap="wrap" align="flex-start">
        <div>
          <Title order={2}>Results</Title>
          <Text c="dimmed">Worked out from every card in so far. Updates as cards are saved.</Text>
        </div>
        <Group gap="sm">
          <Button
            onClick={() => void save('pdf')}
            loading={busy === 'pdf'}
            disabled={classes.length === 0}
          >
            Save PDF…
          </Button>
          <Button
            variant="default"
            onClick={() => void save('csv')}
            loading={busy === 'csv'}
            disabled={classes.length === 0}
          >
            Save CSV…
          </Button>
        </Group>
      </Group>

      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      {saved && (
        <Alert color="green" role="status" withCloseButton onClose={() => setSaved(null)}>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <span>Saved: {saved}</span>
            <Button variant="default" size="xs" onClick={() => void open()}>
              Open
            </Button>
          </Group>
        </Alert>
      )}

      {classes.length === 0 ? (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed">
            No riders yet. Import the entry list on the Riders screen, then type or scan cards.
          </Text>
        </Paper>
      ) : (
        <>
          <Status gaps={gaps} open={showGaps} onToggle={() => setShowGaps((s) => !s)} />

          <Paper withBorder radius="md" p="md" component="section" aria-label="Class results">
            <Tabs value={current} onChange={setTab}>
              <Tabs.List>
                {classes.map((c, i) => (
                  <Tabs.Tab key={c.name} value={`class-${i}`}>
                    {c.name}{' '}
                    <Text span c="dimmed" size="sm">
                      ({c.entries.length})
                    </Text>
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {classes.map((c, i) => (
                <Tabs.Panel key={c.name} value={`class-${i}`} pt="sm">
                  <ClassTable
                    cls={c}
                    scoreValues={view.results.event.scoring.score_values}
                    gaps={gaps}
                  />
                </Tabs.Panel>
              ))}
            </Tabs>
            <Text size="sm" c="dimmed" mt="sm">
              {tieBreakWords(view.results)} NA = No award: scored and ranked among themselves, never
              placed. NC = Non-competitive: listed after the class with their counts only; their
              scores are never shown or published. Penalties are added on the Manual entry page.
            </Text>
          </Paper>

          <Paper withBorder radius="md" p="md" component="section" aria-label="Saving results">
            <Stack gap={6}>
              <Title order={3} size="h4">
                Saving results to share
              </Title>
              {hasJuniors ? (
                <>
                  <Checkbox
                    label="Show junior riders' surnames as an initial (“Riley M.”)"
                    checked={initials}
                    onChange={(e) => setInitials(e.currentTarget.checked)}
                  />
                  <Text size="sm" c="dimmed">
                    Junior classes here: {view.juniorClasses.join(', ')}. Applies to the PDF and
                    CSV. Results on this laptop always show full names.
                  </Text>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  The PDF and CSV show what&apos;s on screen. Non-competitive riders&apos; scores
                  are never included.
                </Text>
              )}
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
  );
}

function Status(props: { gaps: readonly ResultsGapInfo[]; open: boolean; onToggle: () => void }) {
  const { gaps } = props;
  if (gaps.length === 0) {
    return (
      <Alert color="green" role="status" title="All cards are in">
        No card is missing and no score is waiting. Check the results, then save the PDF.
      </Alert>
    );
  }
  // One line per card (a rider in two classes appears once).
  const lines = [
    ...new Map(
      gaps.map((g) => [
        `${g.number}:${g.day}:${g.lap}:${g.kind}:${g.section ?? 0}`,
        g.kind === 'missing_card'
          ? `Rider ${g.number} (${g.className}): lap ${g.lap}${g.day > 1 ? ` of day ${g.day}` : ''} not in yet`
          : `Rider ${g.number} (${g.className}): lap ${g.lap} section ${g.section ?? '?'} undecided`,
      ]),
    ).values(),
  ];
  return (
    <Paper
      radius="md"
      p="md"
      component="section"
      aria-label="Provisional"
      style={{ background: '#fff0de', color: '#6b2e00', border: '2px solid #b35c00' }}
    >
      <Group justify="space-between" wrap="wrap" gap="sm" align="flex-start">
        <div>
          <Text fw={800} fz="xl">
            PROVISIONAL
          </Text>
          <Text>{gapWords(gaps)} Positions may change.</Text>
        </div>
        <Button variant="default" onClick={props.onToggle} aria-expanded={props.open}>
          {props.open ? 'Hide what’s missing' : 'See what’s missing'}
        </Button>
      </Group>
      {props.open && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, columns: '2 320px' }}>
          {lines.slice(0, 200).map((l) => (
            <li key={l}>{l}</li>
          ))}
          {lines.length > 200 && <li>…and {lines.length - 200} more</li>}
        </ul>
      )}
    </Paper>
  );
}

function ClassTable(props: {
  cls: ClassResults;
  scoreValues: readonly number[];
  gaps: readonly ResultsGapInfo[];
}) {
  const { cls, scoreValues } = props;
  const cols = lapColumns(cls);
  const places = placeLabels(cls.entries);
  const waiting = new Map<number, number[]>();
  for (const g of props.gaps) {
    if (g.className === cls.name && g.kind === 'missing_card') {
      waiting.set(g.number, [...(waiting.get(g.number) ?? []), g.lap]);
    }
  }
  return (
    <Stack gap={4}>
      <Text c="dark.6">
        {classSummary(cls)} · {cls.entries.length} {cls.entries.length === 1 ? 'entry' : 'entries'}
      </Text>
      {/* On a narrow window the table scrolls sideways; focusable so the keyboard can scroll it. */}
      <div
        role="region"
        aria-label={`${cls.name} results, scrolls sideways`}
        tabIndex={0}
        style={{ overflowX: 'auto' }}
      >
        <Table verticalSpacing={8} miw={760} aria-label={`${cls.name} results`}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Place</Table.Th>
              <Table.Th>No.</Table.Th>
              <Table.Th>Rider</Table.Th>
              <Table.Th>Club</Table.Th>
              {cols.map((c) => (
                <Table.Th key={c.label} ta="right">
                  {c.label}
                </Table.Th>
              ))}
              <Table.Th ta="right">Pen.</Table.Th>
              <Table.Th ta="right">Total</Table.Th>
              {scoreValues.map((v) => (
                <Table.Th key={v} ta="right">
                  {v}s
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cls.entries.map((e, i) => {
              const muted = e.tier !== 'competitive' || e.status !== 'finished';
              const pen = penaltyPoints(e);
              const notes = [
                e.also_in?.length ? `Also in ${e.also_in.join(', ')}` : '',
                waiting.get(e.number)?.length
                  ? `Waiting for lap ${waiting.get(e.number)?.join(', ')}`
                  : '',
                e.tier === 'non_competitive' ? 'Non-competitive: scores not shown' : '',
                e.tier === 'no_award' ? 'No award' : '',
              ].filter(Boolean);
              return (
                <Table.Tr key={e.number} {...(muted && { bg: '#f8f9fa' })}>
                  <Table.Td fw={800} fz="lg">
                    {places[i]}
                  </Table.Td>
                  <Table.Td fw={700}>{e.number}</Table.Td>
                  <Table.Td>
                    {entryName(e)}
                    {notes.length > 0 && (
                      <Text size="sm" c="dark.6">
                        {notes.join(' · ')}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{e.club ?? ''}</Table.Td>
                  {cols.map((c) => (
                    <Table.Td key={c.label} ta="right">
                      {lapTotal(e, c) ?? ''}
                    </Table.Td>
                  ))}
                  <Table.Td ta="right">{pen || ''}</Table.Td>
                  <Table.Td ta="right" fw={800} fz="lg">
                    {e.total ?? ''}
                  </Table.Td>
                  {scoreValues.map((v) => (
                    <Table.Td key={v} ta="right" c="dark.6">
                      {e.status === 'dns' ? '' : (e.counts?.[String(v)] ?? 0)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}

function ErrorAlert({ error, onClose }: { error: AppError; onClose?: () => void }) {
  return (
    <Alert color="red" role="alert" {...(onClose && { withCloseButton: true, onClose })}>
      {error.message}{' '}
      <Text span c="dimmed" size="sm">
        ({error.code})
      </Text>
    </Alert>
  );
}
