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

  // FUI Editor (separate window)
  openFuiEditor: (filePath: string) => ipcRenderer.invoke('fui:open', filePath),
  // FUI tab management (main process → FUI window)
  onFuiOpenTab: (callback: (path: string) => void) => {
    ipcRenderer.on('fui:open-tab', (_, path) => callback(path));
  },
  offFuiOpenTab: () => {
    ipcRenderer.removeAllListeners('fui:open-tab');
  },

  // Script Editor (separate window)
  openScriptEditor: (filePath: string) => ipcRenderer.invoke('script:open', filePath),
  // Script tab management (main process → Script window)
  onScriptOpenTab: (callback: (path: string) => void) => {
    ipcRenderer.on('script:open-tab', (_, path) => callback(path));
  },
  offScriptOpenTab: () => {
    ipcRenderer.removeAllListeners('script:open-tab');
  },
  // Script editor settings (main renderer → Script window relay)
  sendScriptSettings: (settings: object) => ipcRenderer.send('script:settings-update', settings),
  onScriptSettingsUpdate: (callback: (settings: object) => void) => {
    ipcRenderer.on('script:settings-update', (_, settings) => callback(settings));
  },
  offScriptSettingsUpdate: () => {
    ipcRenderer.removeAllListeners('script:settings-update');
  },
  getScriptSettings: () => ipcRenderer.invoke('script:get-settings'),

  // ── Build system ─────────────────────────────────────────────
  build: {
    /** Start a webpack build. Returns a jobId string. */
    run: (engineRoot: string, configPath: string): Promise<string> =>
      ipcRenderer.invoke('build:run', engineRoot, configPath),
    /** Cancel a running build by jobId. */
    cancel: (jobId: string): Promise<void> =>
      ipcRenderer.invoke('build:cancel', jobId),
    /** Subscribe to build streaming events (stdout/stderr/done/error). */
    onEvent: (callback: (event: { jobId: string; type: string; data: string }) => void) => {
      ipcRenderer.on('build:event', (_, event) => callback(event));
    },
    offEvent: () => {
      ipcRenderer.removeAllListeners('build:event');
    },
  },

  // ── npm commands ─────────────────────────────────────────────
  npm: {
    /** Run an npm command in projectDir (e.g. args=['install','pkg']). Returns jobId. */
    run: (projectDir: string, args: string[]): Promise<string> =>
      ipcRenderer.invoke('npm:run', projectDir, args),
    /** Cancel a running npm job. */
    cancel: (jobId: string): Promise<void> =>
      ipcRenderer.invoke('npm:cancel', jobId),
    /** Subscribe to npm streaming events. */
    onEvent: (callback: (event: { jobId: string; type: string; data: string }) => void) => {
      ipcRenderer.on('npm:event', (_, event) => callback(event));
    },
    offEvent: () => {
      ipcRenderer.removeAllListeners('npm:event');
    },
  },

  // ── App paths ─────────────────────────────────────────────────
  /** Get a named Electron app path (e.g. 'exe', 'userData'). */
  getAppPath: (name: string): Promise<string> =>
    ipcRenderer.invoke('app:getPath', name),

  /** Get the engine root directory (app.getAppPath()). */
  getEngineRoot: (): Promise<string> =>
    ipcRenderer.invoke('app:getEngineRoot'),
});
