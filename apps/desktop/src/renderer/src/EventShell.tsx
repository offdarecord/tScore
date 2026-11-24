import { Button, Stack, Text } from '@mantine/core';
import type { EntryListFile, OpenEvent } from '../../shared/ipc';
import { ManualEntry } from './cards/ManualEntry';
import { CardLabels } from './labels/CardLabels';
import { ComingSoonButton } from './ComingSoonButton';
import { Results } from './results/Results';
import { formatDate } from './format';
import { ImportRiders } from './riders/ImportRiders';
import { Riders } from './riders/Riders';
import { SetupForm } from './setup/SetupForm';

/** The event screens that exist so far. */
export type EventPage =
  | { readonly name: 'setup' }
  | { readonly name: 'riders'; readonly notice?: string }
  | { readonly name: 'import'; readonly file: EntryListFile }
  | { readonly name: 'labels' }
  | { readonly name: 'manual' }
  | { readonly name: 'results' };

interface Props {
  readonly event: OpenEvent;
  readonly page: EventPage;
  readonly onChange: (event: OpenEvent) => void;
  readonly onNavigate: (page: EventPage) => void;
}

/** Screens that aren't built yet, in the order of the agreed mock-ups. */
const CHECK = 'Pre-event check';
const SCAN_DESK = 'Scan desk';
const LATER_ON_THE_DAY = ['Review queue', 'Progress', 'Still on course'];

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
      <NavLater label={CHECK} />
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
      <NavHeading>On the day</NavHeading>
      <NavLater label={SCAN_DESK} />
      <NavLink
        label="Manual entry"
        current={page.name === 'manual'}
        onClick={() => onNavigate({ name: 'manual' })}
      />
      {LATER_ON_THE_DAY.map((l) => (
        <NavLater key={l} label={l} />
      ))}
      <NavLink
        label="Results"
        current={page.name === 'results'}
        onClick={() => onNavigate({ name: 'results' })}
      />
    </Stack>
  );
}

function NavHeading({ children }: { children: string }) {
  return (
    <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="md" mb={4} px={12}>
      {children}
    </Text>
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
  if (page.name === 'results') return <Results event={event} />;
  if (page.name === 'riders') {
    return (
      <Riders
        event={event}
        notice={page.notice}
        onImport={(file) => onNavigate({ name: 'import', file })}
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
  );
}
