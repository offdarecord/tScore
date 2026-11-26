import {
  Alert,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import type { AppError, CardProfileInfo } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';
import i18next from '../i18n';
import { ShareCardDialog } from './ShareCardDialog';

/**
 * Card types (issue #108): the scorecards this laptop can read. Built-in ones come with tScore;
 * a club's own card type can be imported from a `.tscore-card` file, and shared with the
 * maintainers so a later release builds it in.
 */
export function CardTypes({ onBack, onTeach }: { onBack: () => void; onTeach: () => void }) {
  const [list, setList] = useState<CardProfileInfo[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sharing, setSharing] = useState<CardProfileInfo | null>(null);

  async function refresh() {
    const r = await window.tscore.cardProfiles();
    if (r.ok) setList(r.value);
    else setError(r.error);
  }

  useEffect(() => {
    void window.tscore.cardProfiles().then((r) => (r.ok ? setList(r.value) : setError(r.error)));
  }, []);

  async function importFile() {
    setError(null);
    setDone(null);
    const r = await window.tscore.importCardProfile();
    if (!r.ok) return setError(r.error);
    if (!r.value) return;
    const key = r.value.replaced ? 'cardTypes.updated' : 'cardTypes.importedName';
    setDone(i18next.t(key, { name: r.value.profile.name }));
    await refresh();
  }

  const builtIn = list?.filter((c) => c.builtIn) ?? [];
  const imported = list?.filter((c) => !c.builtIn) ?? [];

  return (
    <Stack gap="lg" maw={900}>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{i18next.t('cardTypes.title')}</Title>
          <Text c="dimmed">{i18next.t('cardTypes.intro')}</Text>
        </div>
        <Button variant="subtle" color="gray" onClick={onBack}>
          {i18next.t('cardTypes.allEvents')}
        </Button>
      </Group>
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
      {done && (
        <Alert
          color="green"
          role="status"
          withCloseButton
          closeButtonLabel={i18next.t('errorAlert.close')}
          onClose={() => setDone(null)}
        >
          {done}
        </Alert>
      )}

      <section aria-labelledby="card-types-built-in">
        <Title order={3} size="h4" id="card-types-built-in" mb="sm">
          {i18next.t('cardTypes.builtIn')}
        </Title>
        <CardTable cards={builtIn} />
      </section>

      <Paper
        withBorder
        radius="md"
        p="lg"
        component="section"
        aria-labelledby="card-types-imported"
      >
        <Group justify="space-between" mb="sm">
          <Title order={3} size="h4" id="card-types-imported">
            {i18next.t('cardTypes.imported')}
          </Title>
          <Button onClick={() => void importFile()}>{i18next.t('cardTypes.import')}</Button>
        </Group>
        <Text size="sm" c="dimmed" mb="sm">
          {i18next.t('cardTypes.importedIntro')}
        </Text>
        {list && imported.length === 0 ? (
          <Text>{i18next.t('cardTypes.noneImported')}</Text>
        ) : (
          <CardTable cards={imported} onShare={setSharing} />
        )}
      </Paper>

      <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="card-types-teach">
        <Group justify="space-between" mb="sm">
          <Title order={3} size="h4" id="card-types-teach">
            {i18next.t('teach.title')}
          </Title>
          <Button onClick={onTeach}>{i18next.t('cardTypes.teach')}</Button>
        </Group>
        <Text size="sm" c="dimmed">
          {i18next.t('cardTypes.teachIntro')}
        </Text>
      </Paper>

      {sharing && <ShareCardDialog card={sharing} opened onClose={() => setSharing(null)} />}
    </Stack>
  );
}

function CardTable(props: {
  cards: readonly CardProfileInfo[];
  onShare?: (card: CardProfileInfo) => void;
}) {
  if (props.cards.length === 0) return null;
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{i18next.t('cardTypes.name')}</Table.Th>
          <Table.Th>{i18next.t('cardTypes.sections')}</Table.Th>
          <Table.Th>{i18next.t('cardTypes.reading')}</Table.Th>
          <Table.Th>{i18next.t('cardTypes.from')}</Table.Th>
          {props.onShare && (
            <Table.Th>
              <VisuallyHidden>{i18next.t('cardTypes.actions')}</VisuallyHidden>
            </Table.Th>
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {props.cards.map(({ profile, builtIn }) => (
          <Table.Tr key={profile.id}>
            <Table.Td>{profile.name}</Table.Td>
            <Table.Td>{profile.rows}</Table.Td>
            <Table.Td>
              {i18next.t(profile.trust === 'trusted' ? 'cardTypes.trusted' : 'cardTypes.assisted')}
            </Table.Td>
            <Table.Td>
              {[profile.credit?.club, profile.credit?.state].filter(Boolean).join(', ') || '–'}
            </Table.Td>
            {props.onShare && (
              <Table.Td>
                <Button
                  size="xs"
                  variant="default"
                  aria-label={i18next.t('cardTypes.shareNamed', { name: profile.name })}
                  onClick={() => props.onShare?.({ profile, builtIn })}
                >
                  {i18next.t('cardTypes.share')}
                </Button>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
