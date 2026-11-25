import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LiveScores } from './live/LiveScores';
import { cssVariablesResolver, theme } from './theme';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      defaultColorScheme="light"
      cssVariablesResolver={cssVariablesResolver}
    >
      {/* The big-screen window opens the same page at #live. */}
      {window.location.hash === '#live' ? <LiveScores /> : <App />}
    </MantineProvider>
  </StrictMode>,
);
