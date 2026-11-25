import { Button, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { LiveWindowState } from '../../../shared/ipc';

/** Results' "Show live scores": opens or closes the big-screen window. */
export function LiveScreenButton() {
  const [state, setState] = useState<LiveWindowState | null>(null);

  useEffect(() => {
    void window.tscore.liveWindowState().then(setState);
    // The big screen can also be closed with its window's ✕; keep the button in step.
    const timer = setInterval(() => void window.tscore.liveWindowState().then(setState), 2_000);
    return () => clearInterval(timer);
  }, []);

  if (!state) return null;
  return (
    <div>
      <Button
        variant="default"
        onClick={() =>
          void (state.open ? window.tscore.closeLiveScores() : window.tscore.showLiveScores()).then(
            setState,
          )
        }
      >
        {state.open ? 'Close live scores' : 'Show live scores'}
      </Button>
      {state.open && (
        <Text size="sm" c="dimmed" role="status" mt={4} maw={360}>
          {state.secondScreen
            ? 'Showing full screen on the second screen.'
            : 'No second screen found: drag the window to the TV, then press F11 for full screen.'}
        </Text>
      )}
    </div>
  );
}
