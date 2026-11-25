import { SegmentedControl, useMantineColorScheme, type MantineColorScheme } from '@mantine/core';

/**
 * Light, Dark or Match Windows, in the top bar so it can be flipped on the day. The choice is
 * saved on this laptop (not in the event). Light is the default: high contrast for daylight.
 * Printed output, PDFs, labels and card drawings stay light whatever is chosen here.
 */
export function ColorSchemeSwitch() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <SegmentedControl
      size="xs"
      aria-label="Colour scheme"
      value={colorScheme}
      onChange={(v) => setColorScheme(v as MantineColorScheme)}
      data={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'auto', label: 'Match Windows' },
      ]}
    />
  );
}
