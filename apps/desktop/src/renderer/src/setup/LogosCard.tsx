import { Button, CloseButton, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppError, LogoView, OpenEvent, Outcome } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';

const MAX_SPONSORS = 8;

/**
 * Event setup's "Logos": the organising club's logo, the event logo and sponsor logos for the
 * results PDF and big screen. The club logo is remembered on this laptop for the club (#111).
 */
export function LogosCard({ event }: { event: OpenEvent }) {
  const { t } = useTranslation();
  const [logos, setLogos] = useState<LogoView[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    void window.tscore.logos().then((r) => {
      if (r.ok) setLogos(r.value);
      else setError(r.error);
    });
  }, [event]);

  async function run(call: Promise<Outcome<LogoView[] | null>>) {
    setError(null);
    const r = await call;
    if (!r.ok) setError(r.error);
    else if (r.value) setLogos(r.value);
  }

  if (!logos) return error ? <ErrorAlert error={error} /> : null;
  const eventLogo = logos.find((l) => l.role === 'event');
  const clubLogo = logos.find((l) => l.role === 'club');
  const sponsors = logos.filter((l) => l.role === 'sponsor');
  const club = event.setup.event.club?.trim();

  return (
    <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="logos-heading">
      <Stack gap="md">
        <div>
          <Title order={2} size="h3" id="logos-heading">
            {t('logos.title')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('logos.help')}
          </Text>
        </div>
        {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
        <div>
          <Text fw={600}>{t('logos.club')}</Text>
          <Text size="sm" c="dimmed">
            {club ? t('logos.clubRemembered', { club }) : t('logos.clubNoName')}
          </Text>
          {clubLogo ? (
            <Logo
              logo={clubLogo}
              name={t('logos.clubName')}
              onRemove={(id) => void run(window.tscore.removeLogo(id))}
            />
          ) : (
            <Text size="sm">{t('logos.none')}</Text>
          )}
          <Button
            mt="xs"
            variant="default"
            onClick={() => void run(window.tscore.chooseLogo('club'))}
          >
            {clubLogo ? t('logos.changeClub') : t('logos.chooseClub')}
          </Button>
        </div>
        <div>
          <Text fw={600}>{t('logos.event')}</Text>
          {eventLogo ? (
            <Logo
              logo={eventLogo}
              name={t('logos.eventName')}
              onRemove={(id) => void run(window.tscore.removeLogo(id))}
            />
          ) : (
            <Text size="sm">{t('logos.none')}</Text>
          )}
          <Button
            mt="xs"
            variant="default"
            onClick={() => void run(window.tscore.chooseLogo('event'))}
          >
            {eventLogo ? t('logos.change') : t('logos.choose')}
          </Button>
        </div>
        <div>
          <Text fw={600}>{t('logos.sponsors')}</Text>
          {sponsors.length === 0 ? (
            <Text size="sm">{t('logos.none')}</Text>
          ) : (
            <Group gap="md" mt={4}>
              {sponsors.map((s, i) => (
                <Logo
                  key={s.id}
                  logo={s}
                  name={t('logos.sponsorName', { n: i + 1 })}
                  onRemove={(id) => void run(window.tscore.removeLogo(id))}
                />
              ))}
            </Group>
          )}
          <Button
            mt="xs"
            variant="default"
            disabled={sponsors.length >= MAX_SPONSORS}
            onClick={() => void run(window.tscore.chooseLogo('sponsor'))}
          >
            {t('logos.addSponsor')}
          </Button>
          {sponsors.length >= MAX_SPONSORS && (
            <Text size="sm" c="dimmed">
              {t('logos.max', { max: MAX_SPONSORS })}
            </Text>
          )}
        </div>
      </Stack>
    </Paper>
  );
}

function Logo(props: { logo: LogoView; name: string; onRemove: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <Group gap={4} align="flex-start" mt={4}>
      <img
        src={props.logo.uri}
        alt={props.name}
        style={{
          maxHeight: 64,
          maxWidth: 160,
          objectFit: 'contain',
          background: '#fff',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 4,
          padding: 4,
        }}
      />
      <CloseButton
        aria-label={t('logos.remove', { name: props.name })}
        onClick={() => props.onRemove(props.logo.id)}
      />
    </Group>
  );
}
