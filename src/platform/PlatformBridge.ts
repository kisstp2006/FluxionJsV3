// ============================================================
// FluxionJS V3 — Platform Bridge
// Thin interface injected by the editor at startup.
// Engine code calls getPlatformBridge() instead of accessing
// window.fluxionAPI directly, preserving engine/editor separation.
// ============================================================

export interface PlatformBridge {
  /** Hash a file by absolute path (Electron IPC). */
  hashFile?: (path: string) => Promise<string>;
  /** Open a multi-file dialog. */
  openFilesDialog?: (filters?: any[]) => Promise<string[] | null>;
  /** Open a path with the OS default app / file manager. */
  openPath?: (path: string) => Promise<boolean>;
  /** Close the application window. */
  close?: () => void;
  /** True when running inside the editor (not a standalone build). */
  isEditor?: boolean;
}

let _bridge: PlatformBridge | null = null;

export function setPlatformBridge(bridge: PlatformBridge | null): void {
  _bridge = bridge;
}

export function getPlatformBridge(): PlatformBridge | null {
  return _bridge;
}
