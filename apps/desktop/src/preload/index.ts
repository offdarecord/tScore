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
  addLateEntry: call(IPC.addLateEntry),
  chooseEntryList: call(IPC.chooseEntryList),
  importRiders: call(IPC.importRiders),
  cardDesk: call(IPC.cardDesk),
  saveCard: call(IPC.saveCard),
  saveScan: call(IPC.saveScan),
  reviewQueue: call(IPC.reviewQueue),
  cardImage: call(IPC.cardImage),
  decideScores: call(IPC.decideScores),
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
  saveForMove: call(IPC.saveForMove),
  preEventCheck: call(IPC.preEventCheck),
  markFinal: call(IPC.markFinal),
  reopenResults: call(IPC.reopenResults),
  liveScores: call(IPC.liveScores),
  logos: call(IPC.logos),
  chooseLogo: call(IPC.chooseLogo),
  removeLogo: call(IPC.removeLogo),
  showLiveScores: call(IPC.showLiveScores),
  closeLiveScores: call(IPC.closeLiveScores),
  liveWindowState: call(IPC.liveWindowState),
  toggleLiveFullScreen: call(IPC.toggleLiveFullScreen),
  labels: call(IPC.labels),
  saveLabels: call(IPC.saveLabels),
  saveLabelTestPage: call(IPC.saveLabelTestPage),
  setLabelOffset: call(IPC.setLabelOffset),
  course: call(IPC.course),
};

contextBridge.exposeInMainWorld('tscore', api);
