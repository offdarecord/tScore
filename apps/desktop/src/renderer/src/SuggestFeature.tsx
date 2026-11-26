import {
  Alert,
  Button,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  SUGGESTION_EMAIL,
  SUGGESTION_QUESTIONS,
  suggestionMissing,
  suggestionText,
  type SuggestionContext,
} from '@tscore/core';
import { useState } from 'react';
import type { AppError, Outcome, SuggestionSent } from '../../shared/ipc';
import { ErrorAlert } from './ErrorAlert';
import i18next, { coreT } from './i18n';

const DONE = {
  email: 'suggest.email',
  'email-and-clipboard': 'suggest.emailAndClipboard',
  clipboard: 'suggest.clipboard',
  file: 'suggest.file',
  none: null,
} as const satisfies Record<SuggestionSent['via'], string | null>;

/**
 * About → Suggest a feature: the same questions as the public page and the GitHub form. Works
 * offline. tScore never sends it; the person emails, copies or saves it.
 */
export function SuggestFeature(props: {
  opened: boolean;
  onClose: () => void;
  context: SuggestionContext;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [done, setDone] = useState<SuggestionSent | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  async function send(how: (text: string) => Promise<Outcome<SuggestionSent>>) {
    setDone(null);
    setError(null);
    const gaps = suggestionMissing(answers);
    setMissing(gaps);
    if (gaps.length) return;
    const r = await how(suggestionText(answers, props.context));
    if (!r.ok) setError(r.error);
    else if (r.value.via !== 'none') setDone(r.value);
  }

  const set = (id: string, value: string) => setAnswers((a) => ({ ...a, [id]: value }));
  const error_ = (label: string) =>
    missing.includes(label) ? i18next.t('suggest.answerThis') : null;

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={i18next.t('suggest.title')}
      size="lg"
      closeButtonProps={{ 'aria-label': i18next.t('suggest.close') }}
    >
      <Stack gap="md">
        <Text size="sm">{i18next.t('suggest.intro')}</Text>
        {SUGGESTION_QUESTIONS.map((q) => {
          // Shown in the laptop's language; the text sent to the maintainers stays English.
          const common = {
            label: coreT(`core.suggest_${q.id}`, q.label),
            required: q.required === true,
            error: error_(q.label),
            ...(q.help && { description: coreT(`core.suggest_${q.id}_help`, q.help) }),
          };
          if (q.kind === 'choice') {
            return (
              <NativeSelect
                key={q.id}
                {...common}
                value={answers[q.id] ?? ''}
                onChange={(e) => set(q.id, e.currentTarget.value)}
                data={[
                  { value: '', label: i18next.t('suggest.choose') },
                  ...(q.options ?? []).map((o, i) => ({
                    value: o,
                    label: coreT(`core.suggest_${q.id}_${i + 1}`, o),
                  })),
                ]}
              />
            );
          }
          if (q.kind === 'line') {
            return (
              <TextInput
                key={q.id}
                {...common}
                value={answers[q.id] ?? ''}
                onChange={(e) => set(q.id, e.currentTarget.value)}
              />
            );
          }
          return (
            <Textarea
              key={q.id}
              {...common}
              autosize
              minRows={2}
              value={answers[q.id] ?? ''}
              onChange={(e) => set(q.id, e.currentTarget.value)}
            />
          );
        })}
        {missing.length > 0 && (
          <Alert color="red" role="alert">
            {i18next.t('suggest.answerFirst')}
          </Alert>
        )}
        {error && <ErrorAlert error={error} withHelp={false} />}
        {done && (
          <Alert color="green" role="status">
            {(() => {
              const key = DONE[done.via];
              return key ? i18next.t(key, { email: SUGGESTION_EMAIL }) : '';
            })()}
            {done.file && (
              <Text size="sm" style={{ wordBreak: 'break-all' }}>
                {done.file}
              </Text>
            )}
          </Alert>
        )}
        <Group gap="sm">
          <Button onClick={() => void send(window.tscore.emailSuggestion)}>
            {i18next.t('suggest.emailButton')}
          </Button>
          <Button variant="default" onClick={() => void send(window.tscore.copySuggestion)}>
            {i18next.t('suggest.copy')}
          </Button>
          <Button variant="default" onClick={() => void send(window.tscore.saveSuggestion)}>
            {i18next.t('suggest.save')}
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {i18next.t('suggest.goesTo', { email: SUGGESTION_EMAIL })}
        </Text>
      </Stack>
    </Modal>
  );
}
