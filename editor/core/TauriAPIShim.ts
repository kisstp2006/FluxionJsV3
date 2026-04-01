// ============================================================
// FluxionJS V3 — Tauri API Shim
// Provides backward compatibility for Electron API calls
// ============================================================

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__;

class APIShim {
  private isTauri: boolean;
  private get tauriAPI(): any { return (window as any).fluxionAPI ?? {}; }

  constructor() {
    this.isTauri = isTauri;
  }

  // ── File Dialogs ───────────────────────────────────────────────────────

  async openFileDialog(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> {
    if (this.isTauri) {
      try {
        const requestId = await window.__TAURI__.core.invoke('show_open_dialog', { filters });
        
        return new Promise(async (resolve) => {
          let unlisten: (() => void) | null = null;
          unlisten = await window.__TAURI__.event.listen('dialog-result', (event: any) => {
            const result = JSON.parse(event.payload);
            if (result.requestId === requestId) {
              unlisten?.();
              resolve(result.result ?? null);
            }
          });
        });
      } catch (error) {
        console.error('Tauri open dialog error:', error);
        return null;
      }
    } else {
      return this.tauriAPI.openFileDialog?.(filters as any) ?? null;
    }
  }

  async openFilesDialog(filters?: Array<{ name: string; extensions: string[] }>): Promise<string[]> {
    if (this.isTauri) {
      try {
        const requestId = await window.__TAURI__.core.invoke('show_open_files_dialog', { filters });
        
        return new Promise(async (resolve) => {
          let unlisten: (() => void) | null = null;
          unlisten = await window.__TAURI__.event.listen('dialog-result', (event: any) => {
            const result = JSON.parse(event.payload);
            if (result.requestId === requestId) {
              unlisten?.();
              resolve(result.results ?? []);
            }
          });
        });
      } catch (error) {
        console.error('Tauri open files dialog error:', error);
        return [];
      }
    } else {
      return this.tauriAPI.openFilesDialog?.(filters) ?? [];
    }
  }

  async saveFileDialog(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> {
    if (this.isTauri) {
      try {
        const requestId = await window.__TAURI__.core.invoke('show_save_dialog', { filters });
        
        return new Promise(async (resolve) => {
          let unlisten: (() => void) | null = null;
          unlisten = await window.__TAURI__.event.listen('dialog-result', (event: any) => {
            const result = JSON.parse(event.payload);
            if (result.requestId === requestId) {
              unlisten?.();
              resolve(result.result ?? null);
            }
          });
        });
      } catch (error) {
        console.error('Tauri save dialog error:', error);
        return null;
      }
    } else {
      return this.tauriAPI.saveFileDialog?.(filters) ?? null;
    }
  }

  async openDirDialog(): Promise<string | null> {
    if (this.isTauri) {
      try {
        const requestId = await window.__TAURI__.core.invoke('show_open_dir_dialog');
        
        return new Promise(async (resolve) => {
          let unlisten: (() => void) | null = null;
          unlisten = await window.__TAURI__.event.listen('dialog-result', (event: any) => {
            const result = JSON.parse(event.payload);
            if (result.requestId === requestId) {
              unlisten?.();
              resolve(result.result ?? null);
            }
          });
        });
      } catch (error) {
        console.error('Tauri open dir dialog error:', error);
        return null;
      }
    } else {
      return this.tauriAPI.openDirDialog?.() ?? null;
    }
  }

  // ── File System Operations ───────────────────────────────────────────────

  async readFile(path: string): Promise<string> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('read_file', { path });
      } catch (error) {
        console.error('Tauri read file error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.readFile?.(path) || '';
    }
  }

  async writeFile(path: string, data: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('write_file', { path, data });
      } catch (error) {
        console.error('Tauri write file error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.writeFile?.(path, data);
    }
  }

  async readBinary(path: string): Promise<string> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('read_binary', { path });
      } catch (error) {
        console.error('Tauri read binary error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.readBinary?.(path) || '';
    }
  }

  async writeBinary(path: string, base64Data: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('write_binary', { path, base64Data });
      } catch (error) {
        console.error('Tauri write binary error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.writeBinary?.(path, base64Data);
    }
  }

  async listDir(path: string): Promise<any[]> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('list_dir', { path });
      } catch (error) {
        console.error('Tauri list dir error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.listDir?.(path) || [];
    }
  }

  async exists(path: string): Promise<boolean> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('exists', { path });
      } catch (error) {
        console.error('Tauri exists error:', error);
        return false;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.exists?.(path) || false;
    }
  }

  async mkdir(path: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('mkdir', { path });
      } catch (error) {
        console.error('Tauri mkdir error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.mkdir?.(path);
    }
  }

  async deleteFile(path: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('delete_file', { path });
      } catch (error) {
        console.error('Tauri delete file error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.deleteFile?.(path);
    }
  }

  // ── App Paths ───────────────────────────────────────────────────────────

  async getAppDataPath(): Promise<string> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('get_app_data_path');
      } catch (error) {
        console.error('Tauri get app data path error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.getAppDataPath?.() || '';
    }
  }

  async getAppConfigPath(): Promise<string> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('get_app_config_path');
      } catch (error) {
        console.error('Tauri get app config path error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.getAppConfigPath?.() || '';
    }
  }

  async getHomePath(): Promise<string> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('get_home_path');
      } catch (error) {
        console.error('Tauri get home path error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.getHomePath?.() || '';
    }
  }

  // ── Build System ───────────────────────────────────────────────────────

  async runBuild(engineRoot: string, configPath: string): Promise<string> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('run_build', { engineRoot, configPath });
      } catch (error) {
        console.error('Tauri run build error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.runBuild?.(engineRoot, configPath) || '';
    }
  }

  async cancelBuild(jobId: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('cancel_build', { jobId });
      } catch (error) {
        console.error('Tauri cancel build error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.cancelBuild?.(jobId);
    }
  }

  // ── File Watching ───────────────────────────────────────────────────────

  async watchDirectory(path: string, recursive?: boolean): Promise<string> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('watch_directory', { path, recursive });
      } catch (error) {
        console.error('Tauri watch directory error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.watchDirectory?.(path, recursive) || '';
    }
  }

  async unwatchDirectory(watcherId: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('unwatch_directory', { watcherId });
      } catch (error) {
        console.error('Tauri unwatch directory error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.unwatchDirectory?.(watcherId);
    }
  }

  // ── Event Listeners ─────────────────────────────────────────────────────

  onBuildOutput(callback: (event: any) => void): Promise<() => void> {
    if (this.isTauri) {
      return window.__TAURI__.event.listen('build-output', callback);
    }
    return Promise.resolve(this.tauriAPI.onBuildOutput?.(callback) ?? (() => {}));
  }

  onNpmOutput(callback: (event: any) => void): Promise<() => void> {
    if (this.isTauri) {
      return window.__TAURI__.event.listen('npm-output', callback);
    }
    return Promise.resolve(this.tauriAPI.onNpmOutput?.(callback) ?? (() => {}));
  }

  onFileChanged(callback: (event: any) => void): Promise<() => void> {
    if (this.isTauri) {
      return window.__TAURI__.event.listen('file-changed', callback);
    }
    return Promise.resolve(this.tauriAPI.onFileChanged?.(callback) ?? (() => {}));
  }

  // ── Shell Operations ───────────────────────────────────────────────────

  async showItemInFolder(path: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('show_item_in_folder', { path });
      } catch (error) {
        console.error('Tauri show item in folder error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.showItemInFolder?.(path);
    }
  }

  async openPath(path: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('open_path', { path });
      } catch (error) {
        console.error('Tauri open path error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.openPath?.(path);
    }
  }

  // ── Window Controls ───────────────────────────────────────────────────

  async minimizeWindow(): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('minimize_window');
      } catch (error) {
        console.error('Tauri minimize window error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.minimizeWindow?.();
    }
  }

  async maximizeWindow(): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('maximize_window');
      } catch (error) {
        console.error('Tauri maximize window error:', error);
        throw error;
      }
    } else {
      // Electron fallback
      return this.tauriAPI.maximizeWindow?.();
    }
  }

  async closeWindow(): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('close_window');
      } catch (error) {
        console.error('Tauri close window error:', error);
        throw error;
      }
    } else {
      return this.tauriAPI.closeWindow?.();
    }
  }

  // ── File system aliases for ElectronFileSystem compatibility ────────────
  async readDir(path: string): Promise<any[]> {
    return this.listDir(path);
  }

  async stat(path: string): Promise<any> {
    if (this.isTauri) {
      try {
        return await window.__TAURI__.core.invoke('stat', { path });
      } catch (error) {
        console.error('Tauri stat error:', error);
        throw error;
      }
    } else {
      return this.tauriAPI.stat?.(path);
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('rename', { oldPath, newPath });
      } catch (error) {
        console.error('Tauri rename error:', error);
        throw error;
      }
    } else {
      return this.tauriAPI.rename?.(oldPath, newPath);
    }
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    if (this.isTauri) {
      try {
        await window.__TAURI__.core.invoke('copy', { srcPath, destPath });
      } catch (error) {
        console.error('Tauri copy error:', error);
        throw error;
      }
    } else {
      return this.tauriAPI.copy?.(srcPath, destPath);
    }
  }

  watch(path: string): Promise<string> { return this.watchDirectory(path); }
  unwatch(watchId: string): Promise<void> { return this.unwatchDirectory(watchId); }

  onWatchEvent(callback: (event: { type: string; path: string }) => void): void {
    this.onFileChanged((event: any) => {
      try {
        const data = typeof event.payload === 'string' ? JSON.parse(event.payload) : (event.payload ?? {});
        callback({ type: data.type ?? 'change', path: data.path ?? '' });
      } catch { /* ignore parse errors */ }
    });
  }

  offWatchEvent(): void { /* no-op in Tauri – listeners cleaned up via their own unlisten() */ }

  // ── Binary file write (ArrayBuffer → base64 → write_binary) ─────────────
  async writeFileBinary(path: string, buffer: ArrayBuffer | Uint8Array): Promise<void> {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return this.writeBinary(path, btoa(binary));
  }

  // ── Multi-window launchers (Tauri: create real OS windows) ─────────────
  openScriptEditor(path: string): void {
    const url = path ? `script-window.html?filePath=${encodeURIComponent(path)}` : 'script-window.html';
    if (this.isTauri) {
      window.__TAURI__.core.invoke('open_child_window', {
        label: 'script-editor', url, title: 'Script Editor', width: 1200, height: 800,
      }).catch((e: any) => console.error('open_child_window error:', e));
    } else {
      window.dispatchEvent(new CustomEvent('fluxion:open-script-editor', { detail: { path } }));
    }
  }

  openVisualMaterialEditor(path: string): void {
    const url = path ? `vme-window.html?filePath=${encodeURIComponent(path)}` : 'vme-window.html';
    if (this.isTauri) {
      window.__TAURI__.core.invoke('open_child_window', {
        label: 'vme-editor', url, title: 'Visual Material Editor', width: 1400, height: 900,
      }).catch((e: any) => console.error('open_child_window error:', e));
    } else {
      window.dispatchEvent(new CustomEvent('fluxion:open-visual-material-editor', { detail: { path } }));
    }
  }

  openFuiEditor(path: string): void {
    const url = path ? `fui-window.html?filePath=${encodeURIComponent(path)}` : 'fui-window.html';
    if (this.isTauri) {
      window.__TAURI__.core.invoke('open_child_window', {
        label: 'fui-editor', url, title: 'FUI Editor', width: 1200, height: 800,
      }).catch((e: any) => console.error('open_child_window error:', e));
    } else {
      window.dispatchEvent(new CustomEvent('fluxion:open-fui-editor', { detail: { path } }));
    }
  }

  notifyMaterialChanged(filePath: string): void {
    window.dispatchEvent(new CustomEvent('fluxion:material-changed', { detail: { path: filePath } }));
  }

  detachPanel(panelId: string): void {
    if (this.isTauri) {
      window.__TAURI__.core.invoke('open_child_window', {
        label: `panel-${panelId}`,
        url: `panel-window.html?panelId=${encodeURIComponent(panelId)}`,
        title: panelId,
        width: 700, height: 500,
      }).catch((e: any) => console.error('open_child_window error:', e));
    } else {
      window.dispatchEvent(new CustomEvent('fluxion:detach-panel', { detail: { panelId } }));
    }
  }

  closePanelWindow(panelId: string): void {
    if (this.isTauri) {
      window.__TAURI__.core.invoke('close_child_window', { label: `panel-${panelId}` })
        .catch((e: any) => console.error('close_child_window error:', e));
    } else {
      window.dispatchEvent(new CustomEvent('fluxion:close-panel-window', { detail: { panelId } }));
    }
  }

  // ── Panel IPC (cross-window state relay via DOM events) ──────────────────
  private _panelStateHandler: ((e: Event) => void) | null = null;

  onPanelState(callback: (state: unknown) => void): void {
    this._panelStateHandler = (e: Event) => callback((e as CustomEvent).detail.state);
    window.addEventListener('fluxion:panel-state', this._panelStateHandler);
  }

  offPanelState(): void {
    if (this._panelStateHandler) {
      window.removeEventListener('fluxion:panel-state', this._panelStateHandler);
      this._panelStateHandler = null;
    }
  }

  dispatchEditorAction(action: unknown): void {
    window.dispatchEvent(new CustomEvent('fluxion:panel-action', { detail: { action } }));
  }

  // ── Script settings IPC (DOM events, single-window in Tauri) ─────────────
  sendScriptSettings(settings: unknown): void {
    window.dispatchEvent(new CustomEvent('fluxion:script-settings', { detail: { settings } }));
    try { localStorage.setItem('fluxion:script-settings', JSON.stringify(settings)); } catch { /* ignore */ }
  }

  async getScriptSettings(): Promise<unknown | null> {
    try {
      const raw = localStorage.getItem('fluxion:script-settings');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private _scriptSettingsHandler: ((e: Event) => void) | null = null;
  onScriptSettingsUpdate(callback: (s: unknown) => void): void {
    this._scriptSettingsHandler = (e: Event) => callback((e as CustomEvent).detail.settings);
    window.addEventListener('fluxion:script-settings', this._scriptSettingsHandler);
  }
  offScriptSettingsUpdate(): void {
    if (this._scriptSettingsHandler) {
      window.removeEventListener('fluxion:script-settings', this._scriptSettingsHandler);
      this._scriptSettingsHandler = null;
    }
  }

  private _scriptOpenTabHandler: ((e: Event) => void) | null = null;
  onScriptOpenTab(callback: (path: string) => void): void {
    this._scriptOpenTabHandler = (e: Event) => callback((e as CustomEvent).detail.path);
    window.addEventListener('fluxion:open-script-tab', this._scriptOpenTabHandler);
  }
  offScriptOpenTab(): void {
    if (this._scriptOpenTabHandler) {
      window.removeEventListener('fluxion:open-script-tab', this._scriptOpenTabHandler);
      this._scriptOpenTabHandler = null;
    }
  }

  // ── VME / FUI tab IPC (DOM events) ───────────────────────────────────────
  private _vmeOpenTabHandler: ((e: Event) => void) | null = null;
  onVmeOpenTab(handler: (event: unknown, filePath: string) => void): void {
    this._vmeOpenTabHandler = (e: Event) => handler(e, (e as CustomEvent).detail.path);
    window.addEventListener('fluxion:open-vme-tab', this._vmeOpenTabHandler);
  }
  offVmeOpenTab(): void {
    if (this._vmeOpenTabHandler) {
      window.removeEventListener('fluxion:open-vme-tab', this._vmeOpenTabHandler);
      this._vmeOpenTabHandler = null;
    }
  }

  private _fuiOpenTabHandler: ((e: Event) => void) | null = null;
  onFuiOpenTab(handler: (event: unknown, filePath: string) => void): void {
    this._fuiOpenTabHandler = (e: Event) => handler(e, (e as CustomEvent).detail.path);
    window.addEventListener('fluxion:open-fui-tab', this._fuiOpenTabHandler);
  }
  offFuiOpenTab(): void {
    if (this._fuiOpenTabHandler) {
      window.removeEventListener('fluxion:open-fui-tab', this._fuiOpenTabHandler);
      this._fuiOpenTabHandler = null;
    }
  }

  // ── FluxionAPI interface aliases (used by Titlebar and other UI) ──────────
  minimize()  { return this.minimizeWindow(); }
  maximize()  { return this.maximizeWindow(); }
  close()     { return this.closeWindow(); }
}

// Export singleton instance
export const API = new APIShim();

// Assign to window.fluxionAPI so all editor code using window.fluxionAPI works in Tauri mode
if (typeof window !== 'undefined') {
  (window as any).fluxionAPI = API;

  // In Tauri, OS-level file drops are intercepted by Tauri before the browser DragEvent fires.
  // Bridge tauri://file-drop → fluxion:file-drop so React components can receive dropped paths.
  if (isTauri) {
    window.__TAURI__.event.listen('tauri://file-drop', (event: any) => {
      const paths: string[] = event.payload?.paths ?? [];
      if (paths.length > 0) {
        window.dispatchEvent(new CustomEvent('fluxion:file-drop', { detail: { paths } }));
      }
    });
  }
}
