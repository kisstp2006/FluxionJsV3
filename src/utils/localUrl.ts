// ============================================================
// FluxionJS V3 — Local URL helper
// Converts absolute file-system paths to loadable URLs.
//
// In Tauri the WebView blocks `file://` URLs (browser security).
// Use Tauri's asset protocol instead: convertFileSrc() returns
// `https://asset.localhost/<path>` which the WebView allows.
// In non-Tauri contexts (web export, dev server) we fall back to
// `file:///path` so the existing behaviour is preserved.
// ============================================================

/**
 * Convert an absolute path (or an already-constructed `file://` URL)
 * to a URL the current runtime can load.
 *
 * - Tauri desktop  → `https://asset.localhost/…`  (via convertFileSrc)
 * - Web / dev      → `file:///…`                   (legacy behaviour)
 * - HTTP / blob    → returned unchanged
 */
export function toLocalUrl(path: string): string {
  if (!path) return path;

  // Already a web-safe URL — return as-is.
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  // Normalise to a raw absolute path (strip file:// prefix if present).
  let raw = path;
  if (raw.startsWith('file:///')) {
    // "file:///C:/..." → "C:/..."  (Windows)
    // "file:////..."   → "//..."   (UNC)
    raw = raw.slice(8);
  } else if (raw.startsWith('file://')) {
    raw = raw.slice(7);
  }
  raw = raw.replace(/\\/g, '/');

  // Tauri v2: window.__TAURI__.core.convertFileSrc is available when
  // tauri.conf.json has "withGlobalTauri": true.
  const tauri = typeof window !== 'undefined' && (window as any).__TAURI__;
  if (tauri?.core?.convertFileSrc) {
    return tauri.core.convertFileSrc(raw);
  }

  // Fallback: file:// URL for Electron / legacy contexts.
  return `file:///${raw}`;
}
