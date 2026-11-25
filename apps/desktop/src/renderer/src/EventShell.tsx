import { Button, Stack, Text } from '@mantine/core';
import type { EntryListFile, OpenEvent } from '../../shared/ipc';
import { ManualEntry } from './cards/ManualEntry';
import { PreEventCheck } from './check/PreEventCheck';
import { OnCourse } from './course/OnCourse';
import { Progress } from './course/Progress';
import { CardLabels } from './labels/CardLabels';
import { ComingSoonButton } from './ComingSoonButton';
import { Results } from './results/Results';
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
  | { readonly name: 'manual' }
  | { readonly name: 'progress' }
  | { readonly name: 'course' }
  | { readonly name: 'results' };

interface Props {
  readonly event: OpenEvent;
  readonly page: EventPage;
  readonly onChange: (event: OpenEvent) => void;
  readonly onNavigate: (page: EventPage) => void;
}

/** Screens that aren't built yet, in the order of the agreed mock-ups. */
const SCAN_DESK = 'Scan desk';
const REVIEW_QUEUE = 'Review queue';

/** The event's side navigation, for the AppShell navbar. */
export function EventNav(props: {
  event: OpenEvent;
  page: EventPage;
  onClose: () => void;
  onNavigate: (page: EventPage) => void;
}) {
  const { event, page, onClose, onNavigate } = props;
  const { setup } = event;
  const date = setup.days[0]?.date;
  return (
    <Stack gap={2} component="nav" aria-label="Event">
      <Button variant="subtle" color="gray" justify="flex-start" onClick={onClose}>
        ← All events
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
      <NavHeading>Before the event</NavHeading>
      <NavGroup>
        <NavLink
          label="Pre-event check"
          current={page.name === 'check'}
          onClick={() => onNavigate({ name: 'check' })}
        />
        <NavLink
          label="Event setup"
          current={page.name === 'setup'}
          onClick={() => onNavigate({ name: 'setup' })}
        />
        <NavLink
          label="Riders"
          count={event.riders}
          current={page.name === 'riders' || page.name === 'import'}
          onClick={() => onNavigate({ name: 'riders' })}
        />
        <NavLink
          label="Card labels"
          current={page.name === 'labels'}
          onClick={() => onNavigate({ name: 'labels' })}
        />
      </NavGroup>
      <NavHeading>On the day</NavHeading>
      <NavGroup>
        <NavLater label={SCAN_DESK} />
        <NavLink
          label="Manual entry"
          current={page.name === 'manual'}
          onClick={() => onNavigate({ name: 'manual' })}
        />
        <NavLater label={REVIEW_QUEUE} />
        <NavLink
          label="Progress"
          current={page.name === 'progress'}
          onClick={() => onNavigate({ name: 'progress' })}
        />
        <NavLink
          label="Still on course"
          current={page.name === 'course'}
          onClick={() => onNavigate({ name: 'course' })}
        />
        <NavLink
          label="Results"
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
      style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
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

function NavLater({ label }: { label: string }) {
  return (
    <ComingSoonButton variant="subtle" color="gray" justify="flex-start">
      {label}
    </ComingSoonButton>
  );
}

/** The open event's main area. */
export function EventMain({ event, page, onChange, onNavigate }: Props) {
  if (page.name === 'manual') return <ManualEntry event={event} />;
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
