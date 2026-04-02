// ============================================================
// FluxionJS V3 — Scene Bridge
// Routes scene file I/O through the fluxion-core Rust backend
// when running under Tauri.  Falls back to JS JSON.parse + fs
// in browser mode.
//
// Rust adds:
//   • serde_json parse  (faster than JS JSON.parse for large scenes)
//   • Topological sort  (parents before children, guaranteed)
//   • Atomic write      (.tmp rename — crash-safe)
//   • Schema validation (returns Err on malformed JSON)
// ============================================================

import type { SceneFileData } from './SceneSerializer';

// ── Tauri availability ─────────────────────────────────────────────────────────

function _invoke(cmd: string, args?: Record<string, unknown>): Promise<any> {
  return (window as any).__TAURI__.core.invoke(cmd, args);
}

export function isSceneNativeAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load a scene via the Rust backend:
 *   1. Reads the file from disk (native I/O — no Tauri fs IPC round-trip to JS)
 *   2. Parses + validates JSON via serde_json
 *   3. Topologically sorts entities (parents before children)
 *
 * Returns `null` if Tauri is unavailable (caller should fall back to JS path).
 */
export async function loadSceneNative(path: string): Promise<SceneFileData | null> {
  if (!isSceneNativeAvailable()) return null;
  try {
    const data = await _invoke('load_scene', { path }) as SceneFileData;
    return data;
  } catch (err) {
    console.warn('[SceneBridge] load_scene Tauri command failed — falling back to JS:', err);
    return null;
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Save a scene via the Rust backend:
 *   1. Serialises to pretty JSON via serde_json
 *   2. Writes atomically: `path.tmp` → rename → `path`
 *
 * Returns `false` if Tauri is unavailable or the command fails.
 */
export async function saveSceneNative(path: string, data: SceneFileData): Promise<boolean> {
  if (!isSceneNativeAvailable()) return false;
  try {
    await _invoke('save_scene', { path, data });
    return true;
  } catch (err) {
    console.warn('[SceneBridge] save_scene Tauri command failed — falling back to JS:', err);
    return false;
  }
}
