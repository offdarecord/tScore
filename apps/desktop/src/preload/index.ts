import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type TscoreApi } from '../shared/ipc';

const call =
  <A extends unknown[], R>(channel: string) =>
  (...args: A) =>
    ipcRenderer.invoke(channel, ...args) as Promise<R>;

const api: TscoreApi = {
  getAppInfo: call(IPC.appInfo),
  recentEvents: call(IPC.recentEvents),
  createEvent: call(IPC.createEvent),
  openEventFile: call(IPC.openEventFile),
  openRecentEvent: call(IPC.openRecentEvent),
  forgetEvent: call(IPC.forgetEvent),
  currentEvent: call(IPC.currentEvent),
  updateSetup: call(IPC.updateSetup),
  closeEvent: call(IPC.closeEvent),
  riders: call(IPC.riders),
  updateRider: call(IPC.updateRider),
  chooseEntryList: call(IPC.chooseEntryList),
  importRiders: call(IPC.importRiders),
};

contextBridge.exposeInMainWorld('tscore', api);
