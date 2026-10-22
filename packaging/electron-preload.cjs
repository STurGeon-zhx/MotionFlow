/* eslint-disable @typescript-eslint/no-require-imports */
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('motionFlowDesktop', {
  selectDownloadDirectory: () => ipcRenderer.invoke('motionflow:select-download-directory'),
  saveDownloadFile: (input) => ipcRenderer.invoke('motionflow:save-download-file', input),
});
