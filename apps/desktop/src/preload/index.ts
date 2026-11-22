import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppInfo, type TscoreApi } from '../shared/ipc';

const api: TscoreApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo) as Promise<AppInfo>,
};

contextBridge.exposeInMainWorld('tscore', api);
