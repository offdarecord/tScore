import { Alert, Button, List, Modal, Stack, Table, Text } from '@mantine/core';
import type { TestTrialCheck } from '@tscore/core';
import { useState } from 'react';
import type { AppError } from '../../../shared/ipc';

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
        Check a test trial…
      </Button>
      {result && <CheckResult result={result} onClose={() => setResult(null)} />}
    </>
  );
}

const OUTCOME: Record<TestTrialCheck['results'][number]['outcome'], string> = {
  right: 'Right',
  wrong: 'Wrong',
  missing: 'Not in yet',
  no_rider: 'Rider not in this event',
};

function CheckResult({ result, onClose }: { result: TestTrialCheck; onClose: () => void }) {
  const all = result.right === result.cards;
  const notRight = result.results.filter((r) => r.outcome !== 'right');
  return (
    <Modal
      opened
      onClose={onClose}
      title="Test trial check"
      size="xl"
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <Stack gap="md">
        <Alert color={all ? 'green' : 'yellow'} role="status">
          <Text fw={700} fz="lg">
            Your setup read {result.right} of {result.cards} cards correctly.
          </Text>
          {all && <Text>Your laptop, camera and printer are ready for an event.</Text>}
        </Alert>
        {notRight.length > 0 && (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Card</Table.Th>
                  <Table.Th>Rider</Table.Th>
                  <Table.Th>Lap</Table.Th>
                  <Table.Th>What happened</Table.Th>
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
                            .map(
                              (w) =>
                                `Section ${w.section}: punched ${w.expected}, ${w.read === null ? 'still to decide' : `read ${w.read}`}`,
                            )
                            .join('; ')
                        : OUTCOME[r.outcome]}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {result.hints.length > 0 && (
          <div>
            <Text fw={700}>What to look at</Text>
            <List size="sm" spacing={4}>
              {result.hints.map((h) => (
                <List.Item key={h}>{h}</List.Item>
              ))}
            </List>
          </div>
        )}
        <Button onClick={onClose} style={{ alignSelf: 'flex-end' }}>
          Done
        </Button>
      </Stack>
    </Modal>
  );
}
