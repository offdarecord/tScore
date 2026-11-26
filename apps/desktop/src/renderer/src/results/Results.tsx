import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
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
import { ErrorAlert } from '../ErrorAlert';
import { LiveScreenButton } from '../live/LiveScreenButton';
import i18next from '../i18n';
import { isTestTrialEvent, TestTrialCheckButton } from './TestTrialCheck';

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
          <Title order={2}>{i18next.t('results.title')}</Title>
          <Text c="dimmed">{i18next.t('results.intro')}</Text>
        </div>
        <Group gap="sm" align="flex-start">
          {isTestTrialEvent(event.setup.event.name) && <TestTrialCheckButton onError={setError} />}
          <LiveScreenButton />
          <Button
            onClick={() => void save('pdf')}
            loading={busy === 'pdf'}
            disabled={classes.length === 0}
          >
            {i18next.t('results.savePdf')}
          </Button>
          <Button
            variant="default"
            onClick={() => void save('csv')}
            loading={busy === 'csv'}
            disabled={classes.length === 0}
          >
            {i18next.t('results.saveCsv')}
          </Button>
        </Group>
      </Group>

      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      {saved && (
        <Alert color="green" role="status" withCloseButton onClose={() => setSaved(null)}>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <span>{i18next.t('results.saved', { file: saved })}</span>
            <Button variant="default" size="xs" onClick={() => void open()}>
              {i18next.t('results.open')}
            </Button>
          </Group>
        </Alert>
      )}

      {classes.length === 0 ? (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed">{i18next.t('results.none')}</Text>
        </Paper>
      ) : (
        <>
          {!(view.final && !view.final.reopened) && (
            <Status gaps={gaps} open={showGaps} onToggle={() => setShowGaps((s) => !s)} />
          )}
          <FinalPanel view={view} onChange={setView} />

          <Paper
            withBorder
            radius="md"
            p="md"
            component="section"
            aria-label={i18next.t('results.classResults')}
          >
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
              {tieBreakWords(view.results)} {i18next.t('results.key')}
            </Text>
          </Paper>

          <Paper
            withBorder
            radius="md"
            p="md"
            component="section"
            aria-label={i18next.t('results.savingRegion')}
          >
            <Stack gap={6}>
              <Title order={3} size="h4">
                {i18next.t('results.saving')}
              </Title>
              {hasJuniors ? (
                <>
                  <Checkbox
                    label={i18next.t('results.initials')}
                    checked={initials}
                    onChange={(e) => setInitials(e.currentTarget.checked)}
                  />
                  <Text size="sm" c="dimmed">
                    {i18next.t('results.juniorClasses', { classes: view.juniorClasses.join(', ') })}
                  </Text>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  {i18next.t('results.noJuniors')}
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
      <Alert color="green" role="status" title={i18next.t('results.allIn')}>
        {i18next.t('results.allInHelp')}
      </Alert>
    );
  }
  // One line per card (a rider in two classes appears once).
  const lines = [
    ...new Map(
      gaps.map((g) => [
        `${g.number}:${g.day}:${g.lap}:${g.kind}:${g.section ?? 0}`,
        g.kind === 'missing_card'
          ? i18next.t('results.missingLap', {
              number: g.number,
              class: g.className,
              lap: g.lap,
              day: g.day > 1 ? i18next.t('results.ofDay', { day: g.day }) : '',
            })
          : i18next.t('results.undecided', {
              number: g.number,
              class: g.className,
              lap: g.lap,
              section: g.section ?? '?',
            }),
      ]),
    ).values(),
  ];
  return (
    <Paper
      radius="md"
      p="md"
      component="section"
      aria-label={i18next.t('results.provisionalRegion')}
      style={{
        background: 'light-dark(#fff0de, #3f2a10)',
        color: 'light-dark(#6b2e00, #ffc078)',
        border: '2px solid light-dark(#b35c00, #ffa94d)',
      }}
    >
      <Group justify="space-between" wrap="wrap" gap="sm" align="flex-start">
        <div>
          <Text fw={800} fz="xl">
            {i18next.t('results.provisional')}
          </Text>
          <Text>{i18next.t('results.mayChange', { gaps: gapWords(gaps) })}</Text>
        </div>
        <Button variant="default" onClick={props.onToggle} aria-expanded={props.open}>
          {props.open ? i18next.t('results.hideMissing') : i18next.t('results.seeMissing')}
        </Button>
      </Group>
      {props.open && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, columns: '2 320px' }}>
          {lines.slice(0, 200).map((l) => (
            <li key={l}>{l}</li>
          ))}
          {lines.length > 200 && (
            <li>{i18next.t('results.more', { count: lines.length - 200 })}</li>
          )}
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
      <Text>
        {i18next.t('results.entries', { summary: classSummary(cls), count: cls.entries.length })}
      </Text>
      {/* On a narrow window the table scrolls sideways; focusable so the keyboard can scroll it. */}
      <div
        role="region"
        aria-label={i18next.t('results.scrolls', { class: cls.name })}
        tabIndex={0}
        style={{ overflowX: 'auto' }}
      >
        <Table
          verticalSpacing={8}
          miw={760}
          aria-label={i18next.t('results.classTable', { class: cls.name })}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{i18next.t('results.place')}</Table.Th>
              <Table.Th>{i18next.t('results.number')}</Table.Th>
              <Table.Th>{i18next.t('results.rider')}</Table.Th>
              <Table.Th>{i18next.t('results.club')}</Table.Th>
              {cols.map((c) => (
                <Table.Th key={c.label} ta="right">
                  {c.label}
                </Table.Th>
              ))}
              <Table.Th ta="right">{i18next.t('results.pen')}</Table.Th>
              <Table.Th ta="right">{i18next.t('results.total')}</Table.Th>
              {scoreValues.map((v) => (
                <Table.Th key={v} ta="right">
                  {i18next.t('results.count', { value: v })}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cls.entries.map((e, i) => {
              const muted = e.competition_status !== 'competitive' || e.status !== 'finished';
              const pen = penaltyPoints(e);
              const notes = [
                e.also_in?.length
                  ? i18next.t('results.alsoIn', { classes: e.also_in.join(', ') })
                  : '',
                waiting.get(e.number)?.length
                  ? i18next.t('results.waiting', { laps: waiting.get(e.number)?.join(', ') ?? '' })
                  : '',
                e.competition_status === 'non_competitive' ? i18next.t('results.ncNote') : '',
                e.competition_status === 'no_award' ? i18next.t('results.naNote') : '',
              ].filter(Boolean);
              return (
                <Table.Tr key={e.number} {...(muted && { bg: 'light-dark(#f8f9fa, #25282c)' })}>
                  <Table.Td fw={800} fz="lg">
                    {places[i]}
                  </Table.Td>
                  <Table.Td fw={700}>{e.number}</Table.Td>
                  <Table.Td>
                    {entryName(e)}
                    {notes.length > 0 && <Text size="sm">{notes.join(' · ')}</Text>}
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
                    <Table.Td key={v} ta="right">
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

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

/**
 * Final results: mark them final once every card is in (a numbered revision), or, when final,
 * reopen them with a reason to correct something. Nothing that affects results can change
 * while they're final.
 */
function FinalPanel(props: { view: ResultsView; onChange: (view: ResultsView) => void }) {
  const { view } = props;
  const [asking, setAsking] = useState<'final' | 'reopen' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const final = view.final && !view.final.reopened ? view.final : null;
  const reopened = view.final?.reopened ? view.final : null;
  const complete = view.gaps.length === 0 && view.results.classes.some((c) => c.entries.length);

  async function run(
    call: () => Promise<{ ok: true; value: ResultsView } | { ok: false; error: AppError }>,
  ) {
    setBusy(true);
    setError(null);
    const r = await call();
    setBusy(false);
    if (r.ok) {
      props.onChange(r.value);
      setAsking(null);
      setReason('');
    } else setError(r.error);
  }

  // In a dialog, so no help link: the help panel would open behind it.
  const problem = error && <ErrorAlert error={error} withHelp={false} />;

  if (final) {
    return (
      <Paper
        radius="md"
        p="md"
        component="section"
        aria-label={i18next.t('results.finalRegion')}
        style={{
          background: 'light-dark(#e3f4e6, #1c3b22)',
          color: 'light-dark(#123b17, #b2f2bb)',
          border: '2px solid light-dark(#1f5f26, #8ce99a)',
        }}
      >
        <Group justify="space-between" wrap="wrap" gap="sm" align="flex-start">
          <div>
            <Text fw={800} fz="xl">
              {final.revision > 1
                ? i18next.t('results.finalRevision', { revision: final.revision })
                : i18next.t('results.final')}
            </Text>
            <Text>{i18next.t('results.markedFinal', { when: when(final.markedAt) })}</Text>
          </div>
          <Button variant="default" onClick={() => setAsking('reopen')}>
            {i18next.t('results.reopenButton')}
          </Button>
        </Group>
        <Modal
          opened={asking === 'reopen'}
          onClose={() => setAsking(null)}
          title={i18next.t('results.reopenTitle', { revision: final.revision })}
          closeButtonProps={{ 'aria-label': i18next.t('results.close') }}
        >
          <Stack gap="md">
            <Text>{i18next.t('results.reopenHelp')}</Text>
            <Textarea
              label={i18next.t('results.why')}
              required
              placeholder={i18next.t('results.whyPlaceholder')}
              autosize
              minRows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
            {problem}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAsking(null)}>
                {i18next.t('results.cancel')}
              </Button>
              <Button
                loading={busy}
                disabled={!reason.trim()}
                onClick={() => void run(() => window.tscore.reopenResults(reason))}
              >
                {i18next.t('results.reopen')}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Paper>
    );
  }

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      component="section"
      aria-label={i18next.t('results.markRegion')}
    >
      <Stack gap="sm">
        {reopened && (
          <div>
            <Text fw={700}>
              {i18next.t('results.reopened', {
                revision: reopened.revision,
                reason: reopened.reopenReason ?? '',
              })}
            </Text>
            {view.changes && view.changes.length > 0 ? (
              <>
                <Text size="sm">
                  {i18next.t('results.changed', { revision: reopened.revision })}
                </Text>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {view.changes.map((c) => (
                    <li key={c}>
                      <Text size="sm">{c}</Text>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Text size="sm">
                {i18next.t('results.noChanges', { revision: reopened.revision })}
              </Text>
            )}
          </div>
        )}
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Text>
            {complete
              ? view.nextRevision > 1
                ? i18next.t('results.whenConfirmedRevision', { revision: view.nextRevision })
                : i18next.t('results.whenConfirmed')
              : i18next.t('results.notYet')}
          </Text>
          {complete && (
            <Button onClick={() => setAsking('final')}>
              {view.nextRevision > 1
                ? i18next.t('results.markFinalRevision', { revision: view.nextRevision })
                : i18next.t('results.markFinal')}
            </Button>
          )}
        </Group>
        {asking !== 'final' && error && <ErrorAlert error={error} />}
      </Stack>
      <Modal
        opened={asking === 'final'}
        onClose={() => setAsking(null)}
        title={
          view.nextRevision > 1
            ? i18next.t('results.markTitleRevision', { revision: view.nextRevision })
            : i18next.t('results.markTitle')
        }
        closeButtonProps={{ 'aria-label': i18next.t('results.close') }}
      >
        <Stack gap="md">
          <Text>{i18next.t('results.markHelp')}</Text>
          {problem}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAsking(null)}>
              {i18next.t('results.cancel')}
            </Button>
            <Button loading={busy} onClick={() => void run(() => window.tscore.markFinal())}>
              {i18next.t('results.mark')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
