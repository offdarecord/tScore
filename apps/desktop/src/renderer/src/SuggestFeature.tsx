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

const DONE: Record<SuggestionSent['via'], string> = {
  email: 'Your mail app should now be open with the suggestion in it. Check it, then send.',
  'email-and-clipboard':
    'It was too long to fit in an email link, so it’s on the clipboard: paste it into the email (Ctrl+V), then send.',
  clipboard: `Copied. Paste it into an email to ${SUGGESTION_EMAIL}, or a message.`,
  file: 'Saved. Email it later, or hand it to someone who can.',
  none: '',
};

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
  const error_ = (label: string) => (missing.includes(label) ? 'Please answer this one.' : null);

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="Suggest a feature"
      size="lg"
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <Stack gap="md">
        <Text size="sm">
          Works without internet. Nothing is sent from tScore: email it, copy it, or save it to send
          later. tScore adds its version, the Windows version and the screen you were on, never
          event or rider details. Questions marked * are needed.
        </Text>
        {SUGGESTION_QUESTIONS.map((q) => {
          const label = `${q.label}${q.required ? ' *' : ''}`;
          const common = {
            label,
            error: error_(q.label),
            ...(q.help && { description: q.help }),
          };
          if (q.kind === 'choice') {
            return (
              <NativeSelect
                key={q.id}
                {...common}
                value={answers[q.id] ?? ''}
                onChange={(e) => set(q.id, e.currentTarget.value)}
                data={[{ value: '', label: 'Choose…' }, ...(q.options ?? [])]}
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
            Please answer the questions marked * first.
          </Alert>
        )}
        {error && <ErrorAlert error={error} withHelp={false} />}
        {done && (
          <Alert color="green" role="status">
            {DONE[done.via]}
            {done.file && (
              <Text size="sm" style={{ wordBreak: 'break-all' }}>
                {done.file}
              </Text>
            )}
          </Alert>
        )}
        <Group gap="sm">
          <Button onClick={() => void send(window.tscore.emailSuggestion)}>Email…</Button>
          <Button variant="default" onClick={() => void send(window.tscore.copySuggestion)}>
            Copy
          </Button>
          <Button variant="default" onClick={() => void send(window.tscore.saveSuggestion)}>
            Save as file…
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Email goes to {SUGGESTION_EMAIL}.
        </Text>
      </Stack>
    </Modal>
  );
}
