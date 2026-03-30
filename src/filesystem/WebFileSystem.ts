// ============================================================
// FluxionJS V3 — Web FileSystem Implementation
// Implements IFileSystem using fetch() for exported web builds.
// Read operations map project-relative paths to HTTP requests
// served from the same origin as index.html.
// Write / directory / dialog / watch operations are no-ops or
// throw, since they are not meaningful in a browser context.
// ============================================================

import type {
  IFileSystem,
  FileInfo,
  DirEntry,
  FileWatchCallback,
  FileDialogFilter,
} from './FileSystem';

/**
 * Convert any path to a URL relative to the served root.
 * - Strips Windows drive letters:  C:/Build/Web/Assets/x → Assets/x
 * - Strips leading slashes so fetch() treats it as relative
 * - Converts backslashes to forward slashes
 */
function toUrl(path: string): string {
  let p = path.replace(/\\/g, '/');
  // Strip Windows absolute prefix (e.g. "C:/Users/.../Build/Web/Assets/x")
  // by taking only the portion after the last known anchor, or simply by
  // stripping the drive + leading slash.
  p = p.replace(/^[A-Za-z]:\//, '');
  // Strip remaining leading slashes so the URL is relative
  p = p.replace(/^\/+/, '');
  return p;
}

export class WebFileSystem implements IFileSystem {
  // ── Text I/O ──────────────────────────────────────────────

  async readFile(path: string): Promise<string> {
    const url = toUrl(path);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`WebFileSystem: cannot read "${path}" (HTTP ${resp.status})`);
    }
    return resp.text();
  }

  async writeFile(_path: string, _data: string): Promise<void> {
    throw new Error('WebFileSystem: writeFile is not supported in a web build.');
  }

  // ── Binary I/O ────────────────────────────────────────────

  async readBinary(path: string): Promise<ArrayBuffer> {
    const url = toUrl(path);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`WebFileSystem: cannot read binary "${path}" (HTTP ${resp.status})`);
    }
    return resp.arrayBuffer();
  }

  async writeBinary(_path: string, _data: ArrayBuffer): Promise<void> {
    throw new Error('WebFileSystem: writeBinary is not supported in a web build.');
  }

  // ── Directory ─────────────────────────────────────────────

  async readDir(_path: string): Promise<DirEntry[]> {
    return [];
  }

  async mkdir(_path: string): Promise<void> {
    // no-op
  }

  // ── Queries ───────────────────────────────────────────────

  async exists(path: string): Promise<boolean> {
    try {
      const resp = await fetch(toUrl(path), { method: 'HEAD' });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<FileInfo> {
    const resp = await fetch(toUrl(path), { method: 'HEAD' });
    if (!resp.ok) throw new Error(`WebFileSystem: stat failed for "${path}"`);
    const len = Number(resp.headers.get('content-length') ?? 0);
    const lastMod = resp.headers.get('last-modified');
    const name = path.replace(/\\/g, '/').split('/').pop() ?? '';
    const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
    return {
      name,
      path: path.replace(/\\/g, '/'),
      size: len,
      isDirectory: false,
      extension: ext,
      modifiedAt: lastMod ? new Date(lastMod).getTime() : 0,
    };
  }

  // ── Mutation ──────────────────────────────────────────────

  async delete(_path: string): Promise<void> {
    throw new Error('WebFileSystem: delete is not supported in a web build.');
  }

  async rename(_oldPath: string, _newPath: string): Promise<void> {
    throw new Error('WebFileSystem: rename is not supported in a web build.');
  }

  async copy(_srcPath: string, _destPath: string): Promise<void> {
    throw new Error('WebFileSystem: copy is not supported in a web build.');
  }

  // ── Watching (no-op in browser) ───────────────────────────

  async watch(_path: string, _callback: FileWatchCallback): Promise<string> {
    return '';
  }

  async unwatch(_watchId: string): Promise<void> {
    // no-op
  }

  // ── Dialogs (not supported) ───────────────────────────────

  async openFileDialog(_filters?: FileDialogFilter[]): Promise<string | null> {
    return null;
  }

  async saveFileDialog(_filters?: FileDialogFilter[]): Promise<string | null> {
    return null;
  }

  async openDirDialog(): Promise<string | null> {
    return null;
  }

  // ── Paths ─────────────────────────────────────────────────

  async getAppDataPath(): Promise<string> {
    return '/';
  }
}
