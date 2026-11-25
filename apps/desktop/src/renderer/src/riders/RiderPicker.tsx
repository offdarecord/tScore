import { Paper, Text, TextInput, UnstyledButton, type TextInputProps } from '@mantine/core';
import { forwardRef, useMemo, type KeyboardEvent } from 'react';
import type { RiderInfo } from '../../../shared/ipc';
import { riderName } from './Riders';

type Props<R extends RiderInfo> = Omit<TextInputProps, 'value' | 'onChange' | 'onKeyDown'> & {
  readonly riders: readonly R[] | undefined;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** A rider is chosen: the box shows them, and no list is offered. */
  readonly picked: boolean;
  readonly onPick: (rider: R) => void;
};

/** What the box shows once a rider is chosen. */
export const pickedText = (r: RiderInfo) => `${r.number} ${riderName(r)}`;

/**
 * Find a rider by typing their number or part of their name, as on the Riders screen. Up to six
 * matches are listed to click; Enter takes an exact number, or the only match.
 */
function RiderPickerInner<R extends RiderInfo>(
  { riders, query, onQueryChange, picked, onPick, ...input }: Props<R>,
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!riders || picked || !q) return [];
    return riders
      .filter((r) => String(r.number).startsWith(q) || riderName(r).toLowerCase().includes(q))
      .slice(0, 6);
  }, [riders, query, picked]);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !riders || picked) return;
    const q = query.trim();
    const choice =
      riders.find((r) => String(r.number) === q) ?? (matches.length === 1 ? matches[0] : undefined);
    if (choice) {
      e.preventDefault();
      e.stopPropagation();
      onPick(choice);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <TextInput
        ref={ref}
        {...input}
        value={query}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
        onKeyDown={onKey}
        {...(!picked &&
          riders &&
          query.trim() &&
          matches.length === 0 && {
            error: `No rider matches "${query.trim()}". Check the number, or add them on the Riders screen.`,
          })}
        styles={{ error: { color: 'light-dark(#a51111, #ffa8a8)', fontSize: 15 } }}
      />
      {matches.length > 0 && (
        <Paper withBorder mt={4} role="listbox" aria-label="Matching riders">
          {matches.map((s) => (
            <UnstyledButton
              key={s.number}
              role="option"
              aria-selected="false"
              onClick={() => onPick(s)}
              style={{
                display: 'flex',
                gap: 12,
                width: '100%',
                padding: '8px 12px',
                minHeight: 44,
                alignItems: 'center',
                borderTop: '1px solid light-dark(#e9ecef, #2e3236)',
              }}
            >
              <Text fw={800} w={40} size="lg">
                {s.number}
              </Text>
              <Text>
                {riderName(s)} · {s.classes[0]}
              </Text>
            </UnstyledButton>
          ))}
        </Paper>
      )}
    </div>
  );
}

export const RiderPicker = forwardRef(RiderPickerInner) as <R extends RiderInfo>(
  props: Props<R> & { ref?: React.Ref<HTMLInputElement> },
) => ReturnType<typeof RiderPickerInner>;
