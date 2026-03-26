// ============================================================
// FluxionJS V3 — Asset Thumbnail Cache
// Generates and caches 80×80 sphere preview thumbnails for
// .fluxmat and .fluxvismat files using a shared off-screen
// Three.js WebGL renderer. Render requests are serialized via
// a promise queue so there's never more than one active frame.
// ============================================================

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getFileSystem } from '../../src/filesystem';

const THUMB_SIZE = 80;

// ── Cache storage ───────────────────────────────────────────
type Entry = string | 'pending' | 'error';
const cache = new Map<string, Entry>();
const pendingCallbacks = new Map<string, Array<() => void>>();

// ── Shared off-screen Three.js renderer ────────────────────
let _renderer: THREE.WebGLRenderer | null = null;
let _scene: THREE.Scene | null = null;
let _camera: THREE.PerspectiveCamera | null = null;
let _sphere: THREE.Mesh | null = null;
let _envTexture: THREE.Texture | null = null;

function ensureRenderer(): void {
  if (_renderer) return;

  _renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  _renderer.setSize(THUMB_SIZE, THUMB_SIZE);
  _renderer.toneMapping = THREE.ACESFilmicToneMapping;
  _renderer.toneMappingExposure = 1.0;
  _renderer.outputColorSpace = THREE.SRGBColorSpace;

  _scene = new THREE.Scene();
  _scene.background = new THREE.Color(0x1c1c2a);

  const pmrem = new THREE.PMREMGenerator(_renderer);
  _envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  _scene.environment = _envTexture;
  pmrem.dispose();

  _scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.2);
  key.position.set(3, 5, 4);
  _scene.add(key);
  const fill = new THREE.DirectionalLight(0xc0d8ff, 0.4);
  fill.position.set(-4, 0, 2);
  _scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd0a0, 0.3);
  rim.position.set(0, -3, -4);
  _scene.add(rim);

  const geo = new THREE.SphereGeometry(1, 32, 32);
  const defaultMat = new THREE.MeshPhysicalMaterial({ color: 0x888888, roughness: 0.5, metalness: 0 });
  _sphere = new THREE.Mesh(geo, defaultMat);
  _sphere.rotation.y = 0.6;
  _scene.add(_sphere);

  _camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  _camera.position.set(0, 0, 2.6);
  _camera.lookAt(0, 0, 0);
}

function renderToDataUrl(mat: THREE.Material): string {
  ensureRenderer();
  const sphere = _sphere!;
  const old = sphere.material as THREE.Material;
  sphere.material = mat;
  _renderer!.render(_scene!, _camera!);
  const url = _renderer!.domElement.toDataURL('image/jpeg', 0.88);
  sphere.material = old;
  return url;
}

// ── Build material from file ────────────────────────────────

async function buildFluxMat(data: Record<string, unknown>): Promise<THREE.Material> {
  const mat = new THREE.MeshPhysicalMaterial();
  const color = data.color as [number, number, number] | undefined;
  if (color) mat.color.setRGB(color[0], color[1], color[2]);
  mat.roughness = (data.roughness as number) ?? 0.5;
  mat.metalness = (data.metalness as number) ?? 0;
  const emissive = data.emissive as [number, number, number] | undefined;
  if (emissive) mat.emissive.setRGB(emissive[0], emissive[1], emissive[2]);
  mat.emissiveIntensity = (data.emissiveIntensity as number) ?? 0;
  mat.transparent = (data.transparent as boolean) ?? false;
  mat.opacity = (data.opacity as number) ?? 1;
  mat.wireframe = (data.wireframe as boolean) ?? false;
  return mat;
}

async function buildVisualMat(data: unknown): Promise<THREE.Material> {
  try {
    const { buildVisualMaterial } = await import('../../src/materials/VisualMaterialCompiler');
    // No textures for thumbnails — reject all texture loads silently
    const noTex = (_path: string): Promise<THREE.Texture> =>
      Promise.reject(new Error('skip'));
    const { material } = await buildVisualMaterial(data as any, noTex);
    return material;
  } catch {
    // Fallback: solid purple sphere so it's visually distinct from fluxmat
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xe040fb, roughness: 0.4, metalness: 0.2 });
    return mat;
  }
}

// ── Serialized render queue ─────────────────────────────────
let renderQueue = Promise.resolve();

async function generate(path: string): Promise<string> {
  const fs = getFileSystem();
  const text = await fs.readFile(path);
  const data = JSON.parse(text);

  const mat = path.endsWith('.fluxvismat')
    ? await buildVisualMat(data)
    : await buildFluxMat(data as Record<string, unknown>);

  const url = renderToDataUrl(mat);
  mat.dispose();
  return url;
}

// ── Public API ──────────────────────────────────────────────

/** Synchronously returns a cached data URL, or null if not yet ready. */
export function getThumbnail(path: string): string | null {
  const v = cache.get(path);
  return v && v !== 'pending' && v !== 'error' ? v : null;
}

/**
 * Request thumbnail generation for a path.
 * `onReady` is called once the thumbnail is available (or fails).
 * Safe to call multiple times — deduplicates in-flight requests.
 */
export function requestThumbnail(path: string, onReady: () => void): void {
  const v = cache.get(path);
  if (v === 'error') return; // don't retry errors
  if (v && v !== 'pending') { onReady(); return; } // already done

  // Register callback
  const cbs = pendingCallbacks.get(path) ?? [];
  cbs.push(onReady);
  pendingCallbacks.set(path, cbs);
  if (v === 'pending') return; // already in queue

  cache.set(path, 'pending');

  renderQueue = renderQueue.then(async () => {
    try {
      const url = await generate(path);
      cache.set(path, url);
    } catch {
      cache.set(path, 'error');
    }
    const cbs = pendingCallbacks.get(path) ?? [];
    pendingCallbacks.delete(path);
    for (const cb of cbs) cb();
  });
}

/** Invalidate a cached thumbnail (e.g. after the material file is saved). */
export function invalidateThumbnail(path: string): void {
  cache.delete(path);
  pendingCallbacks.delete(path);
}
