import { SegmentedControl, useMantineColorScheme, type MantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { isMac } from './i18n';

/**
 * Light, Dark or Match Windows (Match System on a Mac), in the top bar so it can be flipped on the day. The choice is
 * saved on this laptop (not in the event). Light is the default: high contrast for daylight.
 * Printed output, PDFs, labels and card drawings stay light whatever is chosen here.
 */
export function ColorSchemeSwitch() {
  const { t } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <SegmentedControl
      size="xs"
      aria-label={t('scheme.label')}
      value={colorScheme}
      onChange={(v) => setColorScheme(v as MantineColorScheme)}
      data={[
        { value: 'light', label: t('scheme.light') },
        { value: 'dark', label: t('scheme.dark') },
        { value: 'auto', label: isMac ? t('scheme.matchSystem') : t('scheme.matchWindows') },
      ]}
    />
  );
}
