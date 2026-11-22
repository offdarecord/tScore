import { createTheme } from '@mantine/core';

/**
 * The one theme file (ADR 0009). High-contrast light by default, for daylight in tents.
 * Body text is at least 16 px. Add design tokens here, not in individual components.
 */
export const theme = createTheme({
  primaryColor: 'blue',
  primaryShade: { light: 8, dark: 5 },
  fontFamily: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSizes: {
    xs: '14px',
    sm: '16px',
    md: '18px',
    lg: '20px',
    xl: '24px',
  },
  defaultRadius: 'md',
  black: '#111418',
  other: {
    /** Scan desk: rider number and result are at least 48 px (ADR 0009). */
    scanDeskFontSize: '56px',
  },
});
