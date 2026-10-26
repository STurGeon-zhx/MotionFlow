/* eslint-disable @typescript-eslint/no-require-imports */
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('motionFlowDesktop', {
  getUpdateConfig: () => ipcRenderer.invoke('motionflow:get-update-config'),
  setUpdateRepository: repository => ipcRenderer.invoke('motionflow:set-update-repository', repository),
  checkForUpdates: () => ipcRenderer.invoke('motionflow:check-for-updates'),
  applyUpdate: confirmed => ipcRenderer.invoke('motionflow:apply-update', confirmed),
  downloadUpdate: () => ipcRenderer.invoke('motionflow:download-update'),
  onUpdateDownloadProgress: handler => {
    const listener = (_event, progress) => handler(progress);
    ipcRenderer.on('motionflow:update-download-progress', listener);
    return () => ipcRenderer.removeListener('motionflow:update-download-progress', listener);
  },
  selectDownloadDirectory: () => ipcRenderer.invoke('motionflow:select-download-directory'),
  saveDownloadFile: (input) => ipcRenderer.invoke('motionflow:save-download-file', input),
});
