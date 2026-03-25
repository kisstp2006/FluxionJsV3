// ============================================================
// FluxionJS V2 — Electron Preload Script
// Secure bridge between renderer and main process
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fluxionAPI', {
  // File dialogs
  openFileDialog: (filters?: any) => ipcRenderer.invoke('dialog:openFile', filters),
  openFilesDialog: (filters?: any) => ipcRenderer.invoke('dialog:openFiles', filters),
  saveFileDialog: (filters?: any) => ipcRenderer.invoke('dialog:saveFile', filters),
  openDirDialog: () => ipcRenderer.invoke('dialog:openDir'),

  // File system — Text
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path: string, data: string) => ipcRenderer.invoke('fs:writeFile', path, data),
  listDir: (path: string) => ipcRenderer.invoke('fs:listDir', path),
  readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
  mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
  exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
  deleteFile: (path: string) => ipcRenderer.invoke('fs:deleteFile', path),

  // File system — Binary (Base64)
  readBinary: (path: string) => ipcRenderer.invoke('fs:readBinary', path),
  writeBinary: (path: string, base64: string) => ipcRenderer.invoke('fs:writeBinary', path, base64),

  // File system — Queries
  stat: (path: string) => ipcRenderer.invoke('fs:stat', path),

  // File system — Mutation
  rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  copy: (srcPath: string, destPath: string) => ipcRenderer.invoke('fs:copy', srcPath, destPath),

  // File system — Hashing
  hashFile: (path: string) => ipcRenderer.invoke('fs:hashFile', path),

  // File system — Watch
  watch: (path: string) => ipcRenderer.invoke('fs:watch', path),
  unwatch: (watchId: string) => ipcRenderer.invoke('fs:unwatch', watchId),
  onWatchEvent: (callback: (event: { type: string; path: string }) => void) => {
    ipcRenderer.on('fs:watch-event', (_, event) => callback(event));
  },
  offWatchEvent: () => {
    ipcRenderer.removeAllListeners('fs:watch-event');
  },

  // App paths
  getAppDataPath: () => ipcRenderer.invoke('app:getAppDataPath'),

  // Shell
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Visual Material Editor (separate window)
  openVisualMaterialEditor: (filePath: string) => ipcRenderer.invoke('vme:open', filePath),
  notifyMaterialChanged: (filePath: string) => ipcRenderer.invoke('vme:materialChanged', filePath),
  onMaterialChangedRelay: (callback: (path: string) => void) => {
    ipcRenderer.on('vme:material-changed-relay', (_, path) => callback(path));
  },
  offMaterialChangedRelay: () => {
    ipcRenderer.removeAllListeners('vme:material-changed-relay');
  },
  // VME tab management (main process → VME window)
  onVmeOpenTab: (callback: (path: string) => void) => {
    ipcRenderer.on('vme:open-tab', (_, path) => callback(path));
  },
  offVmeOpenTab: () => {
    ipcRenderer.removeAllListeners('vme:open-tab');
  },
});
