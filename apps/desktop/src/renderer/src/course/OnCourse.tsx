import { Button, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import type { CourseView, OpenEvent } from '../../../shared/ipc';
import { clock, DayPicker, MarkDnf, minutes, useCourse, useDnf } from './shared';
import { ErrorAlert } from '../ErrorAlert';

type Rider = CourseView['riders'][number];

/** Traffic-light colours; white text on these meets WCAG AA. */
const LOOK = {
  out: { bg: '#b02525', fg: '#fff', tag: 'OUT', words: 'on course' },
  waiting: { bg: '#e9ecef', fg: '#212529', tag: 'START', words: 'not started yet' },
  in: { bg: '#237032', fg: '#fff', tag: 'IN', words: 'final card in' },
  dnf: { bg: '#ced4da', fg: '#212529', tag: 'DNF', words: 'did not finish' },
  dns: { bg: '#ced4da', fg: '#212529', tag: 'DNS', words: 'did not start' },
  not_riding: { bg: '#ced4da', fg: '#212529', tag: '', words: 'not riding today' },
} as const;

const ORDER: Record<Rider['state'], number> = {
  out: 0,
  waiting: 1,
  in: 2,
  dnf: 3,
  dns: 4,
  not_riding: 5,
};

/**
 * Still on course: who is still out, worked out only from the cards in and riders marked DNF
 * or DNS (decided 22 Nov 2026). The event can close when nobody is red.
 */
export function OnCourse({
  event,
  onCloseEvent,
}: {
  event: OpenEvent;
  /** Close down: go to Results to check them and mark them final. */
  onCloseEvent?: () => void;
}) {
  const { view, error, setError, reload, setDay } = useCourse(event);
  const { mark, flash } = useDnf(reload, setError);

  if (!view) return error ? <ErrorAlert error={error} /> : null;
  const out = view.riders.filter((r) => r.state === 'out');
  const board = [...view.riders].sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || a.number - b.number,
  );

  return (
    <Stack gap="lg" maw={1300}>
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={2}>Still on course</Title>
          <Text c="dimmed">
            Worked out from the cards in and riders marked DNF. A rider is on course from the start
            until their final lap card is in, or they&apos;re marked DNF.
          </Text>
        </div>
        <DayPicker view={view} onChange={setDay} />
      </Group>

      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}

      <Group gap="md" wrap="wrap" align="stretch">
        <Count
          label="Still on course"
          value={view.counts.out}
          bg={view.counts.out ? LOOK.out.bg : '#e3f4e6'}
          fg={view.counts.out ? LOOK.out.fg : '#1f5f26'}
        />
        <Count label="Final card in" value={view.counts.in} bg="#e3f4e6" fg="#1f5f26" />
        <Count label="DNF" value={view.counts.dnf} bg="#e9ecef" fg="#212529" />
        <Count label="DNS" value={view.counts.dns} bg="#e9ecef" fg="#212529" />
      </Group>

      {flash}

      <Paper withBorder radius="md" p="md" component="section" aria-label="Riders on course">
        {!view.started ? (
          <Text fz={20} fw={700} ta="center" py="lg">
            Lap 1 starts at {view.startTime}. Riders are on course from then.
          </Text>
        ) : out.length === 0 ? (
          <Stack align="center" gap="sm" py="lg">
            <Text fz={22} fw={700} ta="center" c="#1f5f26">
              {view.riders.length === 0
                ? 'No riders yet.'
                : 'Everyone is accounted for. The event can be closed down.'}
            </Text>
            {view.riders.length > 0 && onCloseEvent && (
              <Button size="md" onClick={onCloseEvent}>
                Close the event: check and mark results final
              </Button>
            )}
          </Stack>
        ) : (
          <div
            role="region"
            aria-label="Riders on course, scrolls sideways"
            tabIndex={0}
            style={{ overflowX: 'auto' }}
          >
            <Table miw={760} verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>No.</Table.Th>
                  <Table.Th>Rider</Table.Th>
                  <Table.Th>Class</Table.Th>
                  <Table.Th>Last card in</Table.Th>
                  <Table.Th>Since then</Table.Th>
                  <Table.Th>
                    <span style={{ position: 'absolute', left: -9999 }}>Actions</span>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {out.map((r) => (
                  <Table.Tr key={r.number}>
                    <Table.Td>
                      <Tile number={r.number} look={LOOK.out} small />
                    </Table.Td>
                    <Table.Td fw={600}>{r.name}</Table.Td>
                    <Table.Td>{r.className}</Table.Td>
                    <Table.Td>
                      {r.lastCard
                        ? `Lap ${r.lastCard.lap} at ${clock(r.lastCard.at)}`
                        : `None yet (started ${view.startTime ?? ''})`}
                    </Table.Td>
                    <Table.Td>
                      {minutes(r.minutesOut ?? 0)}
                      {r.overdue && (
                        <Text span fw={700} c="#a51111">
                          {' '}
                          · overdue
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      <MarkDnf number={r.number} name={r.name} onMark={mark} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}
      </Paper>

      <Paper withBorder radius="md" p="md" component="section" aria-label="All riders">
        <Group justify="space-between" wrap="wrap" mb="sm">
          <Title order={3} size="h4">
            All riders
          </Title>
          <Text size="sm" c="dimmed">
            Red = on course · Green = final card in · Grey = DNF or did not start
          </Text>
        </Group>
        <ul
          aria-label="Every rider's state"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            listStyle: 'none',
            margin: 0,
            padding: 0,
          }}
        >
          {board.map((r) => (
            <li key={r.number}>
              <Tile number={r.number} look={LOOK[r.state]} />
            </li>
          ))}
        </ul>
      </Paper>
    </Stack>
  );
}

function Tile(props: { number: number; look: (typeof LOOK)[keyof typeof LOOK]; small?: boolean }) {
  const { look } = props;
  return (
    <div
      aria-label={`Rider ${props.number}: ${look.words}`}
      role="img"
      style={{
        width: props.small ? 56 : 76,
        height: props.small ? 44 : 64,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: props.small ? 20 : 22,
        lineHeight: 1.1,
        background: look.bg,
        color: look.fg,
      }}
    >
      {props.number}
      {!props.small && look.tag && (
        <span style={{ fontSize: 12, fontWeight: 700 }}>{look.tag}</span>
      )}
    </div>
  );
}

function Count(props: { label: string; value: number; bg: string; fg: string }) {
  return (
    <div
      style={{
        flex: '1 1 170px',
        background: props.bg,
        color: props.fg,
        borderRadius: 12,
        padding: '14px 20px',
      }}
    >
      <Text size="sm" fw={700} tt="uppercase">
        {props.label}
      </Text>
      <Text fz={44} fw={800} lh={1.1}>
        {props.value}
      </Text>
    </div>
  );
}
