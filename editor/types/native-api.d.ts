// ============================================================
// FluxionJS V3 — Native API bridge type declarations
// Extends the global Window interface with the fluxionAPI
// object provided by the TauriAPIShim at startup.
// ============================================================

interface FluxionAPI {
  // ── Window controls ──────────────────────────────────────────
  close(): void;
  minimize(): void;
  maximize(): void;

  // ── File system dialogs ──────────────────────────────────────
  openFileDialog?(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>;
  saveFileDialog?(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>;
  openDirDialog?(): Promise<string | null>;

  // ── File I/O ─────────────────────────────────────────────────
  writeFile(path: string, content: string): Promise<void>;
  appendFile?(path: string, data: string): Promise<void>;
  writeFileAtomic?(path: string, data: string): Promise<void>;
  writeFileBinary?(path: string, buffer: ArrayBuffer | Uint8Array): Promise<void>;
  writeBinaryAtomic?(path: string, base64: string): Promise<void>;
  readFile?(path: string): Promise<string>;
  readBinary?(path: string): Promise<string>;
  readDir?(path: string): Promise<any[]>;
  walkDir?(path: string, opts?: any): Promise<any[]>;
  mkdir?(path: string): Promise<void>;
  exists?(path: string): Promise<boolean>;
  isFile?(path: string): Promise<boolean>;
  isDir?(path: string): Promise<boolean>;
  stat?(path: string): Promise<any>;
  fileSize?(path: string): Promise<number>;
  deleteFile?(path: string): Promise<void>;
  rename?(oldPath: string, newPath: string): Promise<void>;
  copy?(srcPath: string, destPath: string): Promise<void>;
  getTempDir?(): Promise<string>;
  openPath?(path: string): void;

  // ── Child window launchers ───────────────────────────────────
  openVisualMaterialEditor?(path: string): void;
  openFuiEditor?(path: string): void;
  openScriptEditor?(path: string): void;
  /** Open a registered editor panel in a detached OS window. */
  detachPanel?(panelId: string): void;
  /** Close a previously detached panel window and reattach the panel. */
  closePanelWindow?(panelId: string): void;
  /** Push EditorState snapshot to a detached panel window. */
  sendPanelState?(panelId: string, state: unknown): void;
  /** Called in the main window when a detached panel dispatches an action. */
  onPanelAction?(callback: (panelId: string, action: unknown) => void): void;
  offPanelAction?(): void;
  /** Called in a panel window to receive EditorState updates. */
  onPanelState?(callback: (state: unknown) => void): void;
  offPanelState?(): void;
  /** Dispatch an editor action from a panel window back to the main window. */
  dispatchEditorAction?(action: unknown): void;
  /** Panel window: get which panelId this window is for. */
  getPanelWindowId?(): Promise<string>;
  /** Main window: subscribe to panel OS window close events. */
  onPanelWindowClosed?(callback: (panelId: string) => void): void;
  offPanelWindowClosed?(): void;
  // ── Cross-window IPC relay ───────────────────────────────────
  notifyMaterialChanged?(filePath: string): void;
  onMaterialChangedRelay?(callback: (changedPath: string) => void): void;
  offMaterialChangedRelay?(): void;

  // ── VME window tab IPC ───────────────────────────────────────
  onVmeOpenTab?(handler: (event: unknown, filePath: string) => void): void;
  offVmeOpenTab?(): void;

  // ── FUI editor window tab IPC ────────────────────────────────
  onFuiOpenTab?(handler: (event: unknown, filePath: string) => void): void;
  offFuiOpenTab?(): void;

  // ── Scripting settings ───────────────────────────────────────
  sendScriptSettings?(settings: unknown): void;

  // ── Build system ─────────────────────────────────────────────
  build?: {
    /** Start a webpack build. Returns a jobId string. */
    run(engineRoot: string, configPath: string): Promise<string>;
    /** Cancel a running build by jobId. */
    cancel(jobId: string): Promise<void>;
    /** Subscribe to build streaming events. */
    onEvent(callback: (event: BuildStreamEvent) => void): void;
    offEvent(): void;
  };

  // ── npm commands ─────────────────────────────────────────────
  npm?: {
    /** Run an npm command in projectDir. Returns jobId. */
    run(projectDir: string, args: string[]): Promise<string>;
    /** Cancel a running npm job. */
    cancel(jobId: string): Promise<void>;
    /** Subscribe to npm streaming events. */
    onEvent(callback: (event: BuildStreamEvent) => void): void;
    offEvent(): void;
  };

  /** Get a named app path (e.g. 'exe', 'userData'). */
  getAppPath?(name: string): Promise<string>;
  /** Get the engine root directory (where node_modules/webpack lives). */
  getEngineRoot?(): Promise<string>;
}

interface BuildStreamEvent {
  jobId: string;
  type: 'stdout' | 'stderr' | 'done' | 'error';
  data: string;
}

declare interface Window {
  fluxionAPI?: FluxionAPI;
}
