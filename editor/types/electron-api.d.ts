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
}

declare interface Window {
  fluxionAPI?: FluxionAPI;
}
