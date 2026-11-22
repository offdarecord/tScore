import { Button, Tooltip, type ButtonProps } from '@mantine/core';
import type { ReactNode } from 'react';

const MESSAGE = 'Coming in a later version of tScore';

/**
 * A button for a feature that isn't built yet. It looks disabled and does nothing, but stays
 * focusable so the explanation shows on hover and on keyboard focus (a truly disabled button
 * shows nothing, which reads as "broken").
 */
export function ComingSoonButton(props: ButtonProps & { children: ReactNode }) {
  return (
    <Tooltip
      label={MESSAGE}
      withArrow
      openDelay={100}
      events={{ hover: true, focus: true, touch: true }}
    >
      <Button
        {...props}
        data-disabled
        aria-disabled="true"
        aria-description={MESSAGE}
        onClick={(e) => e.preventDefault()}
      />
    </Tooltip>
  );
}
