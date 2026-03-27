// ============================================================
// FluxionJS V3 — SvgLoader
// Loads SVG files and rasterises them to Canvas / Three.js textures.
// Supports colour tinting via CSS 'source-in' compositing.
//
// Usage:
//   const tex = await SvgLoader.createTexture(absPath, 256, '#ff4444');
//   sprite.spriteTexture = tex;
// ============================================================

import * as THREE from 'three';
import { DebugConsole } from '../core/DebugConsole';

// ── Internal caches ──────────────────────────────────────────

/** Loaded HTMLImageElement instances, keyed by absolute path. */
const _imageCache = new Map<string, HTMLImageElement>();

/** THREE.CanvasTexture instances, keyed by `${absPath}:${size}:${tint}`. */
const _textureCache = new Map<string, THREE.CanvasTexture>();

function _texKey(absPath: string, size: number, tint: string | undefined): string {
  return `${absPath}:${size}:${tint ?? ''}`;
}

// ── Core helpers ─────────────────────────────────────────────

/**
 * Load an SVG file from a local absolute path as an HTMLImageElement.
 * The result is cached — repeated calls with the same path are free.
 *
 * @param absPath  Absolute file-system path, e.g. `C:/Project/Assets/arrow.svg`
 *                 (forward- or backslash, with or without `file://` prefix)
 */
async function loadSvgImage(absPath: string): Promise<HTMLImageElement> {
  const cached = _imageCache.get(absPath);
  if (cached) return cached;

  // Normalise to a file:// URL that the browser's Image loader accepts.
  const url = absPath.startsWith('file://') ? absPath : `file:///${absPath.replace(/\\/g, '/')}`;

  const img = new Image();
  // Allow cross-origin loading from local filesystem in Electron.
  img.crossOrigin = 'anonymous';
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`SvgLoader: failed to load "${absPath}"`));
  });

  _imageCache.set(absPath, img);
  return img;
}

/**
 * Rasterise a loaded SVG image into a new HTMLCanvasElement at the given size.
 * Optionally applies a flat colour tint using CSS `source-in` compositing so
 * the icon shape is preserved but filled with a single colour.
 *
 * @param img    An already-loaded HTMLImageElement (from `loadSvgImage`).
 * @param width  Target canvas width in pixels.
 * @param height Target canvas height in pixels.
 * @param tint   Optional CSS colour string, e.g. `'#ffffff'` or `'rgba(255,0,0,0.8)'`.
 */
function rasterizeSvg(
  img: HTMLImageElement,
  width: number,
  height: number,
  tint?: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(img, 0, 0, width, height);

  if (tint) {
    // Keep the alpha channel from the SVG but replace colour with `tint`.
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  return canvas;
}

/**
 * Load an SVG file and rasterise it to an HTMLCanvasElement in one call.
 */
async function loadAndRasterize(
  absPath: string,
  width: number,
  height: number,
  tint?: string,
): Promise<HTMLCanvasElement> {
  const img = await loadSvgImage(absPath);
  return rasterizeSvg(img, width, height, tint);
}

/**
 * Load an SVG file and create a THREE.CanvasTexture from it.
 * The texture is cached — subsequent calls with the same `(absPath, size, tint)`
 * return the same instance without re-loading.
 *
 * @param absPath Absolute file-system path to the `.svg` file.
 * @param size    Rasterisation resolution in pixels (both width & height). Default: 512.
 * @param tint    Optional CSS colour to tint the icon. Default: none (original SVG colours).
 */
async function createSvgTexture(
  absPath: string,
  size = 512,
  tint?: string,
): Promise<THREE.CanvasTexture> {
  const key = _texKey(absPath, size, tint);
  const cached = _textureCache.get(key);
  if (cached) return cached;

  try {
    const canvas = await loadAndRasterize(absPath, size, size, tint);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    _textureCache.set(key, texture);
    return texture;
  } catch (err) {
    DebugConsole.LogError(`[SvgLoader] ${err}`);
    throw err;
  }
}

/**
 * Invalidate all cached data for a given SVG path.
 * Call this when the source file has changed on disk (e.g. hot-reload).
 *
 * @param absPath Absolute path that was passed to `createSvgTexture`.
 */
function invalidateSvgCache(absPath: string): void {
  _imageCache.delete(absPath);
  for (const [key, tex] of _textureCache) {
    if (key.startsWith(`${absPath}:`)) {
      tex.dispose();
      _textureCache.delete(key);
    }
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Utility for loading SVG files and producing rasterised textures or canvas elements.
 *
 * | Method               | Description                                              |
 * |----------------------|----------------------------------------------------------|
 * | `loadImage`          | Load an SVG as `HTMLImageElement` (cached per path).    |
 * | `rasterize`          | Draw a loaded image to a new canvas, with optional tint. |
 * | `loadAndRasterize`   | Load + rasterize in one async call.                      |
 * | `createTexture`      | Load + rasterize + THREE.CanvasTexture (fully cached).   |
 * | `invalidateCache`    | Dispose cached data for a path (after file changes).     |
 */
export const SvgLoader = {
  loadImage: loadSvgImage,
  rasterize: rasterizeSvg,
  loadAndRasterize,
  createTexture: createSvgTexture,
  invalidateCache: invalidateSvgCache,
} as const;
