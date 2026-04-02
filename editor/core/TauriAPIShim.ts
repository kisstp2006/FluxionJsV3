// ============================================================
// FluxionJS V3 — Tauri API Shim
// Bridges frontend editor code to the Tauri Rust backend.
// ============================================================

class APIShim {

  // ── File Dialogs ───────────────────────────────────────────────────────

  async openFileDialog(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> {
    try {
      const requestId = await window.__TAURI__.core.invoke('show_open_dialog', { filters });
      return new Promise(async (resolve) => {
        let unlisten: (() => void) | null = null;
        unlisten = await window.__TAURI__.event.listen('dialog-result', (event: any) => {
          const result = JSON.parse(event.payload);
          if (result.requestId === requestId) { unlisten?.(); resolve(result.result ?? null); }
        });
      });
    } catch (error) {
      console.error('Tauri open dialog error:', error);
      return null;
    }
  }

  async openFilesDialog(filters?: Array<{ name: string; extensions: string[] }>): Promise<string[]> {
    try {
      const requestId = await window.__TAURI__.core.invoke('show_open_files_dialog', { filters });
      return new Promise(async (resolve) => {
        let unlisten: (() => void) | null = null;
        unlisten = await window.__TAURI__.event.listen('dialog-result', (event: any) => {
          const result = JSON.parse(event.payload);
          if (result.requestId === requestId) { unlisten?.(); resolve(result.results ?? []); }
        });
      });
    } catch (error) {
      console.error('Tauri open files dialog error:', error);
      return [];
    }
  }

  async saveFileDialog(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> {
    try {
      const requestId = await window.__TAURI__.core.invoke('show_save_dialog', { filters });
      return new Promise(async (resolve) => {
        let unlisten: (() => void) | null = null;
        unlisten = await window.__TAURI__.event.listen('dialog-result', (event: any) => {
          const result = JSON.parse(event.payload);
          if (result.requestId === requestId) { unlisten?.(); resolve(result.result ?? null); }
        });
      });
    } catch (error) {
      console.error('Tauri save dialog error:', error);
      return null;
    }
  }

  async openDirDialog(): Promise<string | null> {
    try {
      const requestId = await window.__TAURI__.core.invoke('show_open_dir_dialog');
      return new Promise(async (resolve) => {
        let unlisten: (() => void) | null = null;
        unlisten = await window.__TAURI__.event.listen('dialog-result', (event: any) => {
          const result = JSON.parse(event.payload);
          if (result.requestId === requestId) { unlisten?.(); resolve(result.result ?? null); }
        });
      });
    } catch (error) {
      console.error('Tauri open dir dialog error:', error);
      return null;
    }
  }

  // ── File System Operations ───────────────────────────────────────────────

  async readFile(path: string): Promise<string> {
    return window.__TAURI__.core.invoke('read_file', { path });
  }

  async writeFile(path: string, data: string): Promise<void> {
    return window.__TAURI__.core.invoke('write_file', { path, data });
  }

  async appendFile(path: string, data: string): Promise<void> {
    return window.__TAURI__.core.invoke('append_file', { path, data });
  }

  async writeFileAtomic(path: string, data: string): Promise<void> {
    return window.__TAURI__.core.invoke('write_file_atomic', { path, data });
  }

  async readBinary(path: string): Promise<string> {
    return window.__TAURI__.core.invoke('read_binary', { path });
  }

  async writeBinary(path: string, base64Data: string): Promise<void> {
    return window.__TAURI__.core.invoke('write_binary', { path, base64Data });
  }

  async writeBinaryAtomic(path: string, base64Data: string): Promise<void> {
    return window.__TAURI__.core.invoke('write_binary_atomic', { path, base64Data });
  }

  async listDir(path: string): Promise<any[]> {
    return window.__TAURI__.core.invoke('list_dir', { path });
  }

  async walkDir(
    path: string,
    opts?: { recursive?: boolean; includeHidden?: boolean; maxDepth?: number; filterExts?: string[] },
  ): Promise<any[]> {
    return window.__TAURI__.core.invoke('walk_dir_cmd', {
      path,
      recursive:     opts?.recursive,
      includeHidden: opts?.includeHidden,
      maxDepth:      opts?.maxDepth,
      filterExts:    opts?.filterExts,
    });
  }

  async exists(path: string): Promise<boolean> {
    try {
      return await window.__TAURI__.core.invoke('exists', { path });
    } catch {
      return false;
    }
  }

  async isFile(path: string): Promise<boolean> {
    try { return await window.__TAURI__.core.invoke('is_file', { path }); } catch { return false; }
  }

  async isDir(path: string): Promise<boolean> {
    try { return await window.__TAURI__.core.invoke('is_directory', { path }); } catch { return false; }
  }

  async fileSize(path: string): Promise<number> {
    try { return await window.__TAURI__.core.invoke('get_file_size', { path }); } catch { return 0; }
  }

  async getTempDir(): Promise<string> {
    return window.__TAURI__.core.invoke('get_temp_dir');
  }

  async mkdir(path: string): Promise<void> {
    return window.__TAURI__.core.invoke('mkdir', { path });
  }

  async deleteFile(path: string): Promise<void> {
    return window.__TAURI__.core.invoke('delete_file', { path });
  }

  // ── App Paths ───────────────────────────────────────────────────────────

  async getAppDataPath(): Promise<string> {
    return window.__TAURI__.core.invoke('get_app_data_path');
  }

  async getAppConfigPath(): Promise<string> {
    return window.__TAURI__.core.invoke('get_app_config_path');
  }

  async getHomePath(): Promise<string> {
    return window.__TAURI__.core.invoke('get_home_path');
  }

  // ── Build System ───────────────────────────────────────────────────────

  async getEngineRoot(): Promise<string> {
    return window.__TAURI__.core.invoke('get_engine_root_cmd');
  }

  async runBuild(engineRoot: string, configPath: string): Promise<string> {
    return window.__TAURI__.core.invoke('run_build', { engineRoot, configPath });
  }

  async cancelBuild(jobId: string): Promise<void> {
    return window.__TAURI__.core.invoke('cancel_build', { jobId });
  }

  async runNpm(projectDir: string, args: string[]): Promise<string> {
    return window.__TAURI__.core.invoke('run_npm', { projectDir, args });
  }

  async cancelNpm(jobId: string): Promise<void> {
    return window.__TAURI__.core.invoke('cancel_npm', { jobId });
  }

  // ── build / npm namespace objects (for api.build.run / api.npm.run) ──────
  private _buildEventUnlisten: (() => void) | null = null;
  private _npmEventUnlisten: (() => void) | null = null;

  private _parseBuildPayload(event: any): any {
    try {
      const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : (event.payload ?? {});
      return { jobId: p.job_id ?? p.jobId, type: p.event_type ?? p.type, data: p.data ?? '' };
    } catch { return event; }
  }

  get build() {
    const self = this;
    return {
      run:      (engineRoot: string, configPath: string) => self.runBuild(engineRoot, configPath),
      cancel:   (jobId: string) => self.cancelBuild(jobId),
      onEvent:  (callback: (event: any) => void) => {
        self._buildEventUnlisten?.();
        window.__TAURI__.event.listen('build-output', (e: any) => {
          callback(self._parseBuildPayload(e));
        }).then((u) => { self._buildEventUnlisten = u; });
      },
      offEvent: () => {
        self._buildEventUnlisten?.();
        self._buildEventUnlisten = null;
      },
    };
  }

  get npm() {
    const self = this;
    return {
      run:      (projectDir: string, args: string[]) => self.runNpm(projectDir, args),
      cancel:   (jobId: string) => self.cancelNpm(jobId),
      onEvent:  (callback: (event: any) => void) => {
        self._npmEventUnlisten?.();
        window.__TAURI__.event.listen('npm-output', (e: any) => {
          callback(self._parseBuildPayload(e));
        }).then((u) => { self._npmEventUnlisten = u; });
      },
      offEvent: () => {
        self._npmEventUnlisten?.();
        self._npmEventUnlisten = null;
      },
    };
  }

  // ── File Watching ───────────────────────────────────────────────────────

  async watchDirectory(path: string, recursive?: boolean): Promise<string> {
    return window.__TAURI__.core.invoke('watch_directory', { path, recursive });
  }

  async unwatchDirectory(watcherId: string): Promise<void> {
    return window.__TAURI__.core.invoke('unwatch_directory', { watcherId });
  }

  // ── Event Listeners ─────────────────────────────────────────────────────

  onBuildOutput(callback: (event: any) => void): Promise<() => void> {
    return window.__TAURI__.event.listen('build-output', callback);
  }

  onNpmOutput(callback: (event: any) => void): Promise<() => void> {
    return window.__TAURI__.event.listen('npm-output', callback);
  }

  onFileChanged(callback: (event: any) => void): Promise<() => void> {
    return window.__TAURI__.event.listen('file-changed', callback);
  }

  // ── Shell Operations ───────────────────────────────────────────────────

  async showItemInFolder(path: string): Promise<void> {
    return window.__TAURI__.core.invoke('show_item_in_folder', { path });
  }

  async openPath(path: string): Promise<void> {
    return window.__TAURI__.core.invoke('open_path', { path });
  }

  // ── Window Controls ───────────────────────────────────────────────────

  async minimizeWindow(): Promise<void> {
    return window.__TAURI__.core.invoke('minimize_window');
  }

  async maximizeWindow(): Promise<void> {
    return window.__TAURI__.core.invoke('maximize_window');
  }

  async closeWindow(): Promise<void> {
    return window.__TAURI__.core.invoke('close_window');
  }

  // ── File system aliases for NativeFileSystem compatibility ────────────
  async readDir(path: string): Promise<any[]> {
    return this.listDir(path);
  }

  async stat(path: string): Promise<any> {
    return window.__TAURI__.core.invoke('stat', { path });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return window.__TAURI__.core.invoke('rename', { oldPath, newPath });
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    return window.__TAURI__.core.invoke('copy', { srcPath, destPath });
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

  offWatchEvent(): void { /* listeners cleaned up via their own unlisten() */ }

  // ── Binary file write (ArrayBuffer → base64 → write_binary) ─────────────
  async writeFileBinary(path: string, buffer: ArrayBuffer | Uint8Array): Promise<void> {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return this.writeBinary(path, btoa(binary));
  }

  // ── Multi-window launchers ─────────────────────────────────────────────
  openScriptEditor(path: string): void {
    const url = path ? `script-window.html?filePath=${encodeURIComponent(path)}` : 'script-window.html';
    window.__TAURI__.core.invoke('open_child_window', {
      label: 'script-editor', url, title: 'Script Editor', width: 1200, height: 800,
    }).then(() => {
      if (path) window.__TAURI__.event.emit('fluxion:script-open-tab', path).catch(() => {});
    }).catch((e: any) => console.error('open_child_window error:', e));
  }

  openVisualMaterialEditor(path: string): void {
    const url = path ? `vme-window.html?filePath=${encodeURIComponent(path)}` : 'vme-window.html';
    window.__TAURI__.core.invoke('open_child_window', {
      label: 'vme-editor', url, title: 'Visual Material Editor', width: 1400, height: 900,
    }).then(() => {
      if (path) window.__TAURI__.event.emit('fluxion:vme-open-tab', path).catch(() => {});
    }).catch((e: any) => console.error('open_child_window error:', e));
  }

  openFuiEditor(path: string): void {
    const url = path ? `fui-window.html?filePath=${encodeURIComponent(path)}` : 'fui-window.html';
    window.__TAURI__.core.invoke('open_child_window', {
      label: 'fui-editor', url, title: 'FUI Editor', width: 1200, height: 800,
    }).then(() => {
      if (path) window.__TAURI__.event.emit('fluxion:fui-open-tab', path).catch(() => {});
    }).catch((e: any) => console.error('open_child_window error:', e));
  }

  notifyMaterialChanged(filePath: string): void {
    window.__TAURI__.event.emit('fluxion:material-changed', filePath).catch(() => {});
  }

  detachPanel(panelId: string): void {
    window.__TAURI__.core.invoke('open_child_window', {
      label: `panel-${panelId}`,
      url: `panel-window.html?panelId=${encodeURIComponent(panelId)}`,
      title: panelId,
      width: 700, height: 500,
    }).catch((e: any) => console.error('open_child_window error:', e));
  }

  closePanelWindow(panelId: string): void {
    window.__TAURI__.core.invoke('close_child_window', { label: `panel-${panelId}` })
      .catch((e: any) => console.error('close_child_window error:', e));
  }

  sendPanelState(panelId: string, state: unknown): void {
    window.__TAURI__.event.emit(`fluxion:panel-state-${panelId}`, state).catch(() => {});
  }

  getPanelWindowId(): Promise<string> {
    return Promise.resolve(new URLSearchParams(window.location.search).get('panelId') ?? '');
  }

  // ── Panel IPC (cross-window state relay via Tauri events) ─────────────────
  private _panelStateUnlisten: (() => void) | null = null;

  onPanelState(callback: (state: unknown) => void): void {
    const panelId = new URLSearchParams(window.location.search).get('panelId') ?? '';
    window.__TAURI__.event.listen(`fluxion:panel-state-${panelId}`, (event: any) => {
      callback(event.payload);
    }).then((unlisten) => { this._panelStateUnlisten = unlisten; });
  }

  offPanelState(): void {
    this._panelStateUnlisten?.();
    this._panelStateUnlisten = null;
  }

  private _panelActionUnlisten: (() => void) | null = null;

  onPanelAction(callback: (panelId: string, action: unknown) => void): void {
    window.__TAURI__.event.listen('fluxion:panel-action', (event: any) => {
      callback(event.payload.panelId, event.payload.action);
    }).then((unlisten) => { this._panelActionUnlisten = unlisten; });
  }

  offPanelAction(): void {
    this._panelActionUnlisten?.();
    this._panelActionUnlisten = null;
  }

  private _panelWindowClosedUnlisten: (() => void) | null = null;

  onPanelWindowClosed(callback: (panelId: string) => void): void {
    window.__TAURI__.event.listen('fluxion:panel-window-closed', (event: any) => {
      callback(event.payload);
    }).then((unlisten) => { this._panelWindowClosedUnlisten = unlisten; });
  }

  offPanelWindowClosed(): void {
    this._panelWindowClosedUnlisten?.();
    this._panelWindowClosedUnlisten = null;
  }

  // ── Material change relay ─────────────────────────────────────────────────
  private _materialChangedUnlisten: (() => void) | null = null;

  onMaterialChangedRelay(callback: (changedPath: string) => void): void {
    window.__TAURI__.event.listen('fluxion:material-changed', (event: any) => {
      callback(event.payload);
    }).then((unlisten) => { this._materialChangedUnlisten = unlisten; });
  }

  offMaterialChangedRelay(): void {
    this._materialChangedUnlisten?.();
    this._materialChangedUnlisten = null;
  }

  dispatchEditorAction(action: unknown): void {
    const panelId = new URLSearchParams(window.location.search).get('panelId') ?? '';
    window.__TAURI__.event.emit('fluxion:panel-action', { panelId, action }).catch(() => {});
  }

  // ── Script settings IPC ─────────────────────────────────────────────────
  sendScriptSettings(settings: unknown): void {
    try { localStorage.setItem('fluxion:script-settings', JSON.stringify(settings)); } catch { /* ignore */ }
    window.__TAURI__.event.emit('fluxion:script-settings', settings).catch(() => {});
  }

  async getScriptSettings(): Promise<unknown | null> {
    try {
      const raw = localStorage.getItem('fluxion:script-settings');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private _scriptSettingsUnlisten: (() => void) | null = null;
  onScriptSettingsUpdate(callback: (s: unknown) => void): void {
    window.__TAURI__.event.listen('fluxion:script-settings', (event: any) => {
      callback(event.payload);
    }).then((unlisten) => { this._scriptSettingsUnlisten = unlisten; });
  }
  offScriptSettingsUpdate(): void {
    this._scriptSettingsUnlisten?.();
    this._scriptSettingsUnlisten = null;
  }

  private _scriptOpenTabUnlisten: (() => void) | null = null;
  onScriptOpenTab(callback: (path: string) => void): void {
    window.__TAURI__.event.listen('fluxion:script-open-tab', (event: any) => {
      callback(event.payload);
    }).then((unlisten) => { this._scriptOpenTabUnlisten = unlisten; });
  }
  offScriptOpenTab(): void {
    this._scriptOpenTabUnlisten?.();
    this._scriptOpenTabUnlisten = null;
  }

  // ── VME / FUI tab IPC ───────────────────────────────────────────────────
  private _vmeOpenTabUnlisten: (() => void) | null = null;
  onVmeOpenTab(handler: (event: unknown, filePath: string) => void): void {
    window.__TAURI__.event.listen('fluxion:vme-open-tab', (event: any) => {
      handler(event, event.payload);
    }).then((unlisten) => { this._vmeOpenTabUnlisten = unlisten; });
  }
  offVmeOpenTab(): void {
    this._vmeOpenTabUnlisten?.();
    this._vmeOpenTabUnlisten = null;
  }

  private _fuiOpenTabUnlisten: (() => void) | null = null;
  onFuiOpenTab(handler: (event: unknown, filePath: string) => void): void {
    window.__TAURI__.event.listen('fluxion:fui-open-tab', (event: any) => {
      handler(event, event.payload);
    }).then((unlisten) => { this._fuiOpenTabUnlisten = unlisten; });
  }
  offFuiOpenTab(): void {
    this._fuiOpenTabUnlisten?.();
    this._fuiOpenTabUnlisten = null;
  }

  // ── FluxionAPI interface aliases (used by Titlebar and other UI) ──────────
  minimize()  { return this.minimizeWindow(); }
  maximize()  { return this.maximizeWindow(); }
  close()     { return this.closeWindow(); }
}

// Export singleton instance
export const API = new APIShim();

// Assign to window.fluxionAPI so all editor code using window.fluxionAPI works
if (typeof window !== 'undefined') {
  (window as any).fluxionAPI = API;

  // Bridge tauri://file-drop → fluxion:file-drop so React components can receive dropped paths.
  window.__TAURI__.event.listen('tauri://file-drop', (event: any) => {
    const paths: string[] = event.payload?.paths ?? [];
    if (paths.length > 0) {
      window.dispatchEvent(new CustomEvent('fluxion:file-drop', { detail: { paths } }));
    }
  });
}
