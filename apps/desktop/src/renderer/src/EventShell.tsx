import { Button, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { EntryListFile, OpenEvent } from '../../shared/ipc';
import { ManualEntry } from './cards/ManualEntry';
import { PreEventCheck } from './check/PreEventCheck';
import { OnCourse } from './course/OnCourse';
import { Progress } from './course/Progress';
import { CardLabels } from './labels/CardLabels';
import { Results } from './results/Results';
import { ReviewQueue } from './scan/ReviewQueue';
import { ScanDesk } from './scan/ScanDesk';
import { formatDate } from './format';
import { ImportRiders } from './riders/ImportRiders';
import { Riders } from './riders/Riders';
import { BackupCard } from './setup/BackupCard';
import { LogosCard } from './setup/LogosCard';
import { SetupForm } from './setup/SetupForm';

/** The event screens that exist so far. */
export type EventPage =
  | { readonly name: 'setup' }
  | { readonly name: 'riders'; readonly notice?: string }
  | { readonly name: 'import'; readonly file: EntryListFile }
  | { readonly name: 'check' }
  | { readonly name: 'labels' }
  | { readonly name: 'scan' }
  | { readonly name: 'manual' }
  | { readonly name: 'review' }
  | { readonly name: 'progress' }
  | { readonly name: 'course' }
  | { readonly name: 'results' };

interface Props {
  readonly event: OpenEvent;
  readonly page: EventPage;
  readonly onChange: (event: OpenEvent) => void;
  readonly onNavigate: (page: EventPage) => void;
}

/** The event's side navigation, for the AppShell navbar. */
export function EventNav(props: {
  event: OpenEvent;
  page: EventPage;
  onClose: () => void;
  onNavigate: (page: EventPage) => void;
}) {
  const { event, page, onClose, onNavigate } = props;
  const { setup } = event;
  const { t } = useTranslation();
  const date = setup.days[0]?.date;
  return (
    <Stack gap={2} component="nav" aria-label={t('nav.label')}>
      <Button variant="subtle" color="gray" justify="flex-start" onClick={onClose}>
        {t('nav.allEvents')}
      </Button>
      <div style={{ padding: '10px 12px 4px' }}>
        <Text fw={700} size="lg">
          {setup.event.name}
        </Text>
        <Text size="sm" c="dimmed">
          {setup.event.code}
          {date ? ` · ${formatDate(date)}` : ''}
        </Text>
      </div>
      <NavHeading>{t('nav.before')}</NavHeading>
      <NavGroup>
        <NavLink
          label={t('nav.check')}
          current={page.name === 'check'}
          onClick={() => onNavigate({ name: 'check' })}
        />
        <NavLink
          label={t('nav.setup')}
          current={page.name === 'setup'}
          onClick={() => onNavigate({ name: 'setup' })}
        />
        <NavLink
          label={t('nav.riders')}
          count={event.riders}
          current={page.name === 'riders' || page.name === 'import'}
          onClick={() => onNavigate({ name: 'riders' })}
        />
        <NavLink
          label={t('nav.labels')}
          current={page.name === 'labels'}
          onClick={() => onNavigate({ name: 'labels' })}
        />
      </NavGroup>
      <NavHeading>{t('nav.onTheDay')}</NavHeading>
      <NavGroup>
        <NavLink
          label={t('nav.scan')}
          current={page.name === 'scan'}
          onClick={() => onNavigate({ name: 'scan' })}
        />
        <NavLink
          label={t('nav.manual')}
          current={page.name === 'manual'}
          onClick={() => onNavigate({ name: 'manual' })}
        />
        <NavLink
          label={t('nav.review')}
          current={page.name === 'review'}
          onClick={() => onNavigate({ name: 'review' })}
        />
        <NavLink
          label={t('nav.progress')}
          current={page.name === 'progress'}
          onClick={() => onNavigate({ name: 'progress' })}
        />
        <NavLink
          label={t('nav.course')}
          current={page.name === 'course'}
          onClick={() => onNavigate({ name: 'course' })}
        />
        <NavLink
          label={t('nav.results')}
          current={page.name === 'results'}
          onClick={() => onNavigate({ name: 'results' })}
        />
      </NavGroup>
    </Stack>
  );
}

/**
 * A section heading: structure, not a page. It sits further left than its pages, with wider
 * letter spacing and a divider above, so it doesn't read as one more menu item.
 */
function NavHeading({ children }: { children: string }) {
  return (
    <Text
      size="xs"
      fw={700}
      c="dimmed"
      tt="uppercase"
      lts="0.08em"
      mt="md"
      mb={4}
      px={4}
      pt="sm"
      style={{
        borderTop: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
      }}
    >
      {children}
    </Text>
  );
}

/** A section's pages, set in from its heading. */
function NavGroup({ children }: { children: React.ReactNode }) {
  return (
    <Stack gap={2} pl={10}>
      {children}
    </Stack>
  );
}

function NavLink(props: { label: string; current: boolean; count?: number; onClick: () => void }) {
  return (
    <Button
      variant={props.current ? 'light' : 'subtle'}
      {...(!props.current && { color: 'dark' })}
      justify="space-between"
      fullWidth
      {...(props.current && { 'aria-current': 'page' as const })}
      rightSection={
        props.count ? (
          <Text size="sm" c="dimmed">
            {props.count}
          </Text>
        ) : undefined
      }
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}

/** The open event's main area. */
export function EventMain({ event, page, onChange, onNavigate }: Props) {
  if (page.name === 'manual') return <ManualEntry event={event} />;
  if (page.name === 'scan') return <ScanDesk event={event} />;
  if (page.name === 'review') {
    return <ReviewQueue event={event} onManualEntry={() => onNavigate({ name: 'manual' })} />;
  }
  if (page.name === 'labels') return <CardLabels event={event} />;
  if (page.name === 'check') {
    return (
      <PreEventCheck
        event={event}
        onFix={(fix) =>
          onNavigate({ name: fix === 'backup' ? 'setup' : fix === 'labels' ? 'labels' : fix })
        }
      />
    );
  }
  if (page.name === 'progress') {
    return <Progress event={event} onStillOnCourse={() => onNavigate({ name: 'course' })} />;
  }
  if (page.name === 'course') {
    return <OnCourse event={event} onCloseEvent={() => onNavigate({ name: 'results' })} />;
  }
  if (page.name === 'results') return <Results event={event} />;
  if (page.name === 'riders') {
    return (
      <Riders
        event={event}
        notice={page.notice}
        onImport={(file) => onNavigate({ name: 'import', file })}
        onLabels={() => onNavigate({ name: 'labels' })}
        onEventChange={onChange}
      />
    );
  }
  if (page.name === 'import') {
    return (
      <ImportRiders
        event={event}
        file={page.file}
        onCancel={() => onNavigate({ name: 'riders' })}
        onImported={(next, count) => {
          onChange(next);
          onNavigate({
            name: 'riders',
            notice: `${count} ${count === 1 ? 'rider' : 'riders'} imported.`,
          });
        }}
      />
    );
  }
  return (
    <Stack gap="lg">
      <SetupForm
        key={event.folder}
        mode="edit"
        setup={event.setup}
        ridersByClass={event.ridersByClass}
        onSave={async (setup) => {
          const r = await window.tscore.updateSetup(setup);
          if (r.ok) onChange(r.value);
          return r;
        }}
      />
      <LogosCard event={event} />
      <BackupCard event={event} />
    </Stack>
  );
}
