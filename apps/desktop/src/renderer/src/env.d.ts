import type { TscoreApi } from '../../shared/ipc';

declare global {
  interface Window {
    readonly tscore: TscoreApi;
  }
}

export {};
