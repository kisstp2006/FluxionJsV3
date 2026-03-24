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

// ── Directory Entry (lightweight, returned by readDir) ───────

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

// ── File Watch Events ────────────────────────────────────────

export type FileWatchEventType = 'create' | 'change' | 'delete';

export interface FileWatchEvent {
  type: FileWatchEventType;
  path: string;
}

export type FileWatchCallback = (event: FileWatchEvent) => void;

// ── IFileSystem Interface ────────────────────────────────────

export interface IFileSystem {
  // ── Text I/O ──
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;

  // ── Binary I/O ──
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;

  // ── Directory ──
  readDir(path: string): Promise<DirEntry[]>;
  mkdir(path: string): Promise<void>;

  // ── Queries ──
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileInfo>;

  // ── Mutation ──
  delete(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copy(srcPath: string, destPath: string): Promise<void>;

  // ── Watching ──
  watch(path: string, callback: FileWatchCallback): Promise<string>;   // returns watchId
  unwatch(watchId: string): Promise<void>;

  // ── Dialogs (editor-only, may throw in headless) ──
  openFileDialog(filters?: FileDialogFilter[]): Promise<string | null>;
  saveFileDialog(filters?: FileDialogFilter[]): Promise<string | null>;
  openDirDialog(): Promise<string | null>;

  // ── Paths ──
  getAppDataPath(): Promise<string>;
}

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}
