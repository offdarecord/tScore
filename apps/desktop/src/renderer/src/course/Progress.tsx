import {
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core';
import { useState } from 'react';
import type { CourseLap, OpenEvent } from '../../../shared/ipc';
import { DayPicker, MarkDnf, minutes, useCourse, useDnf } from './shared';
import { ErrorAlert } from '../ErrorAlert';

type Filter = 'all' | 'missing' | 'overdue';

const LAP_LOOK: Record<CourseLap['kind'], { bg: string; fg: string; title: string }> = {
  in: { bg: 'light-dark(#e3f4e6, #1c3b22)', fg: 'light-dark(#1f5f26, #8ce99a)', title: 'Card in' },
  due: {
    bg: 'light-dark(#f8f9fa, #25282c)',
    fg: 'light-dark(#111418, #e9ecef)',
    title: 'Not in yet',
  },
  overdue: {
    bg: 'light-dark(#fdeaea, #431c1c)',
    fg: 'light-dark(#a51111, #ffa8a8)',
    title: 'Overdue',
  },
  dnf: {
    bg: 'light-dark(#e9ecef, #2e3236)',
    fg: 'light-dark(#343a40, #dee2e6)',
    title: 'Did not finish',
  },
  dns: {
    bg: 'light-dark(#e9ecef, #2e3236)',
    fg: 'light-dark(#343a40, #dee2e6)',
    title: 'Did not start',
  },
  not_ridden: {
    bg: 'light-dark(#dee2e6, #3a3f44)',
    fg: 'light-dark(#343a40, #dee2e6)',
    title: 'Not ridden by this class',
  },
};

function lapText(l: CourseLap): string {
  if (l.kind === 'in') return l.total === null ? '…' : String(l.total);
  if (l.kind === 'overdue') return 'Late';
  if (l.kind === 'dnf') return 'DNF';
  if (l.kind === 'dns') return 'DNS';
  return '';
}

/** Progress: which cards are in, for every rider and lap, and who's overdue. */
export function Progress(props: { event: OpenEvent; onStillOnCourse: () => void }) {
  const { view, error, setError, reload, setDay } = useCourse(props.event);
  const [filter, setFilter] = useState<Filter>('all');
  const { mark, flash } = useDnf(reload, setError);

  if (!view) return error ? <ErrorAlert error={error} /> : null;
  const overdue = view.riders.filter((r) => r.overdue);
  const carrying = view.riders.filter((r) => r.state === 'out' && r.carrying && !r.overdue);
  const rows = view.riders.filter((r) =>
    filter === 'missing'
      ? r.lapStates.some((l) => l.kind === 'due' || l.kind === 'overdue')
      : filter === 'overdue'
        ? r.overdue
        : true,
  );

  return (
    <Stack gap="lg" maw={1300}>
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={2}>Progress</Title>
          <Text c="dimmed">
            Which cards are in, for every rider and lap. Updates as cards are saved, and every 30
            seconds.
          </Text>
        </div>
        <Group align="flex-end" gap="md">
          <DayPicker view={view} onChange={setDay} />
          <SegmentedControl
            aria-label="Show"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            data={[
              { value: 'all', label: 'All riders' },
              { value: 'missing', label: 'Missing laps' },
              { value: 'overdue', label: `Overdue (${view.counts.overdue})` },
            ]}
          />
        </Group>
      </Group>

      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}

      <Group gap="md" wrap="wrap" align="stretch">
        <Stat label="Cards in" value={`${view.counts.cardsIn}`} of={view.counts.cardsExpected} />
        <Stat
          label="Overdue"
          value={String(view.counts.overdue)}
          colour="light-dark(#a51111, #ffa8a8)"
        />
        <UnstyledButton
          onClick={props.onStillOnCourse}
          style={{
            flex: '1 1 170px',
            background: view.counts.out ? '#b02525' : 'light-dark(#e3f4e6, #1c3b22)',
            color: view.counts.out ? '#fff' : 'light-dark(#1f5f26, #8ce99a)',
            borderRadius: 12,
            padding: '12px 18px',
          }}
        >
          <Text size="sm" fw={700} tt="uppercase">
            Still on course
          </Text>
          <Text fz={28} fw={800} lh={1.2}>
            {view.counts.out}
          </Text>
        </UnstyledButton>
        <Stat label="DNF / DNS" value={`${view.counts.dnf} / ${view.counts.dns}`} />
      </Group>

      {overdue.length > 0 && (
        <Paper
          component="section"
          aria-label="Overdue riders"
          radius="md"
          p="md"
          style={{
            background: 'light-dark(#fdeaea, #431c1c)',
            color: 'light-dark(#7a0d0d, #ffa8a8)',
          }}
        >
          <Text fw={700} mb={6}>
            Overdue: no card for more than {view.marginMinutes} minutes past their class&apos;s
            average lap
          </Text>
          <Stack gap={0}>
            {overdue.map((r) => (
              <Group
                key={r.number}
                justify="space-between"
                wrap="wrap"
                gap="sm"
                py={8}
                style={{ borderTop: '1px solid light-dark(#f3c4c4, #6b2a2a)' }}
              >
                <Text>
                  <strong>Rider {r.number}</strong> ({r.name}, {r.className}): no lap{' '}
                  {r.overdue?.lap} card after {minutes(r.overdue?.minutes ?? 0)}. {r.className} laps
                  average {minutes(Math.round(r.overdue?.averageLap ?? 0))}.
                </Text>
                <MarkDnf number={r.number} name={r.name} onMark={mark} />
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
      {flash}
      {carrying.length > 0 && (
        <Text size="sm" c="dimmed">
          Not flagged:{' '}
          {carrying
            .map((r) => `rider ${r.number} handed in ${r.carrying} laps together`)
            .join('; ')}
          , so their next card isn&apos;t due until that many laps&apos; time has passed. Overdue
          never marks anyone DNF by itself.
        </Text>
      )}

      <Paper withBorder radius="md" p="md" component="section" aria-label="Laps by rider">
        <div
          role="region"
          aria-label="Laps by rider, scrolls sideways"
          tabIndex={0}
          style={{ overflowX: 'auto' }}
        >
          <Table miw={720} verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>No.</Table.Th>
                <Table.Th>Rider</Table.Th>
                <Table.Th>Class</Table.Th>
                {Array.from({ length: view.mostLaps }, (_, i) => (
                  <Table.Th key={i}>Lap {i + 1}</Table.Th>
                ))}
                <Table.Th>Total so far</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.number}>
                  <Table.Td fw={700}>{r.number}</Table.Td>
                  <Table.Td>{r.name}</Table.Td>
                  <Table.Td>{r.className}</Table.Td>
                  {r.lapStates.map((l, i) => (
                    <Table.Td key={i}>
                      <LapChip lap={l} />
                    </Table.Td>
                  ))}
                  <Table.Td fw={700}>{r.state === 'dns' ? 'DNS' : r.total}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
        {rows.length === 0 && (
          <Text c="dimmed" mt="sm">
            {view.riders.length === 0
              ? 'No riders yet. Import the entry list on the Riders screen.'
              : 'No riders to show with this filter.'}
          </Text>
        )}
        <Text size="sm" c="dimmed" mt="sm">
          Key: number = lap total · … = a section still undecided · Late = overdue (margin set in
          Event setup) · DNF = did not finish · DNS = did not start · blank = not in yet · grey =
          not ridden by this class.
        </Text>
      </Paper>
    </Stack>
  );
}

function LapChip({ lap }: { lap: CourseLap }) {
  const look = LAP_LOOK[lap.kind];
  return (
    <span
      title={look.title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 64,
        height: 32,
        borderRadius: 8,
        fontWeight: 700,
        background: look.bg,
        color: look.fg,
      }}
    >
      {lapText(lap)}
      {(lap.kind === 'due' || lap.kind === 'not_ridden') && (
        <VisuallyHidden>{look.title}</VisuallyHidden>
      )}
    </span>
  );
}

function Stat(props: { label: string; value: string; of?: number; colour?: string }) {
  return (
    <Paper withBorder radius="md" px="lg" py="sm" style={{ flex: '1 1 170px' }}>
      <Text size="sm" fw={700} c="dimmed" tt="uppercase">
        {props.label}
      </Text>
      <Text fz={28} fw={800} lh={1.2} {...(props.colour && { c: props.colour })}>
        {props.value}
        {props.of !== undefined && (
          <Text span fz={18} fw={600} c="dimmed">
            {' '}
            of {props.of}
          </Text>
        )}
      </Text>
    </Paper>
  );
}
