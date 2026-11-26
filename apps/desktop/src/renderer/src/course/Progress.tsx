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
import { Trans } from 'react-i18next';
import i18next from '../i18n';
import type { CourseLap, OpenEvent } from '../../../shared/ipc';
import { DayPicker, MarkDnf, minutes, useCourse, useDnf } from './shared';
import { ErrorAlert } from '../ErrorAlert';

type Filter = 'all' | 'missing' | 'overdue';

const LAP_LOOK = {
  in: {
    bg: 'light-dark(#e3f4e6, #1c3b22)',
    fg: 'light-dark(#1f5f26, #8ce99a)',
    title: 'course.cardIn',
  },
  due: {
    bg: 'light-dark(#f8f9fa, #25282c)',
    fg: 'light-dark(#111418, #e9ecef)',
    title: 'course.notInYet',
  },
  overdue: {
    bg: 'light-dark(#fdeaea, #431c1c)',
    fg: 'light-dark(#a51111, #ffa8a8)',
    title: 'course.overdue',
  },
  dnf: {
    bg: 'light-dark(#e9ecef, #2e3236)',
    fg: 'light-dark(#343a40, #dee2e6)',
    title: 'course.dnf',
  },
  dns: {
    bg: 'light-dark(#e9ecef, #2e3236)',
    fg: 'light-dark(#343a40, #dee2e6)',
    title: 'course.dns',
  },
  not_ridden: {
    bg: 'light-dark(#dee2e6, #3a3f44)',
    fg: 'light-dark(#343a40, #dee2e6)',
    title: 'course.notRidden',
  },
} as const satisfies Record<CourseLap['kind'], { bg: string; fg: string; title: string }>;

function lapText(l: CourseLap): string {
  if (l.kind === 'in') return l.total === null ? '…' : String(l.total);
  if (l.kind === 'overdue') return i18next.t('course.late');
  if (l.kind === 'dnf') return i18next.t('course.dnfShort');
  if (l.kind === 'dns') return i18next.t('course.dnsShort');
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
          <Title order={2}>{i18next.t('course.progress')}</Title>
          <Text c="dimmed">{i18next.t('course.progressIntro')}</Text>
        </div>
        <Group align="flex-end" gap="md">
          <DayPicker view={view} onChange={setDay} />
          <SegmentedControl
            aria-label={i18next.t('course.show')}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            data={[
              { value: 'all', label: i18next.t('course.allRiders') },
              { value: 'missing', label: i18next.t('course.missingLaps') },
              {
                value: 'overdue',
                label: i18next.t('course.overdueN', { count: view.counts.overdue }),
              },
            ]}
          />
        </Group>
      </Group>

      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}

      <Group gap="md" wrap="wrap" align="stretch">
        <Stat
          label={i18next.t('course.cardsIn')}
          value={`${view.counts.cardsIn}`}
          of={view.counts.cardsExpected}
        />
        <Stat
          label={i18next.t('course.overdue')}
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
            {i18next.t('course.stillOnCourse')}
          </Text>
          <Text fz={28} fw={800} lh={1.2}>
            {view.counts.out}
          </Text>
        </UnstyledButton>
        <Stat
          label={i18next.t('course.dnfDns')}
          value={`${view.counts.dnf} / ${view.counts.dns}`}
        />
      </Group>

      {overdue.length > 0 && (
        <Paper
          component="section"
          aria-label={i18next.t('course.overdueRiders')}
          radius="md"
          p="md"
          style={{
            background: 'light-dark(#fdeaea, #431c1c)',
            color: 'light-dark(#7a0d0d, #ffa8a8)',
          }}
        >
          <Text fw={700} mb={6}>
            {i18next.t('course.overdueTitle', { minutes: view.marginMinutes })}
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
                  <Trans
                    i18nKey="course.overdueLine"
                    values={{
                      number: r.number,
                      name: r.name,
                      class: r.className,
                      lap: r.overdue?.lap ?? '',
                      after: minutes(r.overdue?.minutes ?? 0),
                      average: minutes(Math.round(r.overdue?.averageLap ?? 0)),
                    }}
                    components={{ strong: <strong /> }}
                  />
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
          {i18next.t('course.notFlagged', {
            list: carrying
              .map((r) => i18next.t('course.carrying', { number: r.number, laps: r.carrying }))
              .join('; '),
          })}
        </Text>
      )}

      <Paper
        withBorder
        radius="md"
        p="md"
        component="section"
        aria-label={i18next.t('course.lapsByRider')}
      >
        <div
          role="region"
          aria-label={i18next.t('course.lapsScroll')}
          tabIndex={0}
          style={{ overflowX: 'auto' }}
        >
          <Table miw={720} verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{i18next.t('course.number')}</Table.Th>
                <Table.Th>{i18next.t('course.rider')}</Table.Th>
                <Table.Th>{i18next.t('course.class')}</Table.Th>
                {Array.from({ length: view.mostLaps }, (_, i) => (
                  <Table.Th key={i}>{i18next.t('course.lapN', { lap: i + 1 })}</Table.Th>
                ))}
                <Table.Th>{i18next.t('course.totalSoFar')}</Table.Th>
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
                  <Table.Td fw={700}>
                    {r.state === 'dns' ? i18next.t('course.dnsShort') : r.total}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
        {rows.length === 0 && (
          <Text c="dimmed" mt="sm">
            {view.riders.length === 0 ? i18next.t('course.noRiders') : i18next.t('course.noFilter')}
          </Text>
        )}
        <Text size="sm" c="dimmed" mt="sm">
          {i18next.t('course.key')}
        </Text>
      </Paper>
    </Stack>
  );
}

function LapChip({ lap }: { lap: CourseLap }) {
  const look = LAP_LOOK[lap.kind];
  return (
    <span
      title={i18next.t(look.title)}
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
        <VisuallyHidden>{i18next.t(look.title)}</VisuallyHidden>
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
            {i18next.t('course.of', { n: props.of })}
          </Text>
        )}
      </Text>
    </Paper>
  );
}
