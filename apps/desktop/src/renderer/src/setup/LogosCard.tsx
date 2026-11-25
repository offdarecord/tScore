import { Button, CloseButton, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { AppError, LogoView, OpenEvent, Outcome } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';

const MAX_SPONSORS = 8;

/** Event setup's "Logos": the event logo and sponsor logos for the results PDF and big screen. */
export function LogosCard({ event }: { event: OpenEvent }) {
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
  const sponsors = logos.filter((l) => l.role === 'sponsor');

  return (
    <Paper withBorder radius="md" p="lg" component="section" aria-labelledby="logos-heading">
      <Stack gap="md">
        <div>
          <Title order={2} size="h3" id="logos-heading">
            Logos
          </Title>
          <Text size="sm" c="dimmed">
            On the results PDF and the big screen. PNG or JPEG, up to 1 MB each.
          </Text>
        </div>
        {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
        <div>
          <Text fw={600}>Event logo</Text>
          {eventLogo ? (
            <Logo
              logo={eventLogo}
              name="event logo"
              onRemove={(id) => void run(window.tscore.removeLogo(id))}
            />
          ) : (
            <Text size="sm">None.</Text>
          )}
          <Button
            mt="xs"
            variant="default"
            onClick={() => void run(window.tscore.chooseLogo('event'))}
          >
            {eventLogo ? 'Change event logo…' : 'Choose event logo…'}
          </Button>
        </div>
        <div>
          <Text fw={600}>Sponsor logos</Text>
          {sponsors.length === 0 ? (
            <Text size="sm">None.</Text>
          ) : (
            <Group gap="md" mt={4}>
              {sponsors.map((s, i) => (
                <Logo
                  key={s.id}
                  logo={s}
                  name={`sponsor logo ${i + 1}`}
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
            Add sponsor logo…
          </Button>
          {sponsors.length >= MAX_SPONSORS && (
            <Text size="sm" c="dimmed">
              Up to {MAX_SPONSORS}. Remove one to add another.
            </Text>
          )}
        </div>
      </Stack>
    </Paper>
  );
}

function Logo(props: { logo: LogoView; name: string; onRemove: (id: string) => void }) {
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
        aria-label={`Remove ${props.name}`}
        onClick={() => props.onRemove(props.logo.id)}
      />
    </Group>
  );
}
