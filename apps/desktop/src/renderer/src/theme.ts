import { createTheme, type CSSVariablesResolver } from '@mantine/core';

/**
 * Colour overrides that keep text at WCAG 2.2 AA contrast (4.5:1) or better. Mantine's default
 * "dimmed" grey is about 3.3:1 on white, too faint for daylight in a tent.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-dimmed': '#495057' },
  dark: {},
});

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
  components: {
    // Help text goes under the box, never between label and box, on every field: fields side
    // by side then line up whether or not they have help text (scorer review, 25 Nov 2026).
    InputWrapper: {
      defaultProps: { inputWrapperOrder: ['label', 'input', 'description', 'error'] },
    },
  },
  other: {
    /** Scan desk: rider number and result are at least 48 px (ADR 0009). */
    scanDeskFontSize: '56px',
  },
});
