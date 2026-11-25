import { Button, Checkbox, Group, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  newOfficial,
  sectionsOnDay,
  type Draft,
  type DraftOfficial,
  type DraftSection,
} from './draft';

interface Props {
  readonly draft: Draft;
  readonly update: (change: Partial<Draft>) => void;
  /** The message for a field, once it's been touched or saving was tried. */
  readonly errorFor: (field: string) => string | undefined;
}

const EMPTY: DraftSection = { name: '', observer: '' };

/**
 * Sections and officials (#98): optional section names and observers for each day, and other
 * officials, to thank them by name on the results PDF. Names here are kept out of the logs.
 */
export function SectionsCard({ draft, update, errorFor }: Props) {
  const { t } = useTranslation();
  const days = draft.days.length;

  const setSection = (day: number, index: number, change: Partial<DraftSection>) =>
    update({
      days: draft.days.map((d, i) => {
        if (i !== day) return d;
        const sections = [...d.sections];
        while (sections.length <= index) sections.push({ ...EMPTY });
        sections[index] = { ...(sections[index] ?? EMPTY), ...change };
        return { ...d, sections };
      }),
    });

  const setOfficial = (i: number, change: Partial<DraftOfficial>) =>
    update({ officials: draft.officials.map((o, j) => (j === i ? { ...o, ...change } : o)) });

  return (
    <Stack gap="lg">
      <Text c="dimmed">{t('sections.intro')}</Text>
      {draft.days.map((d, day) => {
        const count = sectionsOnDay(draft, day);
        if (count === 0) return null;
        const on = days > 1 ? t('sections.onDay', { day: day + 1 }) : '';
        return (
          <div key={day}>
            {days > 1 && (
              <Title order={3} size="h4" mb="xs">
                {t('sections.day', { day: day + 1 })}
              </Title>
            )}
            <Table.ScrollContainer minWidth={640}>
              <Table verticalSpacing={6}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={90}>{t('sections.section')}</Table.Th>
                    <Table.Th>{t('sections.name')}</Table.Th>
                    <Table.Th>{t('sections.observers')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Array.from({ length: count }, (_, k) => {
                    const s = d.sections[k] ?? EMPTY;
                    return (
                      <Table.Tr key={k}>
                        <Table.Td fw={700}>{k + 1}</Table.Td>
                        <Table.Td>
                          <TextInput
                            aria-label={t('sections.nameOf', { n: k + 1, on })}
                            placeholder={t('sections.namePlaceholder')}
                            maxLength={40}
                            value={s.name}
                            onChange={(e) => setSection(day, k, { name: e.currentTarget.value })}
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            aria-label={t('sections.observerOf', { n: k + 1, on })}
                            placeholder={t('sections.observerPlaceholder')}
                            maxLength={120}
                            value={s.observer}
                            onChange={(e) =>
                              setSection(day, k, { observer: e.currentTarget.value })
                            }
                          />
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </div>
        );
      })}

      <div>
        <Title order={3} size="h4" mb="xs">
          {t('sections.officials')}
        </Title>
        <Stack gap="xs">
          {draft.officials.map((o, i) => (
            <Group key={o.key} align="flex-start" wrap="wrap" gap="sm">
              <TextInput
                aria-label={t('sections.roleOf', { n: i + 1 })}
                placeholder={t('sections.rolePlaceholder')}
                maxLength={60}
                value={o.role}
                onChange={(e) => setOfficial(i, { role: e.currentTarget.value })}
                error={errorFor(`officials[${i}].role`)}
                w={240}
              />
              <TextInput
                aria-label={t('sections.nameOfOfficial', { n: i + 1 })}
                placeholder={t('sections.officialPlaceholder')}
                maxLength={120}
                value={o.name}
                onChange={(e) => setOfficial(i, { name: e.currentTarget.value })}
                error={errorFor(`officials[${i}].name`)}
                style={{ flex: '1 1 260px' }}
              />
              <Button
                variant="subtle"
                color="red"
                aria-label={t('sections.removeOfficial', { n: i + 1 })}
                onClick={() => update({ officials: draft.officials.filter((_, j) => j !== i) })}
              >
                {t('sections.remove')}
              </Button>
            </Group>
          ))}
          <Group>
            <Button
              variant="default"
              onClick={() => update({ officials: [...draft.officials, newOfficial()] })}
            >
              {t('sections.add')}
            </Button>
          </Group>
        </Stack>
      </div>

      <Checkbox
        label={t('sections.thanks')}
        description={t('sections.thanksHelp')}
        checked={draft.thanks}
        onChange={(e) => update({ thanks: e.currentTarget.checked })}
      />
    </Stack>
  );
}
