// ============================================================
// FluxionJS V3 — AnimationClipCache
// Reads embedded animation clip names from .fluxmesh sidecars
// (generated at import time) without re-loading the source model.
// Falls back to loading the raw model if no sidecar exists.
// Results are cached in-memory for the session.
// ============================================================

import { getFileSystem } from '../../src/filesystem';
import { toLocalUrl } from '../../src/utils/localUrl';

/** absPath → clip names (empty array = no animations / load failed) */
const _cache = new Map<string, string[]>();
/** absPath → in-flight promise */
const _pending = new Map<string, Promise<string[]>>();

/**
 * Return cached clip names synchronously, or undefined if not yet loaded.
 * Use `loadAnimClipsFor` to trigger a load.
 */
export function getCachedAnimClips(absPath: string): string[] | undefined {
  return _cache.get(absPath);
}

/**
 * Asynchronously resolve the animation clip names for a model / fluxmesh file.
 * Results are cached; concurrent calls for the same path share one promise.
 */
export async function loadAnimClipsFor(absPath: string, filename: string): Promise<string[]> {
  if (_cache.has(absPath)) return _cache.get(absPath)!;
  if (_pending.has(absPath)) return _pending.get(absPath)!;

  const p = _resolve(absPath, filename);
  _pending.set(absPath, p);
  p.finally(() => _pending.delete(absPath));
  return p;
}

/** Evict a cached entry (call after a model reimport). */
export function invalidateAnimClipCache(absPath: string): void {
  _cache.delete(absPath);
}

// ── Internal ──────────────────────────────────────────────────

async function _resolve(absPath: string, filename: string): Promise<string[]> {
  try {
    const fs = getFileSystem();
    let fluxmeshPath: string;

    if (filename.toLowerCase().endsWith('.fluxmesh')) {
      fluxmeshPath = absPath;
    } else {
      // Look for the generated .fluxmesh sidecar next to the source model
      const slash = Math.max(absPath.lastIndexOf('/'), absPath.lastIndexOf('\\'));
      const dir   = absPath.substring(0, slash);
      const base  = filename.replace(/\.[^.]+$/, '');
      fluxmeshPath = `${dir}/${base}.fluxmesh`;
    }

    if (!(await fs.exists(fluxmeshPath))) {
      // No sidecar — try reading the raw model via dynamic import of loaders
      const clips = await _loadDirectFromModel(absPath, filename);
      _cache.set(absPath, clips);
      return clips;
    }

    const text = await fs.readFile(fluxmeshPath);
    const data = JSON.parse(text);
    const clips: string[] = Array.isArray(data.animationClips) ? data.animationClips : [];
    _cache.set(absPath, clips);
    return clips;
  } catch {
    _cache.set(absPath, []);
    return [];
  }
}

async function _loadDirectFromModel(absPath: string, filename: string): Promise<string[]> {
  const ext     = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  const fileUrl = toLocalUrl(absPath);
  const names: string[] = [];

  try {
    if (ext === '.fbx') {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const root = await new Promise<any>((res, rej) => new FBXLoader().load(fileUrl, res, undefined, rej));
      _collectClipNames(root, names);
    } else if (ext === '.glb' || ext === '.gltf') {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new Promise<any>((res, rej) => new GLTFLoader().load(fileUrl, res, undefined, rej));
      if (Array.isArray(gltf.animations)) {
        for (const c of gltf.animations) if (c.name) names.push(c.name);
      }
      _collectClipNames(gltf.scene, names);
    }
  } catch { /* loader failed — return empty */ }

  return [...new Set(names)];
}

function _collectClipNames(root: any, out: string[]): void {
  if (!root) return;
  if (Array.isArray(root.animations)) {
    for (const c of root.animations) if (c?.name) out.push(c.name);
  }
  root.traverse?.((child: any) => {
    if (Array.isArray(child.animations)) {
      for (const c of child.animations) if (c?.name && !out.includes(c.name)) out.push(c.name);
    }
  });
}
