// ============================================================
// FluxionJS V3 — Local URL helper
// Converts absolute file-system paths to loadable URLs.
//
// Tauri blocks direct file:// URLs in the webview (CSP).
// The correct approach is Tauri's built-in asset protocol:
//   convertFileSrc(path) → https://asset.localhost/<path>
// which is always allowed when assetProtocol.enable = true
// and withGlobalTauri = true in tauri.conf.json.
// ============================================================

/**
 * Convert an absolute path (or an already-constructed `file://` URL)
 * to a URL the current runtime can load.
 *
 * - Tauri desktop  → `https://asset.localhost/…`  (via convertFileSrc)
 * - Web / dev      → `file:///…`                   (legacy fallback)
 * - HTTP / blob / data  → returned unchanged
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

  // Normalise to a raw absolute path (strip any file:// prefix).
  let raw = path;
  if (raw.startsWith('file:///')) {
    raw = raw.slice(8); // "file:///C:/..." → "C:/..."
  } else if (raw.startsWith('file://')) {
    raw = raw.slice(7);
  }
  raw = raw.replace(/\\/g, '/');

  // Resolve any .. segments — Tauri's asset protocol returns 403 for paths
  // containing traversal components like /../ even when they are valid.
  const parts = raw.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      if (resolved.length > 1) resolved.pop(); // keep drive root (e.g. "C:")
    } else if (part !== '.') {
      resolved.push(part);
    }
  }
  raw = resolved.join('/');

  // Tauri v2: window.__TAURI__.core.convertFileSrc is available when
  // tauri.conf.json has "withGlobalTauri": true and
  // app > security > assetProtocol > enable = true.
  const tauri = typeof window !== 'undefined' && (window as any).__TAURI__;
  if (tauri?.core?.convertFileSrc) {
    return tauri.core.convertFileSrc(raw);
  }

  // Fallback for non-Tauri contexts (web export, dev server).
  return `file:///${raw}`;
}

/**
 * @deprecated Use `toLocalUrl()` directly — convertFileSrc handles all cases
 * synchronously and is the recommended Tauri approach.
 * Kept for backwards compatibility; simply delegates to toLocalUrl().
 */
export async function pathToBlobUrl(path: string, _mimeType?: string): Promise<string> {
  return toLocalUrl(path);
}

/**
 * Returns true when running inside the native Tauri context.
 */
export function isNativeContext(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}
