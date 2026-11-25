import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import type { AppError, CheckItem, OpenEvent, PreEventCheck as Check } from '../../../shared/ipc';
import { ErrorAlert } from '../ErrorAlert';

const LOOK: Record<CheckItem['state'], { icon: string; bg: string; fg: string; words: string }> = {
  ok: {
    icon: '✓',
    bg: 'light-dark(#e3f4e6, #1c3b22)',
    fg: 'light-dark(#1f5f26, #8ce99a)',
    words: 'OK',
  },
  warning: {
    icon: '!',
    bg: 'light-dark(#fff0de, #3f2a10)',
    fg: 'light-dark(#7a3500, #ffc078)',
    words: 'Look at this',
  },
  problem: {
    icon: '✗',
    bg: 'light-dark(#fdeaea, #431c1c)',
    fg: 'light-dark(#a51111, #ffa8a8)',
    words: 'Fix this',
  },
  info: {
    icon: '–',
    bg: 'light-dark(#e9ecef, #2e3236)',
    fg: 'light-dark(#343a40, #dee2e6)',
    words: 'For information',
  },
};

const FIX_WORDS: Record<NonNullable<CheckItem['fix']>, string> = {
  setup: 'Go to Event setup',
  riders: 'Go to Riders',
  labels: 'Go to Card labels',
  backup: 'Set up a second copy',
};

const clockWords = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

/** Run on arrival at the venue, before the first card comes in. */
export function PreEventCheck(props: {
  event: OpenEvent;
  onFix: (page: NonNullable<CheckItem['fix']>) => void;
}) {
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const apply = useCallback((r: Awaited<ReturnType<typeof window.tscore.preEventCheck>>) => {
    if (r.ok) {
      setCheck(r.value);
      setError(null);
    } else setError(r.error);
  }, []);

  useEffect(() => {
    void window.tscore.preEventCheck().then(apply);
  }, [apply, props.event]);

  return (
    <Stack gap="lg" maw={900}>
      <div>
        <Title order={2}>Pre-event check</Title>
        <Text c="dimmed">
          Run this when you arrive at the venue, before the first card comes in.
        </Text>
      </div>

      {error && <ErrorAlert error={error} />}

      {check && (
        <Paper withBorder radius="md" p="lg" component="section" aria-label="Checks">
          <Stack gap="md">
            <Text fw={700} fz="lg" role="status">
              {check.summary}
            </Text>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {check.items.map((item) => {
                const look = LOOK[item.state];
                return (
                  <li
                    key={item.id}
                    style={{
                      borderTop: '1px solid light-dark(#e9ecef, #2e3236)',
                      padding: '12px 0',
                    }}
                  >
                    <Group align="flex-start" wrap="nowrap" gap="md">
                      <span
                        aria-hidden="true"
                        style={{
                          flex: '0 0 auto',
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          background: look.bg,
                          color: look.fg,
                        }}
                      >
                        {look.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={700}>
                          {item.title}{' '}
                          <Text span size="sm" fw={600} c={look.fg}>
                            ({look.words})
                          </Text>
                        </Text>
                        {item.clock && (
                          <Text fz="lg" fw={600}>
                            {clockWords(item.clock)}
                          </Text>
                        )}
                        <Text>{item.detail}</Text>
                      </div>
                      {item.fix && (
                        <Button variant="default" onClick={() => item.fix && props.onFix(item.fix)}>
                          {FIX_WORDS[item.fix]}
                        </Button>
                      )}
                    </Group>
                  </li>
                );
              })}
            </ul>
            <Group>
              <Button
                variant="default"
                onClick={() => void window.tscore.preEventCheck().then(apply)}
              >
                Check again
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              The camera check comes with scanning.
            </Text>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
