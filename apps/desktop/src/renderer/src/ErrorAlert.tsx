import { Alert, Group, Text } from '@mantine/core';
import { errorAnchor, errorByCode } from '@tscore/core';
import type { AppError } from '../../shared/ipc';
import { HelpLink } from './help/Help';

/**
 * A problem, in plain words, with its code and a **What to do** link to its entry on the guide's
 * error-code page (ADR 0012). The one way screens show an `AppError`.
 *
 * `withHelp={false}` inside a dialog: the help panel would open behind it.
 */
export function ErrorAlert(props: {
  error: AppError;
  title?: string;
  onClose?: () => void;
  withHelp?: boolean;
}) {
  const { error, title, onClose, withHelp = true } = props;
  const known = errorByCode(error.code);
  return (
    <Alert
      color="red"
      role="alert"
      {...(title && { title })}
      {...(onClose && { withCloseButton: true, onClose, closeButtonLabel: 'Close' })}
    >
      {error.message}{' '}
      <Text span c="dimmed" size="sm">
        ({error.code})
      </Text>
      {withHelp && known && (
        <Group mt={4}>
          <HelpLink topic={{ page: 'errors', anchor: errorAnchor(known.code) }}>
            What to do
          </HelpLink>
        </Group>
      )}
    </Alert>
  );
}
