import {
  Alert,
  Button,
  Checkbox,
  Group,
  List,
  NativeSelect,
  Paper,
  Radio,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { planImport, type ImportChoices, type MatchedBy } from '@tscore/core';
import { useEffect, useMemo, useState } from 'react';
import type { AppError, EntryListFile, OpenEvent, RiderInfo } from '../../../shared/ipc';
import { riderName } from './Riders';
import { ErrorAlert } from '../ErrorAlert';

interface Props {
  readonly event: OpenEvent;
  readonly file: EntryListFile;
  readonly onCancel: () => void;
  readonly onImported: (event: OpenEvent, count: number) => void;
}

const HOW: Record<MatchedBy, string> = {
  name: 'Same name',
  event_alias: 'Saved for this event',
  preset: 'Known name',
  tidy: 'Name tidied',
  chosen: 'You chose',
  left_out: 'Left out',
  unknown: '',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Check what an entry list will add before anything is saved. */
export function ImportRiders({ event, file, onCancel, onImported }: Props) {
  const [existing, setExisting] = useState<RiderInfo[] | null>(null);
  const [classes, setClasses] = useState<Record<string, string | null>>({});
  const [dontKeep, setDontKeep] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<Record<string, string[]>>({});
  const [showMatches, setShowMatches] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => void window.tscore.riders().then(setExisting), []);

  const choices: ImportChoices = { classes, dontKeep, duplicates };
  const plan = useMemo(
    () => (existing ? planImport(file.list, event.setup, existing, choices) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existing, file, event.setup, classes, dontKeep, duplicates],
  );
  if (!plan) return null;

  const auto = plan.classes.filter(
    (c) => c.by !== 'unknown' && c.by !== 'chosen' && c.by !== 'left_out',
  );
  const toDecide = plan.classes.filter(
    (c) => c.by === 'unknown' || c.by === 'chosen' || c.by === 'left_out',
  );
  const eventClasses = event.setup.classes.map((c) => c.name);
  const first = plan.entries[0]?.number;
  const last = plan.entries.at(-1)?.number;

  async function doImport() {
    setBusy(true);
    const r = await window.tscore.importRiders(choices);
    setBusy(false);
    if (r.ok) onImported(r.value, plan?.entries.length ?? 0);
    else setError(r.error);
  }

  return (
    <Stack gap="lg" maw={1200}>
      <Group justify="space-between" wrap="wrap">
        <div>
          <Title order={2}>Import riders</Title>
          <Text c="dimmed">{file.fileName}</Text>
        </div>
        <Text
          fw={700}
          px="md"
          py={6}
          style={{
            background: 'light-dark(#e3f4e6, #1c3b22)',
            color: 'light-dark(#1f5f26, #8ce99a)',
            borderRadius: 999,
          }}
        >
          ✓ Recognised: {plan.source}
        </Text>
      </Group>

      <Group align="flex-start" gap="lg" wrap="wrap">
        <Stack gap="lg" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="classes-h">
            <Title order={3} id="classes-h" size="h4" mb="sm">
              Classes
            </Title>
            <Text>
              <strong>
                {auto.length} of {plan.classes.length} class names
              </strong>{' '}
              matched automatically.{' '}
              {auto.length > 0 && (
                <Button
                  variant="subtle"
                  size="compact-sm"
                  onClick={() => setShowMatches((s) => !s)}
                >
                  {showMatches ? 'Hide matches' : 'Show matches'}
                </Button>
              )}
            </Text>
            {showMatches && (
              <Table.ScrollContainer minWidth={480} mt="sm">
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>In the entry list</Table.Th>
                      <Table.Th>Riders</Table.Th>
                      <Table.Th>Event class</Table.Th>
                      <Table.Th>How</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {auto.map((c) => (
                      <Table.Tr key={c.raw}>
                        <Table.Td>{c.raw}</Table.Td>
                        <Table.Td>{c.riders}</Table.Td>
                        <Table.Td>{c.className}</Table.Td>
                        <Table.Td>{HOW[c.by]}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}

            {toDecide.map((c) => (
              <Paper
                key={c.raw}
                withBorder
                radius="md"
                p="md"
                mt="md"
                style={{
                  borderColor: c.by === 'unknown' ? 'var(--mantine-color-orange-7)' : undefined,
                  borderWidth: 2,
                }}
              >
                <Text mb="xs">
                  {plural(c.riders, 'rider')} entered <strong>“{c.raw}”</strong>, which isn't a
                  class in this event. Which class do they ride?
                </Text>
                <Group align="flex-end" gap="lg" wrap="wrap">
                  <NativeSelect
                    label={`Event class for ${c.raw}`}
                    value={c.by === 'left_out' ? '__out' : (c.className ?? '')}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setClasses((m) => {
                        const next = Object.entries(m).filter(([k]) => k !== c.raw);
                        if (v !== '') next.push([c.raw, v === '__out' ? null : v]);
                        return Object.fromEntries(next);
                      });
                    }}
                    data={[
                      { value: '', label: 'Choose a class…' },
                      ...eventClasses.map((n) => ({ value: n, label: n })),
                      { value: '__out', label: 'Leave these riders out' },
                    ]}
                    miw={260}
                  />
                  {c.by === 'chosen' && (
                    <Checkbox
                      label="Keep for future events (saved in this event's setup)"
                      checked={!dontKeep.includes(c.raw)}
                      onChange={(e) => {
                        const keep = e.currentTarget.checked;
                        setDontKeep((d) => (keep ? d.filter((x) => x !== c.raw) : [...d, c.raw]));
                      }}
                    />
                  )}
                </Group>
              </Paper>
            ))}
          </Paper>

          {plan.duplicates.length > 0 && (
            <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="dup-h">
              <Title order={3} id="dup-h" size="h4" mb="xs">
                Entered more than once
              </Title>
              <Text c="dimmed" mb="sm">
                Often a double entry that was never cleaned up. Sometimes a rider really does ride
                for a second class.
              </Text>
              <Stack gap="md">
                {plan.duplicates.map((d) => {
                  const options = d.classes.map((c) => ({ value: c, label: `Only ${c}` }));
                  const [a, b] = d.classes;
                  if (d.classes.length === 2 && a && b) {
                    options.push({
                      value: `${a}\n${b}`,
                      label: `${a}, with ${b} as a second class`,
                    });
                  }
                  return (
                    <Radio.Group
                      key={d.key}
                      label={`${d.name} is entered in ${d.classes.join(' and ')}`}
                      value={d.chosen?.join('\n') ?? ''}
                      onChange={(v) => setDuplicates((m) => ({ ...m, [d.key]: v.split('\n') }))}
                    >
                      <Stack gap={6} mt={6}>
                        {options.map((o) => (
                          <Radio key={o.value} value={o.value} label={o.label} />
                        ))}
                      </Stack>
                    </Radio.Group>
                  );
                })}
              </Stack>
            </Paper>
          )}

          <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="num-h">
            <Title order={3} id="num-h" size="h4" mb="xs">
              Rider numbers
            </Title>
            {plan.entries.length === 0 ? (
              <Text c="dimmed">No new riders to add.</Text>
            ) : (
              <>
                <Text mb="sm">
                  {plan.numbering === 'from_file'
                    ? `Numbers from the file (${first}–${last}).`
                    : `Numbers ${first}–${last}, in class order, then by surname.`}
                </Text>
                {plan.notes.map((n) => (
                  <Alert key={n} color="yellow" mb="sm">
                    {n}
                  </Alert>
                ))}
                <Table.ScrollContainer minWidth={480}>
                  <Table striped verticalSpacing={4} aria-label="New riders">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>No.</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Class</Table.Th>
                        <Table.Th>Competition status</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {plan.entries.map((e) => (
                        <Table.Tr key={e.number}>
                          <Table.Td fw={700}>{e.number}</Table.Td>
                          <Table.Td>{riderName(e)}</Table.Td>
                          <Table.Td>{e.classes.join(' + ')}</Table.Td>
                          <Table.Td>
                            {e.competitionStatus === 'non_competitive'
                              ? 'NC'
                              : e.competitionStatus === 'no_award'
                                ? 'NA'
                                : ''}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </>
            )}
          </Paper>

          {error && (
            <ErrorAlert error={error} title="Nothing was imported" onClose={() => setError(null)} />
          )}
          <Group>
            <Button disabled={!plan.ready || busy} loading={busy} onClick={() => void doImport()}>
              {plan.entries.length > 0
                ? `Import ${plural(plan.entries.length, 'rider')}`
                : 'Import'}
            </Button>
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
            {!plan.ready && plan.entries.length > 0 && (
              <Text c="dimmed" size="sm">
                Answer the questions above first.
              </Text>
            )}
          </Group>
        </Stack>

        <Stack gap="lg" style={{ flex: '1 1 280px', maxWidth: 380 }}>
          <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="file-h">
            <Title order={3} id="file-h" size="h4" mb="xs">
              From this file
            </Title>
            <List spacing={4}>
              <List.Item>{plural(plan.rowsRead, 'row')} read</List.Item>
              {plan.skipped.map((s) => (
                <List.Item key={s.reason}>
                  {s.count} {s.reason} skipped
                </List.Item>
              ))}
              {plan.merged > 0 && (
                <List.Item>
                  {plural(plan.merged, 'repeated entry', 'repeated entries')} merged
                </List.Item>
              )}
              {plan.alreadyEntered > 0 && (
                <List.Item>
                  {plural(plan.alreadyEntered, 'rider')} already in this event, left as they are
                </List.Item>
              )}
              <List.Item>
                <strong>{plural(plan.entries.length, 'rider')}</strong> to import
              </List.Item>
            </List>
          </Paper>
          <Paper
            radius="md"
            p="lg"
            bg="light-dark(#e7f5ff, #1a3049)"
            component="section"
            aria-labelledby="priv-h"
          >
            <Title order={3} id="priv-h" size="h4" mb="xs">
              Not imported
            </Title>
            <Text>
              Dates of birth, addresses, phone numbers, medical and emergency details stay in the
              entry system. tScore keeps only the name, class, club, machine, licence number and
              competition status.
            </Text>
          </Paper>
        </Stack>
      </Group>
    </Stack>
  );
}
