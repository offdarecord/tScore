import { Button, Kbd } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { HELP_TOPICS, type HelpTopic, type HelpTopicName } from './topics';

interface HelpState {
  /** The pages visited since help opened; the last is shown. Empty when help is closed. */
  readonly history: readonly HelpTopic[];
  /** Open help at a topic (replacing what was shown, keeping Back). */
  show(topic: HelpTopic): void;
  back(): void;
  close(): void;
}

const Context = createContext<HelpState | null>(null);

export function useHelp(): HelpState {
  const help = useContext(Context);
  if (!help) throw new Error('useHelp outside HelpProvider');
  return help;
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<readonly HelpTopic[]>([]);
  const show = useCallback((topic: HelpTopic) => setHistory((h) => [...h, topic]), []);
  const back = useCallback(() => setHistory((h) => h.slice(0, -1)), []);
  const close = useCallback(() => setHistory([]), []);
  const value = useMemo(() => ({ history, show, back, close }), [history, show, back, close]);
  // Esc closes help from inside the panel (HelpPanel), and also from whatever opened it: the
  // Help button or a help link keeps focus after a click, and so does nothing in particular.
  // Anywhere else Esc stays the screen's own (Cancel, Clear).
  const open = history.length > 0;
  useEffect(() => {
    if (!open) return;
    const keys = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (!target || target === document.body || target.closest('[data-help-opener]')) close();
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, [open, close]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * The header's **Help** button: opens the guide at the page for the screen in front of the desk.
 * F1 does the same from anywhere.
 */
export function HelpButton({ topic }: { topic: HelpTopicName }) {
  const { t } = useTranslation();
  const help = useHelp();
  const open = () => help.show(HELP_TOPICS[topic]);
  // `[]`: no tags ignored, so F1 works while typing in a box too.
  useHotkeys([['F1', open]], []);
  return (
    <Button
      variant="light"
      onClick={open}
      leftSection={<span aria-hidden="true">?</span>}
      rightSection={<Kbd size="xs">F1</Kbd>}
      aria-keyshortcuts="F1"
      data-help-opener
    >
      {t('help.button')}
    </Button>
  );
}

/** A link into the guide, for use beside a field or a message. */
export function HelpLink(props: { topic: HelpTopic; children: ReactNode }) {
  const help = useHelp();
  return (
    <Button
      variant="subtle"
      size="compact-sm"
      px={4}
      onClick={() => help.show(props.topic)}
      leftSection={<span aria-hidden="true">?</span>}
      data-help-opener
    >
      {props.children}
    </Button>
  );
}
