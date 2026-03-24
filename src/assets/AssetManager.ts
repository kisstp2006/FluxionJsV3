// ============================================================
// FluxionJS V2 — Asset Manager
// LumixEngine-inspired asset pipeline with caching & loading
// ============================================================

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export type AssetType = 'texture' | 'model' | 'audio' | 'json' | 'shader';

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

  // ── Model Loading (GLTF/GLB) ──

  async loadModel(path: string): Promise<GLTF> {
    const cached = this.getFromCache<GLTF>(path);
    if (cached) return cached;

    if (this.loading.has(path)) return this.loading.get(path)!;

    const promise = new Promise<GLTF>((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf) => {
          // Enable shadows on all meshes
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          this.addToCache(path, 'model', gltf, 0);
          this.loading.delete(path);
          resolve(gltf);
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
        }
      );
    });

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
      let data: any;
      switch (asset.type) {
        case 'texture':
          data = await this.loadTexture(asset.path);
          break;
        case 'model':
          data = await this.loadModel(asset.path);
          break;
        case 'audio':
          data = await this.loadAudio(asset.path);
          break;
        case 'json':
          data = await this.loadJSON(asset.path);
          break;
      }
      results.set(asset.path, data);
    });

    await Promise.all(promises);
    return results;
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
