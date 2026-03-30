// ============================================================
// FluxionJS V3 — Electron preload bridge type declarations
// Extends the global Window interface with the fluxionAPI
// object that Electron's contextBridge exposes to the renderer.
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
  writeFileBinary?(path: string, buffer: ArrayBuffer | Uint8Array): Promise<void>;
  readFile?(path: string): Promise<string>;
  openPath?(path: string): void;

  // ── Child window launchers ───────────────────────────────────
  openVisualMaterialEditor?(path: string): void;
  openFuiEditor?(path: string): void;
  openScriptEditor?(path: string): void;
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

  /** Get a named Electron app path (e.g. 'exe', 'userData'). */
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
