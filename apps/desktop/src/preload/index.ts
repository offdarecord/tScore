import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type TscoreApi } from '../shared/ipc';

const call =
  <A extends unknown[], R>(channel: string) =>
  (...args: A) =>
    ipcRenderer.invoke(channel, ...args) as Promise<R>;

const api: TscoreApi = {
  getAppInfo: call(IPC.appInfo),
  listSeries: call(IPC.listSeries),
  newSeries: call(IPC.newSeries),
  seriesView: call(IPC.seriesView),
  updateSeries: call(IPC.updateSeries),
  addSeriesRoundFile: call(IPC.addSeriesRoundFile),
  deleteSeries: call(IPC.deleteSeries),
  exportSeries: call(IPC.exportSeries),
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
  addLateEntry: call(IPC.addLateEntry),
  chooseEntryList: call(IPC.chooseEntryList),
  importRiders: call(IPC.importRiders),
  cardDesk: call(IPC.cardDesk),
  saveCard: call(IPC.saveCard),
  addPenalty: call(IPC.addPenalty),
  removePenalty: call(IPC.removePenalty),
  results: call(IPC.results),
  exportResults: call(IPC.exportResults),
  openExport: call(IPC.openExport),
  backupStatus: call(IPC.backupStatus),
  backupNow: call(IPC.backupNow),
  chooseBackupPlace: call(IPC.chooseBackupPlace),
  clearBackupPlace: call(IPC.clearBackupPlace),
  restoreFromBackup: call(IPC.restoreFromBackup),
  preEventCheck: call(IPC.preEventCheck),
  markFinal: call(IPC.markFinal),
  reopenResults: call(IPC.reopenResults),
  labels: call(IPC.labels),
  saveLabels: call(IPC.saveLabels),
  saveLabelTestPage: call(IPC.saveLabelTestPage),
  setLabelOffset: call(IPC.setLabelOffset),
  course: call(IPC.course),
};

contextBridge.exposeInMainWorld('tscore', api);
