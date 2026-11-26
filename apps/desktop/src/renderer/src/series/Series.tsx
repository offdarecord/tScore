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
import { Trans } from 'react-i18next';
import i18next from '../i18n';
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
          <Title order={2}>{i18next.t('series.title')}</Title>
          <Text c="dimmed">{i18next.t('series.intro')}</Text>
        </div>
        <Button variant="subtle" color="gray" onClick={onBack}>
          {i18next.t('series.allEvents')}
        </Button>
      </Group>
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="series-new">
        <Title order={3} size="h4" id="series-new" mb="sm">
          {i18next.t('series.newSeries')}
        </Title>
        <Group align="flex-end">
          <TextInput
            label={i18next.t('series.name')}
            required
            placeholder={i18next.t('series.namePlaceholder')}
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
            {i18next.t('series.make')}
          </Button>
        </Group>
      </Paper>
      <section aria-labelledby="series-list">
        <Title order={3} size="h4" id="series-list" mb="sm">
          {i18next.t('series.onLaptop')}
        </Title>
        {list?.length === 0 && <Text c="dimmed">{i18next.t('series.none')}</Text>}
        <Stack gap="xs">
          {list?.map((s) => (
            <Group key={s.file} justify="space-between">
              <Button variant="default" onClick={() => void show(window.tscore.seriesView(s.file))}>
                {s.name}
              </Button>
              <Text size="sm" c="dimmed">
                {i18next.t('series.rounds', { count: s.rounds })}
              </Text>
            </Group>
          ))}
        </Stack>
      </section>
    </Stack>
  );
}

const STATE_WORDS = {
  final: 'series.final',
  provisional: 'series.provisional',
  reopened: 'series.reopened',
  missing: 'series.missing',
  unreadable: 'series.unreadable',
} as const satisfies Record<SeriesView['rounds'][number]['state'], string>;

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
          <Text c="dimmed">{i18next.t('series.detailIntro')}</Text>
        </div>
        <Button variant="subtle" color="gray" onClick={props.onBack}>
          {i18next.t('series.allSeries')}
        </Button>
      </Group>
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}

      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="rounds-h">
        <Title order={3} size="h4" id="rounds-h" mb="sm">
          {i18next.t('series.roundsTitle')}
        </Title>
        {view.rounds.length === 0 && <Text c="dimmed">{i18next.t('series.noRounds')}</Text>}
        <Stack gap={6}>
          {view.rounds.map((r) => (
            <Group key={r.folder} justify="space-between" wrap="nowrap">
              <Text>
                <Trans
                  i18nKey="series.round"
                  values={{
                    round: r.round,
                    name: r.name || r.folder,
                    date: r.date ? ` · ${formatDate(r.date)}` : '',
                  }}
                  components={{ strong: <strong /> }}
                />
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
                  {i18next.t(STATE_WORDS[r.state])}
                  {r.state === 'final' && r.revision && r.revision > 1
                    ? i18next.t('series.rev', { revision: r.revision })
                    : ''}
                </Text>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="gray"
                  aria-label={i18next.t('series.removeRound', { round: r.round })}
                  onClick={() => void change({ removeRound: r.folder })}
                >
                  {i18next.t('series.remove')}
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
        <Group mt="md" align="flex-end">
          <NativeSelect
            label={i18next.t('series.addFromEvents')}
            value={pick}
            onChange={(e) => setPick(e.currentTarget.value)}
            data={[
              {
                value: '',
                label: addable.length
                  ? i18next.t('series.chooseEvent')
                  : i18next.t('series.noOther'),
              },
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
            {i18next.t('series.addRound')}
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
            {i18next.t('series.addFile')}
          </Button>
        </Group>
      </Paper>

      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="rules-h">
        <Title order={3} size="h4" id="rules-h" mb="sm">
          {i18next.t('series.rules')}
        </Title>
        <Stack gap="sm">
          <Group align="flex-end">
            <TextInput
              label={i18next.t('series.points')}
              required
              description={i18next.t('series.pointsHelp')}
              value={scale}
              onChange={(e) => setScale(e.currentTarget.value)}
              error={points ? null : i18next.t('series.pointsError')}
              style={{ flex: 1 }}
            />
            <Button
              variant="default"
              disabled={!points || points.join(',') === view.rules.points.join(',')}
              onClick={() => points && rules({ points })}
            >
              {i18next.t('series.savePoints')}
            </Button>
            <Button
              variant="subtle"
              color="gray"
              onClick={() => rules({ points: [...DEFAULT_SERIES_POINTS] })}
            >
              {i18next.t('series.usual')}
            </Button>
          </Group>
          <Group align="flex-start">
            <NativeSelect
              label={i18next.t('series.count')}
              value={best ? 'best' : 'all'}
              onChange={(e) =>
                rules(
                  e.currentTarget.value === 'best'
                    ? { bestOf: Math.max(1, view.rounds.length - 1) }
                    : { bestOf: undefined },
                )
              }
              data={[
                { value: 'all', label: i18next.t('series.every') },
                { value: 'best', label: i18next.t('series.bestOnly') },
              ]}
            />
            {best && (
              <NumberInput
                label={i18next.t('series.bestHow')}
                min={1}
                max={50}
                value={view.rules.bestOf}
                onChange={(v) => typeof v === 'number' && v >= 1 && rules({ bestOf: v })}
                w={160}
              />
            )}
            <NativeSelect
              label={i18next.t('series.ties')}
              value={view.rules.ties}
              onChange={(e) => rules({ ties: e.currentTarget.value as SeriesRules['ties'] })}
              data={[
                { value: 'share', label: i18next.t('series.share') },
                { value: 'split', label: i18next.t('series.split') },
              ]}
            />
          </Group>
          <Text size="sm" c="dimmed">
            {i18next.t('series.rulesHelp')}
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
          <Text fw={800}>{i18next.t('series.notCounted')}</Text>
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
            {i18next.t('series.after', { count: view.tally.rounds })}
          </Title>
          <Group gap="sm">
            <Checkbox
              label={i18next.t('series.initials')}
              checked={initials}
              onChange={(e) => setInitials(e.currentTarget.checked)}
            />
            <Button onClick={() => void save('pdf')} disabled={classes.length === 0}>
              {i18next.t('series.savePdf')}
            </Button>
            <Button
              variant="default"
              onClick={() => void save('csv')}
              disabled={classes.length === 0}
            >
              {i18next.t('series.saveCsv')}
            </Button>
          </Group>
        </Group>
        {saved && (
          <Alert
            color="green"
            role="status"
            withCloseButton
            closeButtonLabel={i18next.t('series.close')}
            onClose={() => setSaved(null)}
            mb="sm"
          >
            {i18next.t('series.saved', { file: saved })}
          </Alert>
        )}
        {classes.length === 0 ? (
          <Text c="dimmed">{i18next.t('series.noFinal')}</Text>
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
                      <Table.Th>{i18next.t('series.place')}</Table.Th>
                      <Table.Th>{i18next.t('series.rider')}</Table.Th>
                      <Table.Th ta="right">{i18next.t('series.number')}</Table.Th>
                      {view.roundLabels.map((l) => (
                        <Table.Th key={l} ta="right">
                          {l}
                        </Table.Th>
                      ))}
                      <Table.Th ta="right">{i18next.t('series.total')}</Table.Th>
                      {best && (
                        <Table.Th ta="right">
                          {i18next.t('series.best', { n: view.rules.bestOf ?? 0 })}
                        </Table.Th>
                      )}
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
