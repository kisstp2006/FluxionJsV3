// ============================================================
// FluxionJS V3 — FileSystem Interface & Types
// ezEngine-inspired filesystem abstraction. Implementations
// sit behind this interface so the engine/editor never
// touches raw IPC or Node `fs` directly.
// ============================================================

// ── Path utilities ───────────────────────────────────────────

/** Normalize a path to forward slashes and collapse duplicates. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

/** Join path segments with forward-slash normalization. */
export function pathJoin(...parts: string[]): string {
  return normalizePath(parts.join('/'));
}

/** Get the directory portion of a path. */
export function pathDirname(p: string): string {
  const n = normalizePath(p);
  const idx = n.lastIndexOf('/');
  return idx >= 0 ? n.substring(0, idx) : '.';
}

/** Get the file name (with extension) from a path. */
export function pathBasename(p: string, stripExt?: string): string {
  const n = normalizePath(p);
  let base = n.substring(n.lastIndexOf('/') + 1);
  if (stripExt && base.endsWith(stripExt)) {
    base = base.substring(0, base.length - stripExt.length);
  }
  return base;
}

/** Extract the extension including the dot, e.g. ".png". Lower-cased. */
export function pathExtension(p: string): string {
  const base = pathBasename(p);
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.substring(dot).toLowerCase() : '';
}

/**
 * Return true if `child` is inside `parent` directory (prevents path traversal).
 * Both paths are normalized before comparison.
 */
export function isInsidePath(child: string, parent: string): boolean {
  const nc = normalizePath(child).toLowerCase();
  const np = normalizePath(parent).toLowerCase();
  return nc === np || nc.startsWith(np + '/');
}

// ── File Info ────────────────────────────────────────────────

export interface FileInfo {
  /** File or directory name (no path). */
  name: string;
  /** Full absolute path (forward-slashed). */
  path: string;
  /** File size in bytes (0 for directories). */
  size: number;
  /** True if this entry is a directory. */
  isDirectory: boolean;
  /** Extension including dot, lower-cased. Empty for dirs. */
  extension: string;
  /** Last-modified timestamp (ms since epoch). */
  modifiedAt: number;
}

// ── Directory Entry (lightweight, returned by readDir / walkDir) ─────

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  /** File size in bytes (populated by walkDir; 0 for directories). */
  size?: number;
  /** Last-modified timestamp in ms since epoch (populated by walkDir). */
  modifiedAt?: number;
}

// ── WalkDir options ──────────────────────────────────────────

export interface WalkDirOptions {
  /** Recurse into sub-directories. Default: true. */
  recursive?: boolean;
  /** Include hidden entries (names starting with '.'). Default: false. */
  includeHidden?: boolean;
  /** Maximum recursion depth (undefined = unlimited). */
  maxDepth?: number;
  /** Only return files whose extension is in this list (e.g. ['.png', '.ts']). */
  filterExtensions?: string[];
}

// ── File Watch Events ────────────────────────────────────────

export type FileWatchEventType = 'create' | 'change' | 'delete';

export interface FileWatchEvent {
  type: FileWatchEventType;
  path: string;
}

export type FileWatchCallback = (event: FileWatchEvent) => void;

// ── IFileSystem Interface ────────────────────────────────────
// Mirrors the Rust FileSystem trait so code written against this
// interface compiles and runs identically on Tauri, web (OPFS),
// and in-memory environments.

export interface IFileSystem {
  // ── Text I/O ──────────────────────────────────────────────
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  /** Append text to a file; creates the file if it does not exist. */
  appendFile(path: string, data: string): Promise<void>;
  /** Write atomically (write-to-temp then rename). Crash-safe. */
  writeFileAtomic(path: string, data: string): Promise<void>;

  // ── Binary I/O ────────────────────────────────────────────
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  /** Write binary atomically. */
  writeBinaryAtomic(path: string, data: ArrayBuffer): Promise<void>;

  // ── Directory ─────────────────────────────────────────────
  readDir(path: string): Promise<DirEntry[]>;
  /** Recursively enumerate all entries under path. */
  walkDir(path: string, opts?: WalkDirOptions): Promise<DirEntry[]>;
  mkdir(path: string): Promise<void>;

  // ── Queries ───────────────────────────────────────────────
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  isDir(path: string): Promise<boolean>;
  stat(path: string): Promise<FileInfo>;
  fileSize(path: string): Promise<number>;

  // ── Mutation ──────────────────────────────────────────────
  delete(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copy(srcPath: string, destPath: string): Promise<void>;

  // ── Watching ──────────────────────────────────────────────
  watch(path: string, callback: FileWatchCallback): Promise<string>;
  unwatch(watchId: string): Promise<void>;

  // ── Dialogs (editor-only, may return null in headless/game) ──
  openFileDialog(filters?: FileDialogFilter[]): Promise<string | null>;
  saveFileDialog(filters?: FileDialogFilter[]): Promise<string | null>;
  openDirDialog(): Promise<string | null>;

  // ── Paths ─────────────────────────────────────────────────
  getAppDataPath(): Promise<string>;
  tempDir(): Promise<string>;

  // ── JSON helpers ──────────────────────────────────────────
  readJson<T = unknown>(path: string): Promise<T>;
  writeJson(path: string, value: unknown): Promise<void>;

  // ── Directory helper ──────────────────────────────────────
  ensureDir(path: string): Promise<void>;
}

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

// ── FileSystemBase ────────────────────────────────────────────
// Abstract base class that provides default implementations for
// all helper methods so concrete classes only override what they
// can do better (e.g. true atomic writes, native walk, etc.).

export abstract class FileSystemBase implements IFileSystem {
  // ── Abstract core — must be implemented ──────────────────
  abstract readFile(path: string): Promise<string>;
  abstract writeFile(path: string, data: string): Promise<void>;
  abstract readBinary(path: string): Promise<ArrayBuffer>;
  abstract writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  abstract readDir(path: string): Promise<DirEntry[]>;
  abstract mkdir(path: string): Promise<void>;
  abstract exists(path: string): Promise<boolean>;
  abstract stat(path: string): Promise<FileInfo>;
  abstract delete(path: string): Promise<void>;
  abstract rename(oldPath: string, newPath: string): Promise<void>;
  abstract copy(srcPath: string, destPath: string): Promise<void>;
  abstract watch(path: string, callback: FileWatchCallback): Promise<string>;
  abstract unwatch(watchId: string): Promise<void>;
  abstract openFileDialog(filters?: FileDialogFilter[]): Promise<string | null>;
  abstract saveFileDialog(filters?: FileDialogFilter[]): Promise<string | null>;
  abstract openDirDialog(): Promise<string | null>;
  abstract getAppDataPath(): Promise<string>;

  // ── Default helper implementations ───────────────────────

  async appendFile(path: string, data: string): Promise<void> {
    const existing = (await this.exists(path)) ? await this.readFile(path) : '';
    await this.writeFile(path, existing + data);
  }

  async writeFileAtomic(path: string, data: string): Promise<void> {
    await this.writeFile(path, data);
  }

  async writeBinaryAtomic(path: string, data: ArrayBuffer): Promise<void> {
    await this.writeBinary(path, data);
  }

  async walkDir(path: string, opts?: WalkDirOptions): Promise<DirEntry[]> {
    const result: DirEntry[] = [];
    await this._walkRecursive(path, 0, opts ?? {}, result);
    return result;
  }

  private async _walkRecursive(
    path: string,
    depth: number,
    opts: WalkDirOptions,
    out: DirEntry[],
  ): Promise<void> {
    const entries = await this.readDir(path);
    for (const e of entries) {
      if (!opts.includeHidden && e.name.startsWith('.')) continue;
      if (!e.isDirectory && opts.filterExtensions?.length) {
        const ext = pathExtension(e.path);
        if (!opts.filterExtensions.includes(ext)) continue;
      }
      out.push(e);
      if (e.isDirectory && opts.recursive !== false) {
        if (opts.maxDepth === undefined || depth < opts.maxDepth) {
          await this._walkRecursive(e.path, depth + 1, opts, out);
        }
      }
    }
  }

  async isFile(path: string): Promise<boolean> {
    try { return !(await this.stat(path)).isDirectory; } catch { return false; }
  }

  async isDir(path: string): Promise<boolean> {
    try { return (await this.stat(path)).isDirectory; } catch { return false; }
  }

  async fileSize(path: string): Promise<number> {
    try { return (await this.stat(path)).size; } catch { return 0; }
  }

  async tempDir(): Promise<string> { return '/tmp'; }

  async readJson<T = unknown>(path: string): Promise<T> {
    return JSON.parse(await this.readFile(path)) as T;
  }

  async writeJson(path: string, value: unknown): Promise<void> {
    await this.writeFileAtomic(path, JSON.stringify(value, null, 2));
  }

  async ensureDir(path: string): Promise<void> {
    if (!(await this.exists(path))) await this.mkdir(path);
  }
}
