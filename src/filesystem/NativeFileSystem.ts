// ============================================================
// FluxionJS V3 — Native FileSystem Implementation
// Implements IFileSystem over the fluxionAPI bridge (Tauri shim).
// All paths are validated against a sandbox root to prevent
// path traversal attacks.
// ============================================================

import {
  FileSystemBase,
  type IFileSystem,
  type FileInfo,
  type DirEntry,
  type FileWatchCallback,
  type FileDialogFilter,
  type WalkDirOptions,
  normalizePath,
  isInsidePath,
  pathExtension,
  pathBasename,
} from './FileSystem';

/** The shape of the API exposed via the fluxionAPI bridge */
interface FluxionNativeAPI {
  // Dialogs
  openFileDialog: (filters?: any) => Promise<string | null>;
  saveFileDialog: (filters?: any) => Promise<string | null>;
  openDirDialog: () => Promise<string | null>;
  // Text I/O
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  appendFile: (path: string, data: string) => Promise<void>;
  writeFileAtomic: (path: string, data: string) => Promise<void>;
  // Binary I/O (Base64 encoded)
  readBinary: (path: string) => Promise<string>;
  writeBinary: (path: string, base64: string) => Promise<void>;
  writeBinaryAtomic: (path: string, base64: string) => Promise<void>;
  // Directory
  readDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string; size?: number; modifiedAt?: number }[]>;
  listDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string; size?: number; modifiedAt?: number }[]>;
  walkDir: (path: string, opts?: { recursive?: boolean; includeHidden?: boolean; maxDepth?: number; filterExts?: string[] }) => Promise<{ name: string; isDirectory: boolean; path: string; size: number; modifiedAt: number }[]>;
  mkdir: (path: string) => Promise<void>;
  // Queries
  exists: (path: string) => Promise<boolean>;
  isFile: (path: string) => Promise<boolean>;
  isDir: (path: string) => Promise<boolean>;
  stat: (path: string) => Promise<{ size: number; isDirectory: boolean; modifiedAt: number }>;
  fileSize: (path: string) => Promise<number>;
  // Mutation
  deleteFile: (path: string) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  copy: (srcPath: string, destPath: string) => Promise<void>;
  // Watch
  watch: (path: string) => Promise<string>;
  unwatch: (watchId: string) => Promise<boolean>;
  onWatchEvent: (callback: (event: { type: string; path: string }) => void) => void;
  offWatchEvent: () => void;
  // Paths
  getAppDataPath: () => Promise<string>;
  getTempDir: () => Promise<string>;
  // Shell
  showItemInFolder: (path: string) => Promise<boolean>;
  openPath: (path: string) => Promise<boolean>;
  // Window
  minimize: () => void;
  maximize: () => void;
  close: () => void;
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

export class NativeFileSystem extends FileSystemBase {
  private api: FluxionNativeAPI;

  constructor(api: FluxionNativeAPI) {
    super();
    this.api = api;
  }

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
    return this.api.readFile(path);
  }

  async writeFile(path: string, data: string): Promise<void> {
    this.assertSafe(path);
    await this.api.writeFile(path, data);
  }

  override async appendFile(path: string, data: string): Promise<void> {
    this.assertSafe(path);
    await this.api.appendFile(path, data);
  }

  override async writeFileAtomic(path: string, data: string): Promise<void> {
    this.assertSafe(path);
    await this.api.writeFileAtomic(path, data);
  }

  // ── Binary I/O ──

  async readBinary(path: string): Promise<ArrayBuffer> {
    const base64 = await this.api.readBinary(path);
    return base64ToArrayBuffer(base64);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.assertSafe(path);
    const base64 = arrayBufferToBase64(data);
    await this.api.writeBinary(path, base64);
  }

  override async writeBinaryAtomic(path: string, data: ArrayBuffer): Promise<void> {
    this.assertSafe(path);
    await this.api.writeBinaryAtomic(path, arrayBufferToBase64(data));
  }

  // ── Directory ──

  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await this.api.readDir(path);
    return entries.map((e) => ({
      name: e.name,
      path: normalizePath(e.path),
      isDirectory: e.isDirectory,
      size: e.size,
      modifiedAt: e.modifiedAt,
    }));
  }

  override async walkDir(path: string, opts?: WalkDirOptions): Promise<DirEntry[]> {
    const entries = await this.api.walkDir(path, {
      recursive:     opts?.recursive,
      includeHidden: opts?.includeHidden,
      maxDepth:      opts?.maxDepth,
      filterExts:    opts?.filterExtensions,
    });
    return entries.map((e) => ({
      name: e.name,
      path: normalizePath(e.path),
      isDirectory: e.isDirectory,
      size: e.size,
      modifiedAt: e.modifiedAt,
    }));
  }

  async mkdir(path: string): Promise<void> {
    this.assertSafe(path);
    await this.api.mkdir(path);
  }

  // ── Queries ──

  async exists(path: string): Promise<boolean> {
    return this.api.exists(path);
  }

  override async isFile(path: string): Promise<boolean> {
    return this.api.isFile(path);
  }

  override async isDir(path: string): Promise<boolean> {
    return this.api.isDir(path);
  }

  async stat(path: string): Promise<FileInfo> {
    const s = await this.api.stat(path);
    return {
      name: pathBasename(path),
      path: normalizePath(path),
      size: s.size,
      isDirectory: s.isDirectory,
      extension: s.isDirectory ? '' : pathExtension(path),
      modifiedAt: s.modifiedAt,
    };
  }

  override async fileSize(path: string): Promise<number> {
    return this.api.fileSize(path);
  }

  // ── Mutation ──

  async delete(path: string): Promise<void> {
    this.assertSafe(path);
    await this.api.deleteFile(path);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this.assertSafe(oldPath);
    this.assertSafe(newPath);
    await this.api.rename(oldPath, newPath);
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    this.assertSafe(destPath);
    await this.api.copy(srcPath, destPath);
  }

  // ── Watching ──

  private watchCallbacks = new Map<string, FileWatchCallback>();
  private watchListenerAttached = false;

  private ensureWatchListener(): void {
    if (this.watchListenerAttached) return;
    this.watchListenerAttached = true;
    this.api.onWatchEvent((event) => {
      for (const cb of this.watchCallbacks.values()) {
        cb({ type: event.type as any, path: normalizePath(event.path) });
      }
    });
  }

  async watch(path: string, callback: FileWatchCallback): Promise<string> {
    this.ensureWatchListener();
    const watchId = await this.api.watch(path);
    this.watchCallbacks.set(watchId, callback);
    return watchId;
  }

  async unwatch(watchId: string): Promise<void> {
    this.watchCallbacks.delete(watchId);
    await this.api.unwatch(watchId);
  }

  // ── Dialogs ──

  async openFileDialog(filters?: FileDialogFilter[]): Promise<string | null> {
    return this.api.openFileDialog(filters);
  }

  async saveFileDialog(filters?: FileDialogFilter[]): Promise<string | null> {
    return this.api.saveFileDialog(filters);
  }

  async openDirDialog(): Promise<string | null> {
    return this.api.openDirDialog();
  }

  // ── Paths ──

  async getAppDataPath(): Promise<string> {
    return this.api.getAppDataPath();
  }

  override async tempDir(): Promise<string> {
    return this.api.getTempDir();
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
