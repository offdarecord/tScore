import { AppShell, Button, Center, Group, Modal, Stack, Text, Title, Anchor } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import type { AppInfo } from '../../shared/ipc';
import { ComingSoonButton } from './ComingSoonButton';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [aboutOpen, about] = useDisclosure(false);

  useEffect(() => {
    void window.tscore.getAppInfo().then(setInfo);
  }, []);

  return (
    <AppShell header={{ height: 60 }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <Title order={1} size="h3">
            tScore
          </Title>
          <Button variant="subtle" onClick={about.open}>
            About
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Center mih="70vh">
          <Stack align="center" gap="md" maw={520}>
            <Title order={2}>No event open</Title>
            <Text ta="center" c="dimmed">
              tScore is in early development. Event setup, card scanning and results are on the way.
            </Text>
            <Group>
              <ComingSoonButton>New event</ComingSoonButton>
              <ComingSoonButton variant="default">Open event</ComingSoonButton>
            </Group>
          </Stack>
        </Center>
      </AppShell.Main>

      <Modal opened={aboutOpen} onClose={about.close} title="About tScore">
        <Stack gap="xs">
          <Text>Version {info?.version ?? '…'}</Text>
          <Text size="xs" c="dimmed">
            Electron {info?.electron} · {info?.platform} {info?.arch}
          </Text>
          <Text size="xs">
            Free and open source under the Apache License 2.0.{' '}
            <Anchor href="https://github.com/offdarecord/tScore" target="_blank">
              Source and changelog
            </Anchor>
          </Text>
        </Stack>
      </Modal>
    </AppShell>
  );
}
