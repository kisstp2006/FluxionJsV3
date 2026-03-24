// ============================================================
// FluxionJS V2 — Electron Preload Script
// Secure bridge between renderer and main process
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fluxionAPI', {
  // File dialogs
  openFileDialog: (filters?: any) => ipcRenderer.invoke('dialog:openFile', filters),
  saveFileDialog: (filters?: any) => ipcRenderer.invoke('dialog:saveFile', filters),
  openDirDialog: () => ipcRenderer.invoke('dialog:openDir'),

  // File system
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path: string, data: string) => ipcRenderer.invoke('fs:writeFile', path, data),
  listDir: (path: string) => ipcRenderer.invoke('fs:listDir', path),
  readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
  mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
  exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
  deleteFile: (path: string) => ipcRenderer.invoke('fs:deleteFile', path),

  // App paths
  getAppDataPath: () => ipcRenderer.invoke('app:getAppDataPath'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
});
