import { Anchor, AppShell, Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { newEventSetup } from '@tscore/core';
import { useEffect, useState } from 'react';
import type { AppInfo, OpenEvent } from '../../shared/ipc';
import { ColorSchemeSwitch } from './ColorSchemeSwitch';
import { EventMain, EventNav, type EventPage } from './EventShell';
import { today } from './format';
import { HelpButton, HelpProvider, useHelp } from './help/Help';
import { HelpPanel } from './help/HelpPanel';
import type { HelpTopicName } from './help/topics';
import { Home } from './Home';
import { SetupForm } from './setup/SetupForm';

type Screen =
  { kind: 'home' } | { kind: 'new' } | { kind: 'event'; event: OpenEvent; page: EventPage };

export function App() {
  return (
    <HelpProvider>
      <Shell />
    </HelpProvider>
  );
}

/** The guide page for the screen in front of the desk. */
function topicFor(screen: Screen): HelpTopicName {
  if (screen.kind === 'home') return 'home';
  if (screen.kind === 'new') return 'newEvent';
  return screen.page.name;
}

function Shell() {
  const help = useHelp();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [aboutOpen, about] = useDisclosure(false);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });

  useEffect(() => {
    void window.tscore.getAppInfo().then(setInfo);
    // After a window reload the event is still open in the main process: go back to it.
    void window.tscore.currentEvent().then((event) => {
      if (event) setScreen({ kind: 'event', event, page: { name: 'setup' } });
    });
  }, []);

  const eventName = screen.kind === 'event' ? screen.event.setup.event.name : null;
  useEffect(() => {
    document.title = eventName ? `${eventName} – tScore` : 'tScore';
  }, [eventName]);

  /** Show the event: a newly opened one at its setup, the same one on the page it's on. */
  const open = (event: OpenEvent) =>
    setScreen((s) => ({
      kind: 'event',
      event,
      page: s.kind === 'event' && s.event.folder === event.folder ? s.page : { name: 'setup' },
    }));
  const navigate = (page: EventPage) => setScreen((s) => (s.kind === 'event' ? { ...s, page } : s));
  const closeEvent = () => void window.tscore.closeEvent().then(() => setScreen({ kind: 'home' }));

  return (
    <AppShell
      header={{ height: 60 }}
      {...(screen.kind === 'event' && { navbar: { width: 260, breakpoint: 0 } })}
      aside={{
        width: { base: 380, lg: 460 },
        breakpoint: 0,
        collapsed: { desktop: help.history.length === 0, mobile: help.history.length === 0 },
      }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <Title order={1} size="h3">
            tScore
          </Title>
          <Group gap="xs">
            <ColorSchemeSwitch />
            <HelpButton topic={topicFor(screen)} />
            <Button variant="subtle" onClick={about.open}>
              About
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      {screen.kind === 'event' && (
        <AppShell.Navbar p="sm">
          <EventNav
            event={screen.event}
            page={screen.page}
            onClose={closeEvent}
            onNavigate={navigate}
          />
        </AppShell.Navbar>
      )}

      <AppShell.Main>
        {screen.kind === 'home' && (
          <Home info={info} onNew={() => setScreen({ kind: 'new' })} onOpened={open} />
        )}
        {screen.kind === 'new' && (
          <SetupForm
            mode="new"
            setup={newEventSetup(today())}
            onSave={async (setup) => {
              const r = await window.tscore.createEvent(setup);
              if (r.ok) open(r.value);
              return r;
            }}
            onCancel={() => setScreen({ kind: 'home' })}
          />
        )}
        {screen.kind === 'event' && (
          <EventMain
            event={screen.event}
            page={screen.page}
            onChange={open}
            onNavigate={navigate}
          />
        )}
      </AppShell.Main>

      <AppShell.Aside aria-label="Help panel">
        <HelpPanel />
      </AppShell.Aside>

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
