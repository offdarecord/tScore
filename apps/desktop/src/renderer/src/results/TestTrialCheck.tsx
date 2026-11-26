import { Alert, Button, List, Modal, Stack, Table, Text } from '@mantine/core';
import type { TestTrialCheck } from '@tscore/core';
import { useState } from 'react';
import type { AppError } from '../../../shared/ipc';
import i18next from '../i18n';

/** Events made from the Test trial kit say so in their name. */
export const isTestTrialEvent = (name: string) => /test trial/i.test(name);

/**
 * Check a test trial (#81): compare what tScore recorded with the kit's answer key, and say
 * plainly how many cards were read correctly and what to look at for the rest.
 */
export function TestTrialCheckButton({ onError }: { onError: (e: AppError) => void }) {
  const [result, setResult] = useState<TestTrialCheck | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Button
        variant="default"
        loading={busy}
        onClick={() => {
          setBusy(true);
          void window.tscore.checkTestTrial().then((r) => {
            setBusy(false);
            if (!r.ok) onError(r.error);
            else if (r.value) setResult(r.value);
          });
        }}
      >
        {i18next.t('testTrial.button')}
      </Button>
      {result && <CheckResult result={result} onClose={() => setResult(null)} />}
    </>
  );
}

const OUTCOME = {
  right: 'testTrial.right',
  wrong: 'testTrial.wrong',
  missing: 'testTrial.missing',
  no_rider: 'testTrial.noRider',
} as const satisfies Record<TestTrialCheck['results'][number]['outcome'], string>;

function CheckResult({ result, onClose }: { result: TestTrialCheck; onClose: () => void }) {
  const all = result.right === result.cards;
  const notRight = result.results.filter((r) => r.outcome !== 'right');
  return (
    <Modal
      opened
      onClose={onClose}
      title={i18next.t('testTrial.title')}
      size="xl"
      closeButtonProps={{ 'aria-label': i18next.t('testTrial.close') }}
    >
      <Stack gap="md">
        <Alert color={all ? 'green' : 'yellow'} role="status">
          <Text fw={700} fz="lg">
            {i18next.t('testTrial.read', { right: result.right, cards: result.cards })}
          </Text>
          {all && <Text>{i18next.t('testTrial.ready')}</Text>}
        </Alert>
        {notRight.length > 0 && (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{i18next.t('testTrial.card')}</Table.Th>
                  <Table.Th>{i18next.t('testTrial.rider')}</Table.Th>
                  <Table.Th>{i18next.t('testTrial.lap')}</Table.Th>
                  <Table.Th>{i18next.t('testTrial.what')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {notRight.map((r) => (
                  <Table.Tr key={r.card}>
                    <Table.Td>{r.card}</Table.Td>
                    <Table.Td>
                      {r.number !== undefined ? `${r.number} ` : ''}
                      {r.name}
                    </Table.Td>
                    <Table.Td>{r.lap}</Table.Td>
                    <Table.Td>
                      {r.outcome === 'wrong'
                        ? r.wrong
                            .map((w) =>
                              i18next.t('testTrial.cell', {
                                section: w.section,
                                expected: w.expected,
                                read:
                                  w.read === null
                                    ? i18next.t('testTrial.stillToDecide')
                                    : i18next.t('testTrial.readAs', { value: w.read }),
                              }),
                            )
                            .join('; ')
                        : i18next.t(OUTCOME[r.outcome])}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {result.hints.length > 0 && (
          <div>
            <Text fw={700}>{i18next.t('testTrial.look')}</Text>
            <List size="sm" spacing={4}>
              {result.hints.map((h) => (
                <List.Item key={h}>{h}</List.Item>
              ))}
            </List>
          </div>
        )}
        <Button onClick={onClose} style={{ alignSelf: 'flex-end' }}>
          {i18next.t('testTrial.done')}
        </Button>
      </Stack>
    </Modal>
  );
}
