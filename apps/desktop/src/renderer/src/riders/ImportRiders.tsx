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
import {
  planImport,
  type CompetitionStatus,
  type ImportChoices,
  type MatchedBy,
} from '@tscore/core';
import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { AppError, EntryListFile, OpenEvent, RiderInfo } from '../../../shared/ipc';
import { COMPETITION_STATUS_SHORT, riderName } from './Riders';
import { ErrorAlert } from '../ErrorAlert';

interface Props {
  readonly event: OpenEvent;
  readonly file: EntryListFile;
  readonly onCancel: () => void;
  readonly onImported: (event: OpenEvent, count: number) => void;
}

const HOW = {
  name: 'import.howName',
  event_alias: 'import.howEventAlias',
  preset: 'import.howPreset',
  tidy: 'import.howTidy',
  chosen: 'import.howChosen',
  left_out: 'import.howLeftOut',
  unknown: null,
} as const satisfies Record<MatchedBy, string | null>;

/** Check what an entry list will add before anything is saved. */
export function ImportRiders({ event, file, onCancel, onImported }: Props) {
  const { t } = useTranslation();
  /** How a class name was matched, in words ('' when it wasn't). */
  const how = (by: MatchedBy) => {
    const key = HOW[by];
    return key ? t(key) : '';
  };
  /** NA or NC ('' when competitive). */
  const short = (c: CompetitionStatus) => {
    const key = COMPETITION_STATUS_SHORT[c];
    return key ? t(key) : '';
  };
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
          <Title order={2}>{t('import.title')}</Title>
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
          {t('import.recognised', { source: plan.source })}
        </Text>
      </Group>

      <Group align="flex-start" gap="lg" wrap="wrap">
        <Stack gap="lg" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="classes-h">
            <Title order={3} id="classes-h" size="h4" mb="sm">
              {t('import.classes')}
            </Title>
            <Text>
              <Trans
                i18nKey="import.matched"
                values={{ auto: auto.length, total: plan.classes.length }}
                components={{ strong: <strong /> }}
              />{' '}
              {auto.length > 0 && (
                <Button
                  variant="subtle"
                  size="compact-sm"
                  onClick={() => setShowMatches((s) => !s)}
                >
                  {showMatches ? t('import.hideMatches') : t('import.showMatches')}
                </Button>
              )}
            </Text>
            {showMatches && (
              <Table.ScrollContainer minWidth={480} mt="sm">
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('import.inList')}</Table.Th>
                      <Table.Th>{t('import.riders')}</Table.Th>
                      <Table.Th>{t('import.eventClass')}</Table.Th>
                      <Table.Th>{t('import.how')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {auto.map((c) => (
                      <Table.Tr key={c.raw}>
                        <Table.Td>{c.raw}</Table.Td>
                        <Table.Td>{c.riders}</Table.Td>
                        <Table.Td>{c.className}</Table.Td>
                        <Table.Td>{how(c.by)}</Table.Td>
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
                  <Trans
                    i18nKey="import.question"
                    count={c.riders}
                    values={{ raw: c.raw }}
                    components={{ strong: <strong /> }}
                  />
                </Text>
                <Group align="flex-end" gap="lg" wrap="wrap">
                  <NativeSelect
                    label={t('import.classFor', { raw: c.raw })}
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
                      { value: '', label: t('import.chooseClass') },
                      ...eventClasses.map((n) => ({ value: n, label: n })),
                      { value: '__out', label: t('import.leaveOut') },
                    ]}
                    miw={260}
                  />
                  {c.by === 'chosen' && (
                    <Checkbox
                      label={t('import.keepAlias')}
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
                {t('import.duplicates')}
              </Title>
              <Text c="dimmed" mb="sm">
                {t('import.duplicatesHelp')}
              </Text>
              <Stack gap="md">
                {plan.duplicates.map((d) => {
                  const options = d.classes.map((c) => ({
                    value: c,
                    label: t('import.only', { class: c }),
                  }));
                  const [a, b] = d.classes;
                  if (d.classes.length === 2 && a && b) {
                    options.push({
                      value: `${a}\n${b}`,
                      label: t('import.withSecond', { a, b }),
                    });
                  }
                  return (
                    <Radio.Group
                      key={d.key}
                      label={t('import.enteredIn', {
                        name: d.name,
                        classes: d.classes.join(t('import.and')),
                      })}
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
              {t('import.numbers')}
            </Title>
            {plan.entries.length === 0 ? (
              <Text c="dimmed">{t('import.noNew')}</Text>
            ) : (
              <>
                <Text mb="sm">
                  {plan.numbering === 'from_file'
                    ? t('import.fromFile', { first, last })
                    : t('import.generated', { first, last })}
                </Text>
                {plan.notes.map((n) => (
                  <Alert key={n} color="yellow" mb="sm">
                    {n}
                  </Alert>
                ))}
                <Table.ScrollContainer minWidth={480}>
                  <Table striped verticalSpacing={4} aria-label={t('import.newRiders')}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('import.number')}</Table.Th>
                        <Table.Th>{t('import.name')}</Table.Th>
                        <Table.Th>{t('import.class')}</Table.Th>
                        <Table.Th>{t('import.competitionStatus')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {plan.entries.map((e) => (
                        <Table.Tr key={e.number}>
                          <Table.Td fw={700}>{e.number}</Table.Td>
                          <Table.Td>{riderName(e)}</Table.Td>
                          <Table.Td>{e.classes.join(' + ')}</Table.Td>
                          <Table.Td>{short(e.competitionStatus)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </>
            )}
          </Paper>

          {error && (
            <ErrorAlert error={error} title={t('import.nothing')} onClose={() => setError(null)} />
          )}
          <Group>
            <Button disabled={!plan.ready || busy} loading={busy} onClick={() => void doImport()}>
              {plan.entries.length > 0
                ? t('import.importN', { count: plan.entries.length })
                : t('import.importNone')}
            </Button>
            <Button variant="default" onClick={onCancel}>
              {t('import.cancel')}
            </Button>
            {!plan.ready && plan.entries.length > 0 && (
              <Text c="dimmed" size="sm">
                {t('import.answerFirst')}
              </Text>
            )}
          </Group>
        </Stack>

        <Stack gap="lg" style={{ flex: '1 1 280px', maxWidth: 380 }}>
          <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="file-h">
            <Title order={3} id="file-h" size="h4" mb="xs">
              {t('import.fromThis')}
            </Title>
            <List spacing={4}>
              <List.Item>{t('import.rows', { count: plan.rowsRead })}</List.Item>
              {plan.skipped.map((s) => (
                <List.Item key={s.reason}>
                  {t('import.skipped', { count: s.count, reason: s.reason })}
                </List.Item>
              ))}
              {plan.merged > 0 && (
                <List.Item>{t('import.merged', { count: plan.merged })}</List.Item>
              )}
              {plan.alreadyEntered > 0 && (
                <List.Item>{t('import.already', { count: plan.alreadyEntered })}</List.Item>
              )}
              <List.Item>
                <Trans
                  i18nKey="import.toImport"
                  count={plan.entries.length}
                  components={{ strong: <strong /> }}
                />
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
              {t('import.notImported')}
            </Title>
            <Text>{t('import.privacy')}</Text>
          </Paper>
        </Stack>
      </Group>
    </Stack>
  );
}
