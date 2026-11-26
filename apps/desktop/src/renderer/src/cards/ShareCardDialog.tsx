import {
  Alert,
  Anchor,
  Button,
  Code,
  Group,
  Image,
  List,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  blankImageName,
  CARD_SHARE_PROFILE,
  CONTACT,
  sharedCardProfile,
  type CardCredit,
} from '@tscore/core';
import { useEffect, useState } from 'react';
import type {
  AppError,
  BlankImageView,
  CardProfileInfo,
  CardShareSaved,
} from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';
import i18next from '../i18n';

/**
 * Share a card type with the maintainers (issue #108), so a later tScore release builds it in.
 * Shows exactly what the file holds, saves it, then opens the person's own mail app: tScore never
 * sends anything itself. The Teach a card wizard (#107) opens this too, once a card is taught.
 */
export function ShareCardDialog(props: {
  card: CardProfileInfo;
  opened: boolean;
  onClose: () => void;
}) {
  const { profile } = props.card;
  const [image, setImage] = useState<BlankImageView | null>(null);
  const [credit, setCredit] = useState<CardCredit>({
    club: profile.credit?.club ?? '',
    state: profile.credit?.state ?? '',
  });
  const [saved, setSaved] = useState<CardShareSaved | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let live = true;
    void window.tscore.cardProfileImage(profile.id).then((r) => {
      if (live && r.ok) setImage(r.value);
    });
    return () => {
      live = false;
    };
  }, [profile.id]);

  const shared = sharedCardProfile(profile, image?.type ?? null, credit);

  async function run(work: Promise<{ ok: true } | { ok: false; error: AppError }>, done: string) {
    setError(null);
    setStatus(null);
    const r = await work;
    if (!r.ok) setError(r.error);
    else setStatus(done);
  }

  async function save() {
    setError(null);
    setStatus(null);
    const r = await window.tscore.saveCardShare(profile.id, credit);
    if (!r.ok) return setError(r.error);
    if (!r.value) return;
    setSaved(r.value);
    setStatus(i18next.t('shareCard.saved', { file: r.value.fileName }));
  }

  const edit = (field: keyof CardCredit, value: string) => {
    setCredit((c) => ({ ...c, [field]: value }));
    // The file saved no longer matches what's typed: save it again first.
    setSaved(null);
  };

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      closeButtonProps={{ 'aria-label': i18next.t('shareCard.close') }}
      title={i18next.t('shareCard.title', { name: profile.name })}
      size="lg"
    >
      <Stack gap="md">
        <Text>{i18next.t('shareCard.intro')}</Text>

        <section aria-labelledby="share-contents">
          <Title order={3} size="h5" id="share-contents" mb="xs">
            {i18next.t('shareCard.contents')}
          </Title>
          <List size="sm" spacing={4}>
            <List.Item>
              <Code>{CARD_SHARE_PROFILE}</Code> {i18next.t('shareCard.profileFile')}
            </List.Item>
            {image ? (
              <List.Item>
                <Code>{blankImageName(image.type)}</Code> {i18next.t('shareCard.imageFile')}
              </List.Item>
            ) : (
              <List.Item>{i18next.t('shareCard.noImage')}</List.Item>
            )}
          </List>
          <Text size="sm" mt="xs">
            {i18next.t('shareCard.noRiders')}
          </Text>
          {image && (
            <Image
              src={image.url}
              alt={i18next.t('shareCard.imageAlt')}
              mah={240}
              w="auto"
              fit="contain"
              mt="xs"
            />
          )}
          <Code
            block
            mt="xs"
            mah={220}
            style={{ overflow: 'auto' }}
            tabIndex={0}
            aria-label={i18next.t('shareCard.profileLabel')}
          >
            {JSON.stringify(shared, null, 2)}
          </Code>
        </section>

        <Group grow align="flex-start">
          <TextInput
            label={i18next.t('shareCard.club')}
            description={i18next.t('shareCard.optional')}
            maxLength={120}
            value={credit.club ?? ''}
            onChange={(e) => edit('club', e.currentTarget.value)}
          />
          <TextInput
            label={i18next.t('shareCard.state')}
            description={i18next.t('shareCard.optional')}
            maxLength={60}
            value={credit.state ?? ''}
            onChange={(e) => edit('state', e.currentTarget.value)}
          />
        </Group>

        {error && <ErrorAlert error={error} withHelp={false} onClose={() => setError(null)} />}
        {status && (
          <Alert color="green" role="status">
            {status}
          </Alert>
        )}

        {!saved ? (
          <Group justify="flex-end">
            <Button variant="default" onClick={props.onClose}>
              {i18next.t('shareCard.close')}
            </Button>
            <Button onClick={() => void save()}>{i18next.t('shareCard.save')}</Button>
          </Group>
        ) : (
          <Stack gap="xs">
            <Text>
              {i18next.t('shareCard.attach', { file: saved.fileName, email: CONTACT.email })}
            </Text>
            <Group>
              <Button
                onClick={() =>
                  void run(
                    window.tscore.emailCardShare(saved.file),
                    i18next.t('shareCard.emailOpened', { file: saved.fileName }),
                  )
                }
              >
                {i18next.t('shareCard.email')}
              </Button>
              <Button
                variant="default"
                onClick={() =>
                  void run(
                    window.tscore.copyContactEmail(),
                    i18next.t('shareCard.copied', { email: CONTACT.email }),
                  )
                }
              >
                {i18next.t('shareCard.copyAddress')}
              </Button>
              <Button
                variant="default"
                onClick={() => void run(window.tscore.showCardShareFile(saved.file), '')}
              >
                {i18next.t('shareCard.showFile')}
              </Button>
            </Group>
            <Text size="sm">
              {i18next.t('shareCard.github')}{' '}
              <Anchor href={CONTACT.new_card_type_form} target="_blank">
                {i18next.t('shareCard.githubLink')}
              </Anchor>
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={props.onClose}>
                {i18next.t('shareCard.done')}
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
