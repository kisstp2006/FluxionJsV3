// ============================================================
// FluxionJS V3 — Electron FileSystem Implementation
// Implements IFileSystem over Electron IPC (preload bridge).
// All paths are validated against a sandbox root to prevent
// path traversal attacks.
// ============================================================

import {
  IFileSystem,
  FileInfo,
  DirEntry,
  FileWatchCallback,
  FileDialogFilter,
  normalizePath,
  isInsidePath,
  pathExtension,
  pathBasename,
} from './FileSystem';

/** The shape of the API exposed via contextBridge in preload.ts */
interface FluxionNativeAPI {
  // Dialogs
  openFileDialog: (filters?: any) => Promise<string | null>;
  saveFileDialog: (filters?: any) => Promise<string | null>;
  openDirDialog: () => Promise<string | null>;
  // Text I/O
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<boolean>;
  // Binary I/O (Base64 encoded)
  readBinary: (path: string) => Promise<string>;
  writeBinary: (path: string, base64: string) => Promise<boolean>;
  // Directory
  readDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>;
  listDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>;
  mkdir: (path: string) => Promise<boolean>;
  // Queries
  exists: (path: string) => Promise<boolean>;
  stat: (path: string) => Promise<{ size: number; isDirectory: boolean; modifiedAt: number }>;
  // Mutation
  deleteFile: (path: string) => Promise<boolean>;
  rename: (oldPath: string, newPath: string) => Promise<boolean>;
  copy: (srcPath: string, destPath: string) => Promise<boolean>;
  // Watch
  watch: (path: string) => Promise<string>;
  unwatch: (watchId: string) => Promise<boolean>;
  onWatchEvent: (callback: (event: { type: string; path: string }) => void) => void;
  offWatchEvent: () => void;
  // Paths
  getAppDataPath: () => Promise<string>;
  // Window
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

function getAPI(): FluxionNativeAPI {
  const api = (window as any).fluxionAPI as FluxionNativeAPI | undefined;
  if (!api) throw new Error('fluxionAPI not available — not running in Electron?');
  return api;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class ElectronFileSystem implements IFileSystem {
  /**
   * Optional sandbox root. When set, all mutating operations
   * are validated to stay inside this directory.
   */
  private sandboxRoot: string | null = null;

  /** Set the sandbox root (typically the project directory). */
  setSandboxRoot(root: string | null): void {
    this.sandboxRoot = root ? normalizePath(root) : null;
  }

  private assertSafe(targetPath: string): void {
    if (this.sandboxRoot && !isInsidePath(targetPath, this.sandboxRoot)) {
      throw new Error(`Path traversal denied: "${targetPath}" is outside sandbox "${this.sandboxRoot}"`);
    }
  }

  // ── Text I/O ──

  async readFile(path: string): Promise<string> {
    return getAPI().readFile(path);
  }

  async writeFile(path: string, data: string): Promise<void> {
    this.assertSafe(path);
    await getAPI().writeFile(path, data);
  }

  // ── Binary I/O ──

  async readBinary(path: string): Promise<ArrayBuffer> {
    const base64 = await getAPI().readBinary(path);
    return base64ToArrayBuffer(base64);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.assertSafe(path);
    const base64 = arrayBufferToBase64(data);
    await getAPI().writeBinary(path, base64);
  }

  // ── Directory ──

  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await getAPI().readDir(path);
    return entries.map((e) => ({
      name: e.name,
      path: normalizePath(e.path),
      isDirectory: e.isDirectory,
    }));
  }

  async mkdir(path: string): Promise<void> {
    this.assertSafe(path);
    await getAPI().mkdir(path);
  }

  // ── Queries ──

  async exists(path: string): Promise<boolean> {
    return getAPI().exists(path);
  }

  async stat(path: string): Promise<FileInfo> {
    const s = await getAPI().stat(path);
    return {
      name: pathBasename(path),
      path: normalizePath(path),
      size: s.size,
      isDirectory: s.isDirectory,
      extension: s.isDirectory ? '' : pathExtension(path),
      modifiedAt: s.modifiedAt,
    };
  }

  // ── Mutation ──

  async delete(path: string): Promise<void> {
    this.assertSafe(path);
    await getAPI().deleteFile(path);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.assertSafe(oldPath);
    this.assertSafe(newPath);
    await getAPI().rename(oldPath, newPath);
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    this.assertSafe(destPath);
    await getAPI().copy(srcPath, destPath);
  }

  // ── Watching ──

  private watchCallbacks = new Map<string, FileWatchCallback>();
  private watchListenerAttached = false;

  private ensureWatchListener(): void {
    if (this.watchListenerAttached) return;
    this.watchListenerAttached = true;
    getAPI().onWatchEvent((event) => {
      for (const cb of this.watchCallbacks.values()) {
        cb({ type: event.type as any, path: normalizePath(event.path) });
      }
    });
  }

  async watch(path: string, callback: FileWatchCallback): Promise<string> {
    this.ensureWatchListener();
    const watchId = await getAPI().watch(path);
    this.watchCallbacks.set(watchId, callback);
    return watchId;
  }

  async unwatch(watchId: string): Promise<void> {
    this.watchCallbacks.delete(watchId);
    await getAPI().unwatch(watchId);
  }

  // ── Dialogs ──

  async openFileDialog(filters?: FileDialogFilter[]): Promise<string | null> {
    return getAPI().openFileDialog(filters);
  }

  async saveFileDialog(filters?: FileDialogFilter[]): Promise<string | null> {
    return getAPI().saveFileDialog(filters);
  }

  async openDirDialog(): Promise<string | null> {
    return getAPI().openDirDialog();
  }

  // ── Paths ──

  async getAppDataPath(): Promise<string> {
    return getAPI().getAppDataPath();
  }
}

/** Global singleton — set once at editor startup. */
let _fs: IFileSystem | null = null;

export function setGlobalFileSystem(fs: IFileSystem): void {
  _fs = fs;
}

export function getFileSystem(): IFileSystem {
  if (!_fs) throw new Error('FileSystem not initialized. Call setGlobalFileSystem() first.');
  return _fs;
}
