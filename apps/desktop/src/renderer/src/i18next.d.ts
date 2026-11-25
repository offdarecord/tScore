import 'i18next';
import type { Messages } from '../../shared/i18n';

// Message keys are checked by TypeScript: a typo in t('home.newEvent') fails the build.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Messages };
  }
}
