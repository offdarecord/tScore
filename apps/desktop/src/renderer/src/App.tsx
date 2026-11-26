import { Anchor, AppShell, Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { newEventSetup } from '@tscore/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppInfo, OpenEvent } from '../../shared/ipc';
import { CardTypes } from './cards/CardTypes';
import { TeachCard } from './cards/TeachCard';
import { ColorSchemeSwitch } from './ColorSchemeSwitch';
import { EventMain, EventNav, type EventPage } from './EventShell';
import { today } from './format';
import { HelpButton, HelpProvider, useHelp } from './help/Help';
import { HelpPanel } from './help/HelpPanel';
import type { HelpTopicName } from './help/topics';
import { Home } from './Home';
import { ManageEvents, type ManageAction } from './manage/ManageEvents';
import { Series } from './series/Series';
import { SetupForm } from './setup/SetupForm';
import { SuggestFeature } from './SuggestFeature';

type Screen =
  | { kind: 'home' }
  | { kind: 'new' }
  | { kind: 'series' }
  | { kind: 'cardTypes' }
  | { kind: 'teachCard' }
  | { kind: 'manage'; preselect?: string[]; action?: ManageAction }
  | { kind: 'event'; event: OpenEvent; page: EventPage };

export function App() {
  return (
    <HelpProvider>
      <Shell />
    </HelpProvider>
  );
}

/** The screen's name for a feature suggestion: never the event's name or anything in it. */
const SCREEN_NAMES: Record<EventPage['name'], string> = {
  setup: 'Event setup',
  riders: 'Riders',
  import: 'Import review',
  check: 'Pre-event check',
  labels: 'Card labels',
  scan: 'Scan desk',
  manual: 'Manual entry',
  review: 'Review queue',
  progress: 'Progress',
  course: 'Still on course',
  results: 'Results',
};
const screenName = (s: Screen) =>
  s.kind === 'home'
    ? 'Home'
    : s.kind === 'new'
      ? 'New event'
      : s.kind === 'series'
        ? 'Series points'
        : s.kind === 'manage'
          ? 'Manage events'
          : s.kind === 'cardTypes'
            ? 'Card types'
            : s.kind === 'teachCard'
              ? 'Teach a card'
              : SCREEN_NAMES[s.page.name];

/** The guide page for the screen in front of the desk. */
function topicFor(screen: Screen): HelpTopicName {
  if (screen.kind === 'home') return 'home';
  if (screen.kind === 'new') return 'newEvent';
  if (screen.kind === 'series') return 'series';
  if (screen.kind === 'manage') return 'home';
  if (screen.kind === 'cardTypes') return 'cardTypes';
  if (screen.kind === 'teachCard') return 'teachCard';
  return screen.page.name;
}

function Shell() {
  const help = useHelp();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const { t } = useTranslation();
  const [aboutOpen, about] = useDisclosure(false);
  const [suggestOpen, suggest] = useDisclosure(false);
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
    document.title = eventName ? t('app.windowTitle', { event: eventName }) : t('app.name');
  }, [eventName, t]);

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
            {t('app.name')}
          </Title>
          <Group gap="xs">
            <ColorSchemeSwitch />
            <HelpButton topic={topicFor(screen)} />
            <Button variant="subtle" onClick={about.open}>
              {t('app.about')}
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
          <Home
            info={info}
            onNew={() => setScreen({ kind: 'new' })}
            onSeries={() => setScreen({ kind: 'series' })}
            onCardTypes={() => setScreen({ kind: 'cardTypes' })}
            onManage={(preselect, action) =>
              setScreen({
                kind: 'manage',
                ...(preselect && { preselect }),
                ...(action && { action }),
              })
            }
            onOpened={open}
          />
        )}
        {screen.kind === 'series' && <Series onBack={() => setScreen({ kind: 'home' })} />}
        {screen.kind === 'cardTypes' && (
          <CardTypes
            onBack={() => setScreen({ kind: 'home' })}
            onTeach={() => setScreen({ kind: 'teachCard' })}
          />
        )}
        {screen.kind === 'teachCard' && (
          <TeachCard onBack={() => setScreen({ kind: 'cardTypes' })} />
        )}
        {screen.kind === 'manage' && (
          <ManageEvents
            {...(screen.preselect && { preselect: screen.preselect })}
            {...(screen.action && { action: screen.action })}
            onBack={() => setScreen({ kind: 'home' })}
          />
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

      <AppShell.Aside aria-label={t('app.helpPanel')}>
        <HelpPanel />
      </AppShell.Aside>

      <Modal opened={aboutOpen} onClose={about.close} title={t('app.aboutTitle')}>
        <Stack gap="xs">
          <Text>{t('app.version', { version: info?.version ?? '…' })}</Text>
          <Text fs="italic">{t('app.tagline')}</Text>
          <Text size="xs" c="dimmed">
            {t('app.runtime', {
              electron: info?.electron ?? '',
              platform: info?.platform ?? '',
              arch: info?.arch ?? '',
            })}
          </Text>
          <Text size="xs">
            {t('app.licence')}{' '}
            <Anchor href="https://github.com/offdarecord/tScore" target="_blank">
              {t('app.source')}
            </Anchor>
          </Text>
          <Group mt="sm">
            <Button
              variant="default"
              onClick={() => {
                about.close();
                suggest.open();
              }}
            >
              {t('app.suggest')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <SuggestFeature
        opened={suggestOpen}
        onClose={suggest.close}
        context={{
          version: info?.version ?? 'unknown',
          windows: info?.os ?? 'unknown',
          screen: screenName(screen),
        }}
      />
    </AppShell>
  );
}
