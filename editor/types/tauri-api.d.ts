// ============================================================
// FluxionJS V3 — Tauri API Type Definitions
// ============================================================

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  modifiedAt: number;
}

export interface BuildEvent {
  jobId: string;
  type: string;
  data: string;
}

export interface NpmEvent {
  jobId: string;
  type: string;
  data: string;
}

declare global {
  interface Window {
    // Tauri 2.0 API - available when withGlobalTauri: true is set in tauri.conf.json
    __TAURI__: {
      core: {
        invoke: <T>(command: string, args?: any) => Promise<T>;
      };
      event: {
        listen: (event: string, callback: (event: any) => void) => Promise<() => void>;
        emit: (event: string, payload?: any) => Promise<void>;
      };
    };
  }
}

// Exported API for the editor
export const TauriAPI = {
  // File dialogs
  openFileDialog: (filters?: string[]) => 
    window.__TAURI__.core.invoke<string | null>('show_open_dialog', { filters }),
  openFilesDialog: (filters?: string[]) => 
    window.__TAURI__.core.invoke<string[]>('show_open_files_dialog', { filters }),
  saveFileDialog: (filters?: string[]) => 
    window.__TAURI__.core.invoke<string | null>('show_save_dialog', { filters }),
  openDirDialog: () => 
    window.__TAURI__.core.invoke<string | null>('show_open_dir_dialog'),

  // File system — Text
  readFile: (path: string) => 
    window.__TAURI__.core.invoke<string>('read_file', { path }),
  writeFile: (path: string, data: string) => 
    window.__TAURI__.core.invoke<void>('write_file', { path, data }),
  listDir: (path: string) => 
    window.__TAURI__.core.invoke<DirEntry[]>('list_dir', { path }),
  readDir: (path: string) => 
    window.__TAURI__.core.invoke<DirEntry[]>('read_dir', { path }),
  mkdir: (path: string) => 
    window.__TAURI__.core.invoke<void>('mkdir', { path }),
  exists: (path: string) => 
    window.__TAURI__.core.invoke<boolean>('exists', { path }),
  deleteFile: (path: string) => 
    window.__TAURI__.core.invoke<void>('delete_file', { path }),

  // File system — Binary (Base64)
  readBinary: (path: string) => 
    window.__TAURI__.core.invoke<string>('read_binary', { path }),
  writeBinary: (path: string, base64Data: string) => 
    window.__TAURI__.core.invoke<void>('write_binary', { path, base64Data }),

  // File system — Queries
  stat: (path: string) => 
    window.__TAURI__.core.invoke<FileStat>('stat', { path }),

  // File system — Mutation
  rename: (oldPath: string, newPath: string) => 
    window.__TAURI__.core.invoke<void>('rename', { oldPath, newPath }),
  copy: (srcPath: string, destPath: string) => 
    window.__TAURI__.core.invoke<void>('copy', { srcPath, destPath }),

  // File system — Hashing
  hashFile: (path: string) => 
    window.__TAURI__.core.invoke<string>('hash_file', { path }),

  // File system — Watch
  watch: (path: string, recursive?: boolean) => 
    window.__TAURI__.core.invoke<string>('watch_directory', { path, recursive }),
  unwatch: (watcherId: string) => 
    window.__TAURI__.core.invoke<void>('unwatch_directory', { watcherId }),
  onWatchEvent: (callback: (event: { watcherId: string; type: string; path: string; timestamp: number }) => void) =>
    window.__TAURI__.event.listen('file-changed', (e: any) => callback(JSON.parse(e.payload))),
  offWatchEvent: () => window.__TAURI__.core.invoke<void>('unwatch_all'),

  // App paths
  getAppDataPath: () => 
    window.__TAURI__.core.invoke<string>('get_app_data_path'),

  // Shell
  showItemInFolder: (path: string) => 
    window.__TAURI__.core.invoke<void>('show_item_in_folder', { path }),
  openPath: (path: string) => 
    window.__TAURI__.core.invoke<void>('open_path', { path }),

  // Window controls
  minimize: () => 
    window.__TAURI__.core.invoke<void>('minimize_window'),
  maximize: () => 
    window.__TAURI__.core.invoke<void>('maximize_window'),
  close: () => 
    window.__TAURI__.core.invoke<void>('close_window'),

  // Visual Material Editor (now in-app)
  openVisualMaterialEditor: (filePath: string) => {
    // Emit custom event to open VME in-app
    window.dispatchEvent(new CustomEvent('fluxion:open-visual-material-editor', { detail: { path: filePath } }));
  },
  notifyMaterialChanged: (filePath: string) => {
    // Emit custom event for material changes
    window.dispatchEvent(new CustomEvent('fluxion:material-changed', { detail: { path: filePath } }));
  },
  onMaterialChangedRelay: (callback: (path: string) => void) => {
    const handler = (e: CustomEvent) => callback(e.detail.path);
    window.addEventListener('fluxion:material-changed-relay', handler as EventListener);
    return () => window.removeEventListener('fluxion:material-changed-relay', handler as EventListener);
  },
  offMaterialChangedRelay: () => {
    window.removeEventListener('fluxion:material-changed-relay', () => {});
  },

  // FUI Editor (now in-app)
  openFuiEditor: (filePath: string) => {
    window.dispatchEvent(new CustomEvent('fluxion:open-fui-editor', { detail: { path: filePath } }));
  },

  // Script Editor (now in-app)
  openScriptEditor: (filePath: string) => {
    window.dispatchEvent(new CustomEvent('fluxion:open-script-editor', { detail: { path: filePath } }));
  },

  // ── Build system ─────────────────────────────────────────────
  build: {
    /** Start a webpack build. Returns a jobId string. */
    run: (engineRoot: string, configPath: string): Promise<string> =>
      window.__TAURI__.core.invoke<string>('run_build', { engineRoot, configPath }),
    /** Cancel a running build by jobId. */
    cancel: (jobId: string): Promise<void> =>
      window.__TAURI__.core.invoke<void>('cancel_build', { jobId }),
    /** Subscribe to build streaming events (stdout/stderr/done/error). */
    onEvent: (callback: (event: BuildEvent) => void) => {
      // TODO: implement with Tauri events
      return () => {};
    },
    offEvent: () => {
      // TODO: implement with Tauri events
    },
  },

  // ── npm commands ─────────────────────────────────────────────
  npm: {
    /** Run an npm command in projectDir (e.g. args=['install','pkg']). Returns jobId. */
    run: (projectDir: string, args: string[]): Promise<string> =>
      window.__TAURI__.core.invoke<string>('run_npm', { projectDir, args }),
    /** Cancel a running npm job. */
    cancel: (jobId: string): Promise<void> =>
      window.__TAURI__.core.invoke<void>('cancel_npm', { jobId }),
    /** Subscribe to npm streaming events. */
    onEvent: (callback: (event: NpmEvent) => void) => {
      // TODO: implement with Tauri events
      return () => {};
    },
    offEvent: () => {
      // TODO: implement with Tauri events
    },
  },

  // ── App paths ─────────────────────────────────────────────────
  /** Get a named app path (e.g. 'exe', 'userData'). */
  getAppPath: (name: string): Promise<string> =>
    window.__TAURI__.core.invoke<string>('get_app_path', { name }),

  /** Get the engine root directory. */
  getEngineRoot: (): Promise<string> =>
    window.__TAURI__.core.invoke<string>('get_engine_root_cmd'),

  // ── Panel detach (now always in-app) ────────────────────────
  /** Open a registered panel in a floating window (in-app). */
  detachPanel: (panelId: string) => {
    // This will be handled by the PanelLayoutContext
    window.dispatchEvent(new CustomEvent('fluxion:detach-panel', { detail: { panelId } }));
  },
  /** Close a floating panel window and reattach the panel. */
  closePanelWindow: (panelId: string) => {
    window.dispatchEvent(new CustomEvent('fluxion:close-panel-window', { detail: { panelId } }));
  },
  /** Send EditorState snapshot to a specific panel window. */
  sendPanelState: (panelId: string, state: unknown) => {
    window.dispatchEvent(new CustomEvent('fluxion:panel-state', { detail: { panelId, state } }));
  },
  /** Listen for EditorState snapshots (called in panel windows). */
  onPanelState: (callback: (state: unknown) => void) => {
    const handler = (e: CustomEvent) => callback(e.detail.state);
    window.addEventListener('fluxion:panel-state', handler as EventListener);
    return () => window.removeEventListener('fluxion:panel-state', handler as EventListener);
  },
  offPanelState: () => {
    window.removeEventListener('fluxion:panel-state', () => {});
  },
  /** Dispatch an EditorAction from a panel window back to the main window. */
  dispatchEditorAction: (action: unknown) => {
    window.dispatchEvent(new CustomEvent('fluxion:panel-action', { detail: { action } }));
  },
  /** Listen for EditorActions forwarded from panel windows (called in main window). */
  onPanelAction: (callback: (panelId: string, action: unknown) => void) => {
    const handler = (e: CustomEvent) => callback(e.detail.panelId, e.detail.action);
    window.addEventListener('fluxion:panel-action-relay', handler as EventListener);
    return () => window.removeEventListener('fluxion:panel-action-relay', handler as EventListener);
  },
  offPanelAction: () => {
    window.removeEventListener('fluxion:panel-action-relay', () => {});
  },
  /** Panel window: resolve which panelId this window was opened for. */
  getPanelWindowId: (): Promise<string> => {
    // This will be handled by in-app panel management
    return Promise.resolve('');
  },
  /** Main window: called when a detached panel OS window is closed by the user. */
  onPanelWindowClosed: (callback: (panelId: string) => void) => {
    const handler = (e: CustomEvent) => callback(e.detail.panelId);
    window.addEventListener('fluxion:panel-window-closed', handler as EventListener);
    return () => window.removeEventListener('fluxion:panel-window-closed', handler as EventListener);
  },
  offPanelWindowClosed: () => {
    window.removeEventListener('fluxion:panel-window-closed', () => {});
  },
};

// Global fluxionAPI for backward compatibility
declare const window: Window & {
  fluxionAPI: typeof TauriAPI;
};

export {};
