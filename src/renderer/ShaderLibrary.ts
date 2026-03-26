// ============================================================
// FluxionJS V3 — ShaderLibrary
// Singleton registry for built-in post-processing shaders.
// Supports hot-reload via IFileSystem.watch() in dev mode.
// PostProcessing subscribes via onShaderChanged() to swap
// materials at runtime without full re-init.
// ============================================================

import { type IFileSystem } from '../filesystem';

export type ShaderChangedCallback = (name: string, source: string) => void;

interface ShaderEntry {
  source: string;
  filePath?: string;
  watchId?: string;
}

class ShaderLibraryClass {
  private entries = new Map<string, ShaderEntry>();
  private listeners = new Map<string, Set<ShaderChangedCallback>>();
  private fs: IFileSystem | null = null;
  private devMode = false;

  /**
   * Call once at engine startup (dev mode only) to enable file watching.
   * Pass `null` to disable watching (production builds).
   */
  init(fs: IFileSystem | null, devMode: boolean): void {
    this.fs = fs;
    this.devMode = devMode;
  }

  /**
   * Register a built-in shader by name.
   * @param name  Unique shader name, e.g. "ssr", "ssao_blur"
   * @param source  GLSL source string (from webpack asset/source import)
   * @param filePath  Optional on-disk path for file watching in dev mode
   */
  register(name: string, source: string, filePath?: string): void {
    const existing = this.entries.get(name);
    if (existing?.watchId) {
      this.fs?.unwatch(existing.watchId).catch(() => {});
    }
    this.entries.set(name, { source, filePath });

    if (this.devMode && this.fs && filePath) {
      this.fs.watch(filePath, (event) => {
        if (event.type === 'change') {
          this.fs!.readFile(filePath).then((newSource) => {
            this.hotReload(name, newSource);
          }).catch((err) => {
            console.warn(`[ShaderLibrary] Failed to read ${filePath} on change:`, err);
          });
        }
      }).then((watchId) => {
        const entry = this.entries.get(name);
        if (entry) entry.watchId = watchId;
      }).catch((err) => {
        console.warn(`[ShaderLibrary] Failed to watch ${filePath}:`, err);
      });
    }
  }

  /** Get the current GLSL source for a shader, or undefined if not registered. */
  get(name: string): string | undefined {
    return this.entries.get(name)?.source;
  }

  /**
   * Hot-swap a shader source.
   * Returns true on success; on any error, keeps the old source and returns false.
   */
  hotReload(name: string, newSource: string): boolean {
    const entry = this.entries.get(name);
    if (!entry) return false;
    if (!newSource || newSource.trim().length === 0) {
      console.warn(`[ShaderLibrary] hotReload: empty source for "${name}", keeping old.`);
      return false;
    }
    const old = entry.source;
    entry.source = newSource;
    try {
      this._notify(name, newSource);
      return true;
    } catch (err) {
      console.error(`[ShaderLibrary] hotReload: listener threw for "${name}", reverting.`, err);
      entry.source = old;
      return false;
    }
  }

  /**
   * Subscribe to changes for a specific shader.
   * Returns an unsubscribe function.
   */
  onShaderChanged(name: string, callback: ShaderChangedCallback): () => void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name)!.add(callback);
    return () => {
      this.listeners.get(name)?.delete(callback);
    };
  }

  /** Stop all file watchers (call on engine shutdown or hot-reload disable). */
  async dispose(): Promise<void> {
    if (!this.fs) return;
    for (const entry of this.entries.values()) {
      if (entry.watchId) {
        await this.fs.unwatch(entry.watchId).catch(() => {});
        entry.watchId = undefined;
      }
    }
  }

  private _notify(name: string, source: string): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const cb of set) cb(name, source);
  }
}

export const ShaderLibrary = new ShaderLibraryClass();
