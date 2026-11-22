/**
 * The typed bridge between the renderer and the main process.
 *
 * Every channel is listed here; the preload exposes only these, and the main process
 * validates the sender of every message. Add a channel here first, then implement it.
 */
export const IPC = {
  appInfo: 'app:info',
} as const;

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly electron: string;
  readonly platform: string;
  readonly arch: string;
}

export interface TscoreApi {
  getAppInfo(): Promise<AppInfo>;
}
