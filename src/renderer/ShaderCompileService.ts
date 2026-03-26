// ============================================================
// FluxionJS V3 — ShaderCompileService
// WickedEngine-style engine startup shader compilation.
//
// Responsibilities:
//  1. Register all built-in post-processing shaders into ShaderLibrary
//     at engine INIT (synchronous — webpack bundled strings).
//  2. At project open: scan all .fluxvismat files, hash each one,
//     compile if stale/missing, store result in ShaderCache.
//     Uses Promise.allSettled so one bad material doesn't block others.
//  3. Dev mode: ShaderLibrary watches .glsl files via IFileSystem.watch().
// ============================================================

import { type IFileSystem, getFileSystem, pathJoin } from '../filesystem';
import { ShaderLibrary } from './ShaderLibrary';
import { ShaderCache } from '../materials/ShaderCache';
import { compileVisualMaterial } from '../materials/VisualMaterialCompiler';
import { type VisualMaterialFile } from '../materials/VisualMaterialGraph';

// ── Webpack bundled .glsl imports ────────────────────────────
import vertexSrc from './shaders/vertex.glsl';
import bloomBrightSrc from './shaders/bloom_bright.frag.glsl';
import blurSrc from './shaders/blur.frag.glsl';
import bloomDownSrc from './shaders/bloom_down.frag.glsl';
import bloomUpSrc from './shaders/bloom_up.frag.glsl';
import dofCocSrc from './shaders/dof_coc.frag.glsl';
import dofBlurSrc from './shaders/dof_blur.frag.glsl';
import compositeSrc from './shaders/composite.frag.glsl';
import ssaoSrc from './shaders/ssao.frag.glsl';
import ssaoBlurSrc from './shaders/ssao_blur.frag.glsl';
import ssrSrc from './shaders/ssr.frag.glsl';
import ssgiSrc from './shaders/ssgi.frag.glsl';
import ssgiBlurSrc from './shaders/ssgi_blur.frag.glsl';
import ssgiUpscaleSrc from './shaders/ssgi_upscale.frag.glsl';
import cloudSrc from './shaders/cloud.frag.glsl';

// ── Dev-mode file paths (only used when watching is active) ──
// These are resolved relative to the source tree at dev time.
// In production (bundled) the file watcher is disabled.
const SHADER_FILES: Array<{ name: string; src: string; devPath: string }> = [
  { name: 'vertex',        src: vertexSrc,       devPath: 'src/renderer/shaders/vertex.glsl' },
  { name: 'bloom_bright',  src: bloomBrightSrc,  devPath: 'src/renderer/shaders/bloom_bright.frag.glsl' },
  { name: 'blur',          src: blurSrc,          devPath: 'src/renderer/shaders/blur.frag.glsl' },
  { name: 'bloom_down',    src: bloomDownSrc,    devPath: 'src/renderer/shaders/bloom_down.frag.glsl' },
  { name: 'bloom_up',      src: bloomUpSrc,      devPath: 'src/renderer/shaders/bloom_up.frag.glsl' },
  { name: 'dof_coc',       src: dofCocSrc,       devPath: 'src/renderer/shaders/dof_coc.frag.glsl' },
  { name: 'dof_blur',      src: dofBlurSrc,      devPath: 'src/renderer/shaders/dof_blur.frag.glsl' },
  { name: 'composite',     src: compositeSrc,    devPath: 'src/renderer/shaders/composite.frag.glsl' },
  { name: 'ssao',          src: ssaoSrc,          devPath: 'src/renderer/shaders/ssao.frag.glsl' },
  { name: 'ssao_blur',     src: ssaoBlurSrc,     devPath: 'src/renderer/shaders/ssao_blur.frag.glsl' },
  { name: 'ssr',           src: ssrSrc,           devPath: 'src/renderer/shaders/ssr.frag.glsl' },
  { name: 'ssgi',          src: ssgiSrc,          devPath: 'src/renderer/shaders/ssgi.frag.glsl' },
  { name: 'ssgi_blur',     src: ssgiBlurSrc,     devPath: 'src/renderer/shaders/ssgi_blur.frag.glsl' },
  { name: 'ssgi_upscale',  src: ssgiUpscaleSrc,  devPath: 'src/renderer/shaders/ssgi_upscale.frag.glsl' },
  { name: 'cloud',         src: cloudSrc,         devPath: 'src/renderer/shaders/cloud.frag.glsl' },
];

// ── ShaderCompileService ─────────────────────────────────────

class ShaderCompileServiceClass {

  /**
   * Register built-in shaders into ShaderLibrary.
   * Call this synchronously at engine INIT (before the render loop).
   *
   * @param devMode   true in development — enables IFileSystem.watch() hot reload
   * @param projectRoot  Absolute path to the project root (needed for dev file paths).
   *                     Only used when devMode is true.
   */
  registerBuiltins(devMode: boolean, projectRoot?: string): void {
    const fs = devMode ? this._tryGetFs() : null;
    ShaderLibrary.init(fs, devMode);

    for (const { name, src, devPath } of SHADER_FILES) {
      const absPath =
        devMode && projectRoot ? pathJoin(projectRoot, devPath) : undefined;
      ShaderLibrary.register(name, src, absPath);
    }

    if (devMode) {
      console.log('[ShaderCompileService] Built-in shaders registered (dev + file watch).');
    } else {
      console.log('[ShaderCompileService] Built-in shaders registered (production).');
    }
  }

  /**
   * Scan all .fluxvismat files in the project and precompile any that are
   * stale or missing from ShaderCache.
   *
   * Safe to call at project open — does NOT throw.
   */
  async precompileVisualMaterials(projectDir: string): Promise<void> {
    const fs = this._tryGetFs();
    if (!fs) return;

    let files: string[];
    try {
      files = await this._findFluxvismats(fs, pathJoin(projectDir, 'Assets'));
    } catch {
      return;
    }

    if (files.length === 0) return;

    console.log(`[ShaderCompileService] Precompiling ${files.length} visual material(s)...`);

    const results = await Promise.allSettled(
      files.map((filePath) => this._compileOne(fs, filePath)),
    );

    let ok = 0;
    let fail = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') ok++;
      else {
        fail++;
        console.warn('[ShaderCompileService] Precompile failed:', r.reason);
      }
    }

    console.log(`[ShaderCompileService] Precompile done — ${ok} ok, ${fail} failed.`);
  }

  /** Stop file watchers and free resources. */
  async dispose(): Promise<void> {
    await ShaderLibrary.dispose();
  }

  // ── Private helpers ──────────────────────────────────────────

  private async _compileOne(fs: IFileSystem, filePath: string): Promise<void> {
    const raw = await fs.readFile(filePath);
    const hash = await ShaderCache.hash(raw);

    const cached = await ShaderCache.get(hash);
    if (cached) return; // still fresh

    let parsed: VisualMaterialFile;
    try {
      parsed = JSON.parse(raw) as VisualMaterialFile;
    } catch (err) {
      throw new Error(`Parse error in ${filePath}: ${err}`);
    }

    const compiled = compileVisualMaterial(parsed.graph);
    await ShaderCache.set(hash, compiled);
  }

  private async _findFluxvismats(fs: IFileSystem, dir: string): Promise<string[]> {
    const out: string[] = [];
    const exists = await fs.exists(dir).catch(() => false);
    if (!exists) return out;

    const entries = await fs.readDir(dir);
    await Promise.all(
      entries.map(async (e) => {
        if (e.isDirectory) {
          const sub = await this._findFluxvismats(fs, e.path);
          out.push(...sub);
        } else if (e.name.endsWith('.fluxvismat')) {
          out.push(e.path);
        }
      }),
    );
    return out;
  }

  private _tryGetFs(): IFileSystem | null {
    try {
      return getFileSystem();
    } catch {
      return null;
    }
  }
}

export const ShaderCompileService = new ShaderCompileServiceClass();
