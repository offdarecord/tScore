/**
 * Which guide page answers the questions on each screen: the **Help** button and F1 open it.
 * The guide's tests check that every page and heading named here exists.
 */
export interface HelpTopic {
  readonly page: string;
  /** A heading id on that page (GitHub's ids: lower case, hyphens). */
  readonly anchor?: string;
}

export const HELP_TOPICS = {
  home: { page: 'getting-started' },
  newEvent: { page: 'before-the-event', anchor: 'event-setup' },
  setup: { page: 'before-the-event', anchor: 'event-setup' },
  riders: { page: 'before-the-event', anchor: 'riders' },
  import: { page: 'before-the-event', anchor: 'import-the-entry-list' },
  check: { page: 'before-the-event', anchor: 'pre-event-check' },
  labels: { page: 'before-the-event', anchor: 'card-labels' },
  manual: { page: 'event-day', anchor: 'manual-entry' },
  progress: { page: 'event-day', anchor: 'progress' },
  course: { page: 'event-day', anchor: 'still-on-course' },
  results: { page: 'results' },
  checklist: { page: 'checklist' },
  errors: { page: 'errors' },
} as const satisfies Record<string, HelpTopic>;

export type HelpTopicName = keyof typeof HELP_TOPICS;
