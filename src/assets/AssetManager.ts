// ============================================================
// FluxionJS V3 — Asset Manager
// LumixEngine-inspired asset pipeline with caching & loading.
// Now uses AssetTypeRegistry for type resolution.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { AssetTypeRegistry } from './AssetTypeRegistry';

/** Unified model result — all formats return { scene: THREE.Group } */
export interface ModelResult {
  scene: THREE.Group;
}

export type AssetType = 'texture' | 'model' | 'audio' | 'json' | 'shader' | string;

interface AssetEntry {
  type: AssetType;
  path: string;
  data: any;
  refCount: number;
  size: number;
}

export interface LoadProgress {
  loaded: number;
  total: number;
  currentAsset: string;
  percent: number;
}

export class AssetManager {
  private cache: Map<string, AssetEntry> = new Map();
  private loading: Map<string, Promise<any>> = new Map();
  private textureLoader = new THREE.TextureLoader();
  private gltfLoader: GLTFLoader;
  private fbxLoader = new FBXLoader();
  private objLoader = new OBJLoader();
  private audioContext: AudioContext | null = null;

  onProgress?: (progress: LoadProgress) => void;

  constructor() {
    this.gltfLoader = new GLTFLoader();

    // Optional: Draco compression support
    try {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      this.gltfLoader.setDRACOLoader(dracoLoader);
    } catch {
      // Draco not available, continue without it
    }
  }

  // ── Texture Loading ──

  async loadTexture(path: string, options?: {
    wrapS?: THREE.Wrapping;
    wrapT?: THREE.Wrapping;
    minFilter?: THREE.MinificationTextureFilter;
    magFilter?: THREE.MagnificationTextureFilter;
    generateMipmaps?: boolean;
    flipY?: boolean;
  }): Promise<THREE.Texture> {
    const cached = this.getFromCache<THREE.Texture>(path);
    if (cached) return cached;

    if (this.loading.has(path)) return this.loading.get(path)!;

    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          if (options) {
            if (options.wrapS) texture.wrapS = options.wrapS;
            if (options.wrapT) texture.wrapT = options.wrapT;
            if (options.minFilter) texture.minFilter = options.minFilter;
            if (options.magFilter) texture.magFilter = options.magFilter;
            if (options.generateMipmaps !== undefined) texture.generateMipmaps = options.generateMipmaps;
            if (options.flipY !== undefined) texture.flipY = options.flipY;
          }
          texture.colorSpace = THREE.SRGBColorSpace;

          this.addToCache(path, 'texture', texture, 0);
          this.loading.delete(path);
          resolve(texture);
        },
        undefined,
        (error) => {
          this.loading.delete(path);
          reject(error);
        }
      );
    });

    this.loading.set(path, promise);
    return promise;
  }

  // ── Model Loading (GLTF/GLB/FBX/OBJ) ──

  /** Detect model format from path extension */
  private getModelFormat(path: string): 'gltf' | 'fbx' | 'obj' {
    const lower = path.toLowerCase().replace(/\?.*$/, '');
    if (lower.endsWith('.fbx')) return 'fbx';
    if (lower.endsWith('.obj')) return 'obj';
    return 'gltf'; // .glb, .gltf, or default
  }

  /** Enable shadows on all meshes in a scene graph */
  private enableShadows(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  async loadModel(path: string): Promise<ModelResult> {
    const cached = this.getFromCache<ModelResult>(path);
    if (cached) return cached;

    if (this.loading.has(path)) return this.loading.get(path)!;

    const format = this.getModelFormat(path);
    let promise: Promise<ModelResult>;

    switch (format) {
      case 'fbx':
        promise = new Promise<ModelResult>((resolve, reject) => {
          this.fbxLoader.load(
            path,
            (group) => {
              this.enableShadows(group);
              const result: ModelResult = { scene: group };
              this.addToCache(path, 'model', result, 0);
              this.loading.delete(path);
              resolve(result);
            },
            (progress) => {
              this.onProgress?.({
                loaded: progress.loaded,
                total: progress.total,
                currentAsset: path,
                percent: progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0,
              });
            },
            (error) => {
              this.loading.delete(path);
              reject(error);
            },
          );
        });
        break;

      case 'obj':
        promise = new Promise<ModelResult>((resolve, reject) => {
          this.objLoader.load(
            path,
            (group) => {
              this.enableShadows(group);
              const result: ModelResult = { scene: group };
              this.addToCache(path, 'model', result, 0);
              this.loading.delete(path);
              resolve(result);
            },
            (progress) => {
              this.onProgress?.({
                loaded: progress.loaded,
                total: progress.total,
                currentAsset: path,
                percent: progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0,
              });
            },
            (error) => {
              this.loading.delete(path);
              reject(error);
            },
          );
        });
        break;

      default: // gltf / glb
        promise = new Promise<ModelResult>((resolve, reject) => {
          this.gltfLoader.load(
            path,
            (gltf) => {
              this.enableShadows(gltf.scene);
              const result: ModelResult = { scene: gltf.scene };
              this.addToCache(path, 'model', result, 0);
              this.loading.delete(path);
              resolve(result);
            },
            (progress) => {
              this.onProgress?.({
                loaded: progress.loaded,
                total: progress.total,
                currentAsset: path,
                percent: progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0,
              });
            },
            (error) => {
              this.loading.delete(path);
              reject(error);
            },
          );
        });
        break;
    }

    this.loading.set(path, promise);
    return promise;
  }

  // ── Audio Loading ──

  async loadAudio(path: string): Promise<AudioBuffer> {
    const cached = this.getFromCache<AudioBuffer>(path);
    if (cached) return cached;

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    this.addToCache(path, 'audio', audioBuffer, arrayBuffer.byteLength);
    return audioBuffer;
  }

  // ── JSON Loading ──

  async loadJSON<T = any>(path: string): Promise<T> {
    const cached = this.getFromCache<T>(path);
    if (cached) return cached;

    const response = await fetch(path);
    const data = await response.json();
    this.addToCache(path, 'json', data, 0);
    return data as T;
  }

  // ── Batch Loading ──

  async loadAll(assets: { path: string; type: AssetType }[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();

    const promises = assets.map(async (asset) => {
      const data = await this.loadAsset(asset.path, asset.type);
      results.set(asset.path, data);
    });

    await Promise.all(promises);
    return results;
  }

  // ── Generic registry-aware loader ──

  /**
   * Load an asset by path. Resolves the type from the registry
   * when `typeHint` is not provided.
   */
  async loadAsset(path: string, typeHint?: string): Promise<any> {
    const cached = this.getFromCache(path);
    if (cached) return cached;

    // Resolve type from registry if no hint
    const resolvedType = typeHint ?? AssetTypeRegistry.resolveFile(path)?.type ?? 'unknown';

    // Check if the registry definition has a custom loader
    const typeDef = AssetTypeRegistry.getByType(resolvedType);
    if (typeDef?.loader) {
      const { getFileSystem } = await import('../filesystem');
      const fs = getFileSystem();
      const data = await typeDef.loader(fs, path);
      this.addToCache(path, resolvedType, data, 0);
      return data;
    }

    // Fall back to built-in loaders
    switch (resolvedType) {
      case 'texture': return this.loadTexture(path);
      case 'model': return this.loadModel(path);
      case 'audio': return this.loadAudio(path);
      case 'json': return this.loadJSON(path);
      default: return null;
    }
  }

  // ── Cache management ──

  private addToCache(path: string, type: AssetType, data: any, size: number): void {
    this.cache.set(path, { type, path, data, refCount: 1, size });
  }

  private getFromCache<T>(path: string): T | null {
    const entry = this.cache.get(path);
    if (entry) {
      entry.refCount++;
      return entry.data as T;
    }
    return null;
  }

  release(path: string): void {
    const entry = this.cache.get(path);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      this.disposeAsset(entry);
      this.cache.delete(path);
    }
  }

  private disposeAsset(entry: AssetEntry): void {
    switch (entry.type) {
      case 'texture':
        (entry.data as THREE.Texture).dispose();
        break;
      case 'model':
        // Dispose geometry and materials
        (entry.data as GLTF).scene.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
        break;
    }
  }

  getCacheInfo(): { count: number; types: Record<AssetType, number> } {
    const types: Record<string, number> = {};
    for (const entry of this.cache.values()) {
      types[entry.type] = (types[entry.type] ?? 0) + 1;
    }
    return { count: this.cache.size, types: types as Record<AssetType, number> };
  }

  disposeAll(): void {
    for (const entry of this.cache.values()) {
      this.disposeAsset(entry);
    }
    this.cache.clear();
  }
}
