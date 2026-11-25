import { Button, Tooltip, type ButtonProps } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A button for a feature that isn't built yet. It looks disabled and does nothing, but stays
 * focusable so the explanation shows on hover and on keyboard focus (a truly disabled button
 * shows nothing, which reads as "broken").
 */
export function ComingSoonButton(props: ButtonProps & { children: ReactNode }) {
  const { t } = useTranslation();
  const message = t('comingSoon');
  return (
    <Tooltip
      label={message}
      withArrow
      openDelay={100}
      events={{ hover: true, focus: true, touch: true }}
    >
      <Button
        {...props}
        data-disabled
        aria-disabled="true"
        aria-description={message}
        onClick={(e) => e.preventDefault()}
      />
    </Tooltip>
  );
}
