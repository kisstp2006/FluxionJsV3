// ============================================================
// FluxionJS V3 — ShaderCache
// Disk-backed JSON cache for compiled visual material shaders.
// Stored at <projectDir>/.fluxcache/shaders/<hash>.json
// Hash is SHA-256 of the raw .fluxvismat JSON content.
// ============================================================

import { type IFileSystem, pathJoin } from '../filesystem';
import { type CompiledVisualMaterial } from './VisualMaterialCompiler';

interface CacheEntry {
  hash: string;
  compiled: SerializedCompiledMaterial;
  timestamp: number;
}

/**
 * Serializable subset of CompiledVisualMaterial.
 * THREE.Texture values are stripped — texturePaths are preserved
 * so callers can reload textures on cache hit.
 */
export interface SerializedCompiledMaterial {
  fragmentCode: string;
  vertexCode: string;
  varyings: string[];
  uniformDeclarations: string[];
  /** Uniform values — only JSON-safe primitives (no Texture objects). */
  uniforms: Record<string, { type: string; value: any }>;
  pbrOutputs: CompiledVisualMaterial['pbrOutputs'];
  texturePaths: Record<string, string>;
  needsTimeUpdate: boolean;
  errors: string[];
}

class ShaderCacheClass {
  private cacheDir: string | null = null;
  private fs: IFileSystem | null = null;
  private mem = new Map<string, CacheEntry>();

  /** Call in ProjectManager.openProject() */
  async init(fs: IFileSystem, projectDir: string): Promise<void> {
    this.fs = fs;
    this.cacheDir = pathJoin(projectDir, '.fluxcache/shaders');
    try {
      const exists = await fs.exists(this.cacheDir);
      if (!exists) await fs.mkdir(this.cacheDir);
    } catch (err) {
      console.warn('[ShaderCache] Could not create cache dir:', err);
      this.cacheDir = null;
    }
  }

  /** Call in ProjectManager.closeProject() */
  close(): void {
    this.fs = null;
    this.cacheDir = null;
    this.mem.clear();
  }

  /**
   * Hash the raw .fluxvismat file content (string).
   * Uses Web Crypto API (available in Electron renderer + modern browsers).
   */
  async hash(content: string): Promise<string> {
    const buf = new TextEncoder().encode(content);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** Read a cached entry by hash. Returns null on miss or error. */
  async get(hash: string): Promise<SerializedCompiledMaterial | null> {
    // in-memory first
    const mem = this.mem.get(hash);
    if (mem) return mem.compiled;

    if (!this.fs || !this.cacheDir) return null;

    const filePath = pathJoin(this.cacheDir, `${hash}.json`);
    try {
      const exists = await this.fs.exists(filePath);
      if (!exists) return null;
      const raw = await this.fs.readFile(filePath);
      const entry: CacheEntry = JSON.parse(raw);
      if (entry.hash !== hash) return null;
      this.mem.set(hash, entry);
      return entry.compiled;
    } catch {
      return null;
    }
  }

  /** Write a compiled result to cache. Silently swallows write errors. */
  async set(hash: string, compiled: CompiledVisualMaterial): Promise<void> {
    const serialized = this._serialize(compiled);
    const entry: CacheEntry = { hash, compiled: serialized, timestamp: Date.now() };
    this.mem.set(hash, entry);

    if (!this.fs || !this.cacheDir) return;
    const filePath = pathJoin(this.cacheDir, `${hash}.json`);
    try {
      await this.fs.writeFile(filePath, JSON.stringify(entry));
    } catch (err) {
      console.warn('[ShaderCache] Failed to write cache entry:', err);
    }
  }

  /** Remove stale cache files older than maxAgeDays. */
  async evict(maxAgeDays = 30): Promise<void> {
    if (!this.fs || !this.cacheDir) return;
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    try {
      const entries = await this.fs.readDir(this.cacheDir);
      await Promise.allSettled(
        entries
          .filter((e) => e.name.endsWith('.json'))
          .map(async (e) => {
            try {
              const raw = await this.fs!.readFile(e.path);
              const entry: CacheEntry = JSON.parse(raw);
              if (entry.timestamp < cutoff) {
                await this.fs!.delete(e.path);
                this.mem.delete(entry.hash);
              }
            } catch {
              // corrupt entry — delete it
              await this.fs!.delete(e.path).catch(() => {});
            }
          }),
      );
    } catch (err) {
      console.warn('[ShaderCache] evict failed:', err);
    }
  }

  private _serialize(compiled: CompiledVisualMaterial): SerializedCompiledMaterial {
    // Strip non-serializable Three.js Texture objects from uniforms
    const uniforms: Record<string, { type: string; value: any }> = {};
    for (const [k, v] of Object.entries(compiled.uniforms)) {
      if (v.value && typeof v.value === 'object' && v.value.isTexture) {
        // keep only the path ref — will be reloaded by caller from texturePaths
        uniforms[k] = { type: v.type, value: null };
      } else {
        uniforms[k] = v;
      }
    }
    return {
      fragmentCode: compiled.fragmentCode,
      vertexCode: compiled.vertexCode,
      varyings: compiled.varyings,
      uniformDeclarations: compiled.uniformDeclarations,
      uniforms,
      pbrOutputs: compiled.pbrOutputs,
      texturePaths: compiled.texturePaths,
      needsTimeUpdate: compiled.needsTimeUpdate,
      errors: compiled.errors,
    };
  }
}

export const ShaderCache = new ShaderCacheClass();
