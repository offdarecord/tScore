import { Button, Stack, Text } from '@mantine/core';
import type { OpenEvent } from '../../shared/ipc';
import { ComingSoonButton } from './ComingSoonButton';
import { formatDate } from './format';
import { SetupForm } from './setup/SetupForm';

interface Props {
  readonly event: OpenEvent;
  readonly onChange: (event: OpenEvent) => void;
}

/** Screens that aren't built yet, in the order of the agreed mock-ups. */
const CHECK = 'Pre-event check';
const BEFORE = ['Riders', 'Card labels'];
const ON_THE_DAY = [
  'Scan desk',
  'Manual entry',
  'Review queue',
  'Progress',
  'Still on course',
  'Results',
];

/** The event's side navigation, for the AppShell navbar. */
export function EventNav({ event, onClose }: { event: OpenEvent; onClose: () => void }) {
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
      <Button variant="light" justify="flex-start" aria-current="page">
        Event setup
      </Button>
      {BEFORE.map((l) => (
        <NavLater key={l} label={l} />
      ))}
      <NavHeading>On the day</NavHeading>
      {ON_THE_DAY.map((l) => (
        <NavLater key={l} label={l} />
      ))}
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

function NavLater({ label }: { label: string }) {
  return (
    <ComingSoonButton variant="subtle" color="gray" justify="flex-start">
      {label}
    </ComingSoonButton>
  );
}

/** The open event's main area. Only Event setup exists so far. */
export function EventMain({ event, onChange }: Props) {
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
