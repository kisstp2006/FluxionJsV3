// ============================================================
// FluxionJS V3 — Web FileSystem Implementations
//
//  FetchFileSystem  — read-only, HTTP-backed (exported game builds)
//  MemoryFileSystem — volatile in-memory (OPFS-unavailable fallback)
//  OPFSFileSystem   — full OPFS read/write + File System Access API
//                     dialogs (browser editor / browser game saves)
//  WebFileSystem    — smart wrapper; picks the best available impl
// ============================================================

import type {
  IFileSystem,
  FileInfo,
  DirEntry,
  FileWatchCallback,
  FileDialogFilter,
  WalkDirOptions,
} from './FileSystem';
import { FileSystemBase, normalizePath, pathBasename, pathExtension } from './FileSystem';

// ── Shared internal helpers ───────────────────────────────────────────────────

/** Map a project path to a relative HTTP URL for fetch(). */
function toFetchUrl(path: string): string {
  let p = path.replace(/\\/g, '/');
  p = p.replace(/^[A-Za-z]:\//, '');
  p = p.replace(/^\/+/, '');
  return p;
}

function normKey(path: string): string {
  return normalizePath(path).replace(/^\/+/, '');
}

function mapFilters(
  filters?: FileDialogFilter[],
): { description: string; accept: Record<string, string[]> }[] | undefined {
  if (!filters || filters.length === 0) return undefined;
  return filters.map((f) => ({
    description: f.name,
    accept: { '*/*': f.extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)) },
  }));
}

// ── FetchFileSystem ────────────────────────────────────────────────────────────
// Read-only filesystem backed by HTTP GET / HEAD requests.
// Suitable for exported web game builds where assets are static files.

export class FetchFileSystem extends FileSystemBase {
  async readFile(path: string): Promise<string> {
    const resp = await fetch(toFetchUrl(path));
    if (!resp.ok) throw new Error(`FetchFileSystem: cannot read "${path}" (HTTP ${resp.status})`);
    return resp.text();
  }

  async writeFile(_path: string, _data: string): Promise<void> {
    throw new Error('FetchFileSystem: writeFile not supported in a web game build.');
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const resp = await fetch(toFetchUrl(path));
    if (!resp.ok) throw new Error(`FetchFileSystem: cannot read "${path}" (HTTP ${resp.status})`);
    return resp.arrayBuffer();
  }

  async writeBinary(_path: string, _data: ArrayBuffer): Promise<void> {
    throw new Error('FetchFileSystem: writeBinary not supported in a web game build.');
  }

  async readDir(_path: string): Promise<DirEntry[]> { return []; }
  async mkdir(_path: string): Promise<void> {}

  async exists(path: string): Promise<boolean> {
    try {
      const resp = await fetch(toFetchUrl(path), { method: 'HEAD' });
      return resp.ok;
    } catch { return false; }
  }

  async stat(path: string): Promise<FileInfo> {
    const resp = await fetch(toFetchUrl(path), { method: 'HEAD' });
    if (!resp.ok) throw new Error(`FetchFileSystem: stat failed for "${path}"`);
    const name = pathBasename(path);
    return {
      name,
      path: normalizePath(path),
      size: Number(resp.headers.get('content-length') ?? 0),
      isDirectory: false,
      extension: pathExtension(path),
      modifiedAt: resp.headers.get('last-modified')
        ? new Date(resp.headers.get('last-modified')!).getTime() : 0,
    };
  }

  async delete(_p: string): Promise<void> { throw new Error('FetchFileSystem: delete not supported.'); }
  async rename(_o: string, _n: string): Promise<void> { throw new Error('FetchFileSystem: rename not supported.'); }
  async copy(_s: string, _d: string): Promise<void> { throw new Error('FetchFileSystem: copy not supported.'); }

  async watch(_path: string, _cb: FileWatchCallback): Promise<string> { return ''; }
  async unwatch(_id: string): Promise<void> {}

  async openFileDialog(_f?: FileDialogFilter[]): Promise<string | null> { return null; }
  async saveFileDialog(_f?: FileDialogFilter[]): Promise<string | null> { return null; }
  async openDirDialog(): Promise<string | null> { return null; }
  async getAppDataPath(): Promise<string> { return '/'; }
  override async isDir(_path: string): Promise<boolean> { return false; }
  override async tempDir(): Promise<string> { return '/'; }
}

// ── MemoryFileSystem ──────────────────────────────────────────────────────────
// Volatile in-memory storage. Data is lost on page reload.
// Used as fallback when OPFS is unavailable.

interface MemEntry { data: Uint8Array; mtime: number; }

export class MemoryFileSystem extends FileSystemBase {
  private _files = new Map<string, MemEntry>();
  private _dirs  = new Set<string>(['']);

  private _key(path: string): string { return normKey(path); }

  private _ensureParents(key: string): void {
    const parts = key.split('/');
    for (let i = 1; i < parts.length; i++) {
      this._dirs.add(parts.slice(0, i).join('/'));
    }
  }

  async readFile(path: string): Promise<string> {
    const e = this._files.get(this._key(path));
    if (!e) throw new Error(`MemoryFileSystem: not found: ${path}`);
    return new TextDecoder().decode(e.data);
  }

  async writeFile(path: string, data: string): Promise<void> {
    const key = this._key(path);
    this._ensureParents(key);
    this._files.set(key, { data: new TextEncoder().encode(data), mtime: Date.now() });
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const e = this._files.get(this._key(path));
    if (!e) throw new Error(`MemoryFileSystem: not found: ${path}`);
    return e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const key = this._key(path);
    this._ensureParents(key);
    this._files.set(key, { data: new Uint8Array(data), mtime: Date.now() });
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const prefix = this._key(path);
    const result: DirEntry[] = [];
    const seen = new Set<string>();
    const check = (k: string, isDir: boolean) => {
      if (!k.startsWith(prefix === '' ? '' : prefix + '/')) return;
      const rest = k.slice(prefix === '' ? 0 : prefix.length + 1);
      if (!rest || rest.includes('/')) return;
      if (seen.has(rest)) return;
      seen.add(rest);
      result.push({ name: rest, path: normalizePath(`${path}/${rest}`), isDirectory: isDir });
    };
    for (const k of this._dirs) check(k, true);
    for (const k of this._files.keys()) check(k, false);
    return result;
  }

  async mkdir(path: string): Promise<void> {
    const parts = this._key(path).split('/');
    for (let i = 1; i <= parts.length; i++) {
      this._dirs.add(parts.slice(0, i).join('/'));
    }
  }

  async exists(path: string): Promise<boolean> {
    const k = this._key(path);
    return this._files.has(k) || this._dirs.has(k);
  }

  async stat(path: string): Promise<FileInfo> {
    const k = this._key(path);
    const name = pathBasename(path);
    if (this._files.has(k)) {
      const e = this._files.get(k)!;
      return { name, path: normalizePath(path), size: e.data.byteLength,
               isDirectory: false, extension: pathExtension(path), modifiedAt: e.mtime };
    }
    if (this._dirs.has(k)) {
      return { name, path: normalizePath(path), size: 0,
               isDirectory: true, extension: '', modifiedAt: 0 };
    }
    throw new Error(`MemoryFileSystem: not found: ${path}`);
  }

  async delete(path: string): Promise<void> {
    const k = this._key(path);
    this._files.delete(k);
    this._dirs.delete(k);
    const prefix = k + '/';
    for (const fk of [...this._files.keys()]) if (fk.startsWith(prefix)) this._files.delete(fk);
    for (const dk of [...this._dirs])         if (dk.startsWith(prefix)) this._dirs.delete(dk);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.copy(oldPath, newPath);
    await this.delete(oldPath);
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const srcStat = await this.stat(srcPath);
    if (srcStat.isDirectory) {
      await this.mkdir(destPath);
      for (const e of await this.readDir(srcPath))
        await this.copy(e.path, normalizePath(`${destPath}/${e.name}`));
    } else {
      await this.writeBinary(destPath, await this.readBinary(srcPath));
    }
  }

  async watch(_path: string, _cb: FileWatchCallback): Promise<string> { return ''; }
  async unwatch(_id: string): Promise<void> {}

  override async appendFile(path: string, data: string): Promise<void> {
    const key = this._key(path);
    this._ensureParents(key);
    const existing = this._files.get(key);
    const enc = new TextEncoder(); const dec = new TextDecoder();
    const combined = enc.encode((existing ? dec.decode(existing.data) : '') + data);
    this._files.set(key, { data: combined, mtime: Date.now() });
  }

  override async isFile(path: string): Promise<boolean> { return this._files.has(this._key(path)); }
  override async isDir(path: string): Promise<boolean>  { return this._dirs.has(this._key(path)); }
  override async fileSize(path: string): Promise<number> { return this._files.get(this._key(path))?.data.byteLength ?? 0; }
  override async tempDir(): Promise<string> { return '/memory/__tmp__'; }

  async openFileDialog(_f?: FileDialogFilter[]): Promise<string | null> { return null; }
  async saveFileDialog(_f?: FileDialogFilter[]): Promise<string | null> { return null; }
  async openDirDialog(): Promise<string | null> { return null; }
  async getAppDataPath(): Promise<string> { return '/memory'; }
}

// ── OPFSFileSystem ────────────────────────────────────────────────────────────
// Full read/write filesystem backed by the browser's Origin Private File System.
// Opens native file/directory dialogs via the File System Access API.
// Supported in Chrome 86+, Firefox 111+, Safari 15.2+.

interface WatchState {
  path: string;
  callback: FileWatchCallback;
  timer: ReturnType<typeof setInterval>;
  snapshot: Map<string, number>;
}

export class OPFSFileSystem extends FileSystemBase {
  private _rootOverride: FileSystemDirectoryHandle | null = null;
  private _exportHandles = new Map<string, FileSystemFileHandle>();

  private _root(): Promise<FileSystemDirectoryHandle> {
    if (this._rootOverride) return Promise.resolve(this._rootOverride);
    return navigator.storage.getDirectory();
  }

  /** Navigate to the parent dir + filename for a given path. */
  private async _nav(
    path: string,
    create = false,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const parts = normKey(path).split('/').filter(Boolean);
    if (parts.length === 0) throw new Error(`OPFSFileSystem: invalid path "${path}"`);
    let dir = await this._root();
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create });
    }
    return { dir, name: parts[parts.length - 1] };
  }

  /** Navigate to a directory handle for the given path. */
  private async _navDir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    const parts = normKey(path).split('/').filter(Boolean);
    let dir = await this._root();
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create });
    }
    return dir;
  }

  // ── Text I/O ────────────────────────────────────────────────────────

  async readFile(path: string): Promise<string> {
    const { dir, name } = await this._nav(path);
    const handle = await dir.getFileHandle(name);
    return (await handle.getFile()).text();
  }

  async writeFile(path: string, data: string): Promise<void> {
    const exportHandle = this._exportHandles.get(normKey(path));
    if (exportHandle) {
      const w = await exportHandle.createWritable();
      await w.write(data); await w.close(); return;
    }
    const { dir, name } = await this._nav(path, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(data); await w.close();
  }

  // ── Binary I/O ──────────────────────────────────────────────────────

  async readBinary(path: string): Promise<ArrayBuffer> {
    const { dir, name } = await this._nav(path);
    const handle = await dir.getFileHandle(name);
    return (await handle.getFile()).arrayBuffer();
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const exportHandle = this._exportHandles.get(normKey(path));
    if (exportHandle) {
      const w = await exportHandle.createWritable();
      await w.write(data); await w.close(); return;
    }
    const { dir, name } = await this._nav(path, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(data); await w.close();
  }

  // ── Directory ────────────────────────────────────────────────────────

  async readDir(path: string): Promise<DirEntry[]> {
    const dir = await this._navDir(path);
    const result: DirEntry[] = [];
    for await (const [name, handle] of (dir as any).entries()) {
      result.push({
        name,
        path: normalizePath(`${normKey(path)}/${name}`),
        isDirectory: handle.kind === 'directory',
      });
    }
    return result;
  }

  async mkdir(path: string): Promise<void> {
    await this._navDir(path, true);
  }

  // ── Queries ──────────────────────────────────────────────────────────

  async exists(path: string): Promise<boolean> {
    try {
      const { dir, name } = await this._nav(path);
      try { await dir.getFileHandle(name); return true; } catch { /* not a file */ }
      try { await dir.getDirectoryHandle(name); return true; } catch { /* not a dir */ }
      return false;
    } catch { return false; }
  }

  async stat(path: string): Promise<FileInfo> {
    const { dir, name } = await this._nav(path);
    const baseName = pathBasename(path);
    try {
      const fh = await dir.getFileHandle(name);
      const file = await fh.getFile();
      return {
        name: baseName,
        path: normalizePath(path),
        size: file.size,
        isDirectory: false,
        extension: pathExtension(path),
        modifiedAt: file.lastModified,
      };
    } catch {
      await dir.getDirectoryHandle(name);
      return { name: baseName, path: normalizePath(path), size: 0,
               isDirectory: true, extension: '', modifiedAt: 0 };
    }
  }

  // ── Mutation ─────────────────────────────────────────────────────────

  async delete(path: string): Promise<void> {
    const { dir, name } = await this._nav(path);
    await dir.removeEntry(name, { recursive: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.copy(oldPath, newPath);
    await this.delete(oldPath);
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const srcStat = await this.stat(srcPath);
    if (srcStat.isDirectory) {
      await this.mkdir(destPath);
      for (const e of await this.readDir(srcPath))
        await this.copy(e.path, normalizePath(`${destPath}/${e.name}`));
    } else {
      await this.writeBinary(destPath, await this.readBinary(srcPath));
    }
  }

  // ── Watching (polling) ───────────────────────────────────────────────

  private _watchers = new Map<string, WatchState>();

  private async _snapshot(path: string, out: Map<string, number>): Promise<void> {
    try {
      const entries = await this.readDir(path);
      for (const e of entries) {
        if (e.isDirectory) {
          await this._snapshot(e.path, out);
        } else {
          try {
            const s = await this.stat(e.path);
            out.set(e.path, s.modifiedAt);
          } catch {}
        }
      }
    } catch {}
  }

  private _diff(
    path: string,
    prev: Map<string, number>,
    next: Map<string, number>,
    cb: FileWatchCallback,
  ): void {
    for (const [p, t] of next) {
      if (!prev.has(p)) cb({ type: 'create', path });
      else if (prev.get(p) !== t) cb({ type: 'change', path: p });
    }
    for (const p of prev.keys()) {
      if (!next.has(p)) cb({ type: 'delete', path: p });
    }
  }

  async watch(path: string, callback: FileWatchCallback): Promise<string> {
    const id = crypto.randomUUID();
    const snapshot = new Map<string, number>();
    await this._snapshot(path, snapshot);
    const timer = setInterval(async () => {
      const next = new Map<string, number>();
      await this._snapshot(path, next);
      this._diff(path, snapshot, next, callback);
      snapshot.clear();
      for (const [k, v] of next) snapshot.set(k, v);
    }, 1000);
    this._watchers.set(id, { path, callback, timer, snapshot });
    return id;
  }

  async unwatch(id: string): Promise<void> {
    const w = this._watchers.get(id);
    if (w) { clearInterval(w.timer); this._watchers.delete(id); }
  }

  // ── Dialogs (File System Access API) ─────────────────────────────────

  async openFileDialog(filters?: FileDialogFilter[]): Promise<string | null> {
    if (!('showOpenFilePicker' in window)) return null;
    try {
      const [handle]: FileSystemFileHandle[] =
        await (window as any).showOpenFilePicker({ types: mapFilters(filters), multiple: false });
      const file = await handle.getFile();
      const importPath = `__imports__/${handle.name}`;
      await this.writeBinary(importPath, await file.arrayBuffer());
      return '/' + importPath;
    } catch { return null; }
  }

  async saveFileDialog(filters?: FileDialogFilter[]): Promise<string | null> {
    if (!('showSaveFilePicker' in window)) return null;
    try {
      const handle: FileSystemFileHandle =
        await (window as any).showSaveFilePicker({ types: mapFilters(filters) });
      const virtualPath = `__exports__/${handle.name}`;
      this._exportHandles.set(virtualPath, handle);
      return '/' + virtualPath;
    } catch { return null; }
  }

  async openDirDialog(): Promise<string | null> {
    if (!('showDirectoryPicker' in window)) return null;
    try {
      const handle: FileSystemDirectoryHandle =
        await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      this._rootOverride = handle;
      return '/';
    } catch { return null; }
  }

  // ── Paths ────────────────────────────────────────────────────────────

  async getAppDataPath(): Promise<string> {
    return this._rootOverride ? '/' : '/opfs';
  }

  override async appendFile(path: string, data: string): Promise<void> {
    const existing = (await this.exists(path)) ? await this.readFile(path) : '';
    await this.writeFile(path, existing + data);
  }

  override async writeFileAtomic(path: string, data: string): Promise<void> {
    return this.writeFile(path, data);
  }

  override async writeBinaryAtomic(path: string, data: ArrayBuffer): Promise<void> {
    return this.writeBinary(path, data);
  }

  override async walkDir(path: string, opts?: WalkDirOptions): Promise<DirEntry[]> {
    const result: DirEntry[] = [];
    await this._opfsWalk(path, 0, opts ?? {}, result);
    return result;
  }

  private async _opfsWalk(path: string, depth: number, opts: WalkDirOptions, out: DirEntry[]): Promise<void> {
    const entries = await this.readDir(path);
    for (const e of entries) {
      if (!opts.includeHidden && e.name.startsWith('.')) continue;
      if (!e.isDirectory && opts.filterExtensions?.length) {
        if (!opts.filterExtensions.includes(pathExtension(e.path))) continue;
      }
      out.push(e);
      if (e.isDirectory && opts.recursive !== false) {
        if (opts.maxDepth === undefined || depth < opts.maxDepth)
          await this._opfsWalk(e.path, depth + 1, opts, out);
      }
    }
  }

  override async tempDir(): Promise<string> {
    return this._rootOverride ? '/__tmp__' : '/opfs/__tmp__';
  }
}

// ── WebFileSystem — smart wrapper ─────────────────────────────────────────────
// Selects the best available implementation at construction time.
//
//  mode 'game'   → FetchFileSystem  (read-only HTTP assets)
//  mode 'editor' → OPFSFileSystem   (if supported), else MemoryFileSystem

export type WebFsMode = 'game' | 'editor';

export class WebFileSystem extends FileSystemBase {
  private _inner: FileSystemBase;

  /** True when the full OPFS API is available in this browser. */
  static isOPFSSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof (navigator.storage as any)?.getDirectory === 'function'
    );
  }

  constructor(mode: WebFsMode = 'game') {
    super();
    if (mode === 'editor') {
      this._inner = WebFileSystem.isOPFSSupported()
        ? new OPFSFileSystem()
        : new MemoryFileSystem();
    } else {
      this._inner = new FetchFileSystem();
    }
  }

  readFile(p: string)                              { return this._inner.readFile(p); }
  writeFile(p: string, d: string)                  { return this._inner.writeFile(p, d); }
  readBinary(p: string)                            { return this._inner.readBinary(p); }
  writeBinary(p: string, d: ArrayBuffer)           { return this._inner.writeBinary(p, d); }
  readDir(p: string)                               { return this._inner.readDir(p); }
  mkdir(p: string)                                 { return this._inner.mkdir(p); }
  exists(p: string)                                { return this._inner.exists(p); }
  stat(p: string)                                  { return this._inner.stat(p); }
  delete(p: string)                                { return this._inner.delete(p); }
  rename(o: string, n: string)                     { return this._inner.rename(o, n); }
  copy(s: string, d: string)                       { return this._inner.copy(s, d); }
  watch(p: string, cb: FileWatchCallback)          { return this._inner.watch(p, cb); }
  unwatch(id: string)                              { return this._inner.unwatch(id); }
  openFileDialog(f?: FileDialogFilter[])           { return this._inner.openFileDialog(f); }
  saveFileDialog(f?: FileDialogFilter[])           { return this._inner.saveFileDialog(f); }
  openDirDialog()                                  { return this._inner.openDirDialog(); }
  getAppDataPath()                                 { return this._inner.getAppDataPath(); }
  override appendFile(p: string, d: string)        { return this._inner.appendFile(p, d); }
  override writeFileAtomic(p: string, d: string)   { return this._inner.writeFileAtomic(p, d); }
  override writeBinaryAtomic(p: string, d: ArrayBuffer) { return this._inner.writeBinaryAtomic(p, d); }
  override walkDir(p: string, o?: WalkDirOptions)  { return this._inner.walkDir(p, o); }
  override isFile(p: string)                       { return this._inner.isFile(p); }
  override isDir(p: string)                        { return this._inner.isDir(p); }
  override fileSize(p: string)                     { return this._inner.fileSize(p); }
  override tempDir()                               { return this._inner.tempDir(); }
  override readJson<T>(p: string)                  { return this._inner.readJson<T>(p); }
  override writeJson(p: string, v: unknown)        { return this._inner.writeJson(p, v); }
  override ensureDir(p: string)                    { return this._inner.ensureDir(p); }
}
