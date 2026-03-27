// ============================================================
// FluxionJS V3 — PBR Material System + Texture Cache
// Nuake-inspired physically based rendering materials
// ============================================================

import * as THREE from 'three';
import type { VisualMaterialFile } from '../materials/VisualMaterialGraph';
import { buildVisualMaterial, updateVisualMaterialTime } from '../materials/VisualMaterialCompiler';

// ── Texture Cache ──

/**
 * Global texture cache backed by WeakRef + FinalizationRegistry.
 * Identical paths return the same THREE.Texture; when all external
 * references are collected the entry is automatically purged.
 */
export class TextureCache {
  private cache = new Map<string, { ref: WeakRef<THREE.Texture> | null; promise: Promise<THREE.Texture> }>();
  private registry = new FinalizationRegistry<string>((key) => {
    const entry = this.cache.get(key);
    // Only delete if the WeakRef is actually dead
    if (entry && (!entry.ref || entry.ref.deref() === undefined)) {
      this.cache.delete(key);
    }
  });

  /**
   * Load a texture through the cache.
   * @param key     Unique cache key (typically the resolved asset path).
   * @param loader  The actual async loader — only called on cache miss.
   */
  load(key: string, loader: (key: string) => Promise<THREE.Texture>): Promise<THREE.Texture> {
    const entry = this.cache.get(key);
    if (entry) {
      const tex = entry.ref?.deref();
      if (tex) return Promise.resolve(tex);
      // Still loading (ref is null) — return the in-flight promise
      if (!entry.ref) return entry.promise;
      // WeakRef died but entry lingered — remove stale
      this.cache.delete(key);
    }

    const promise = loader(key).then((tex) => {
      // Store WeakRef now that the texture exists
      this.cache.set(key, { ref: new WeakRef(tex), promise });
      this.registry.register(tex, key);
      return tex;
    });

    // Store with null ref — promise is in-flight
    this.cache.set(key, { ref: null, promise });
    return promise;
  }

  /** Wrap an existing `loadTexture(relPath)` callback so it goes through the cache. */
  wrapLoader(loadTexture: (relPath: string) => Promise<THREE.Texture>): (relPath: string) => Promise<THREE.Texture> {
    return (relPath: string) => this.load(relPath, loadTexture);
  }

  /** Number of live entries (for diagnostics). */
  get size(): number {
    return this.cache.size;
  }

  /** Drop all entries (does NOT dispose GPU textures — they are owned by materials). */
  clear(): void {
    this.cache.clear();
  }
}

/** Shape of a parsed .fluxmat JSON file */
export interface FluxMatData {
  type?: string;
  color?: [number, number, number];
  roughness?: number;
  metalness?: number;
  emissive?: [number, number, number];
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  doubleSided?: boolean;
  wireframe?: boolean;
  alphaTest?: number;
  envMapIntensity?: number;
  normalScale?: number;
  aoIntensity?: number;
  albedoMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  aoMap?: string;
  emissiveMap?: string;
  uvTransforms?: Record<string, { repeat?: [number, number]; offset?: [number, number]; rotation?: number }>;
}

export interface PBRMaterialConfig {
  name?: string;
  albedo?: THREE.Color | string | number;
  albedoMap?: THREE.Texture | null;
  metalness?: number;
  metalnessMap?: THREE.Texture | null;
  roughness?: number;
  roughnessMap?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  normalScale?: THREE.Vector2;
  aoMap?: THREE.Texture | null;
  aoIntensity?: number;
  emissive?: THREE.Color | string | number;
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  doubleSided?: boolean;
  wireframe?: boolean;
  envMapIntensity?: number;
}

export class MaterialSystem {
  private materials: Map<string, THREE.MeshStandardMaterial> = new Map();
  private envMap: THREE.CubeTexture | THREE.Texture | null = null;
  readonly textureCache = new TextureCache();

  createPBR(config: PBRMaterialConfig): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: config.albedo instanceof THREE.Color
        ? config.albedo
        : new THREE.Color(config.albedo ?? 0xffffff),
      map: config.albedoMap ?? null,
      metalness: config.metalness ?? 0.0,
      metalnessMap: config.metalnessMap ?? null,
      roughness: config.roughness ?? 0.5,
      roughnessMap: config.roughnessMap ?? null,
      normalMap: config.normalMap ?? null,
      normalScale: config.normalScale ?? new THREE.Vector2(1, 1),
      aoMap: config.aoMap ?? null,
      aoMapIntensity: config.aoIntensity ?? 1.0,
      emissive: config.emissive instanceof THREE.Color
        ? config.emissive
        : new THREE.Color(config.emissive ?? 0x000000),
      emissiveMap: config.emissiveMap ?? null,
      emissiveIntensity: config.emissiveIntensity ?? 1.0,
      transparent: config.transparent ?? false,
      opacity: config.opacity ?? 1.0,
      alphaTest: config.alphaTest ?? 0,
      side: config.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      wireframe: config.wireframe ?? false,
      envMapIntensity: config.envMapIntensity ?? 1.0,
    });

    if (this.envMap) {
      mat.envMap = this.envMap;
    }

    const name = config.name ?? `mat_${this.materials.size}`;
    mat.name = name;
    this.materials.set(name, mat);
    return mat;
  }

  setEnvironmentMap(envMap: THREE.CubeTexture | THREE.Texture): void {
    if (this.envMap && this.envMap !== envMap) {
      this.envMap.dispose();
    }
    this.envMap = envMap;
    for (const mat of this.materials.values()) {
      mat.envMap = envMap;
      mat.needsUpdate = true;
    }
  }

  getMaterial(name: string): THREE.MeshStandardMaterial | undefined {
    return this.materials.get(name);
  }

  disposeMaterial(name: string): void {
    const mat = this.materials.get(name);
    if (mat) {
      mat.dispose();
      this.materials.delete(name);
    }
  }

  disposeAll(): void {
    for (const mat of this.materials.values()) {
      mat.dispose();
    }
    this.materials.clear();
  }

  /**
   * Create a PBR material from a parsed .fluxmat JSON object.
   * Texture map paths are resolved and loaded via the provided loader callback.
   */
  async createFromFluxMat(
    data: FluxMatData,
    loadTexture: (relPath: string) => Promise<THREE.Texture>,
    name?: string,
  ): Promise<THREE.MeshStandardMaterial> {
    const cachedLoader = this.textureCache.wrapLoader(loadTexture);
    const config: PBRMaterialConfig = {
      name,
      albedo: data.color
        ? new THREE.Color(data.color[0], data.color[1], data.color[2])
        : new THREE.Color(0xffffff),
      roughness: data.roughness ?? 0.5,
      metalness: data.metalness ?? 0.0,
      transparent: data.transparent ?? false,
      opacity: data.opacity ?? 1.0,
      doubleSided: data.doubleSided ?? false,
      wireframe: data.wireframe ?? false,
      alphaTest: data.alphaTest ?? 0,
      envMapIntensity: data.envMapIntensity ?? 1.0,
    };

    if (data.emissive) {
      config.emissive = new THREE.Color(data.emissive[0], data.emissive[1], data.emissive[2]);
    }
    config.emissiveIntensity = data.emissiveIntensity ?? 1.0;

    if (data.normalScale !== undefined) {
      const s = typeof data.normalScale === 'number' ? data.normalScale : 1;
      config.normalScale = new THREE.Vector2(s, s);
    }
    if (data.aoIntensity !== undefined) {
      config.aoIntensity = data.aoIntensity;
    }

    // Load texture maps in parallel
    const mapEntries: [keyof FluxMatData, 'albedoMap' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap'][] = [
      ['albedoMap', 'albedoMap'],
      ['normalMap', 'normalMap'],
      ['roughnessMap', 'roughnessMap'],
      ['metalnessMap', 'metalnessMap'],
      ['aoMap', 'aoMap'],
      ['emissiveMap', 'emissiveMap'],
    ];

    const NON_COLOR_MAPS = new Set(['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']);
    const texPromises: Promise<void>[] = [];
    for (const [jsonKey, configKey] of mapEntries) {
      const path = data[jsonKey] as string | undefined;
      if (path) {
        texPromises.push(
          cachedLoader(path)
            .then((tex) => {
              // Non-color data textures must use linear color space
              if (NON_COLOR_MAPS.has(configKey)) {
                tex.colorSpace = THREE.LinearSRGBColorSpace;
              }
              // Use repeat wrapping for material textures
              tex.wrapS = THREE.RepeatWrapping;
              tex.wrapT = THREE.RepeatWrapping;
              // Restore UV transform saved in .fluxmat
              const transform = data.uvTransforms?.[configKey];
              if (transform) {
                if (transform.repeat) tex.repeat.set(transform.repeat[0], transform.repeat[1]);
                if (transform.offset) tex.offset.set(transform.offset[0], transform.offset[1]);
                if (transform.rotation !== undefined) tex.rotation = transform.rotation;
              }
              tex.needsUpdate = true;
              (config as any)[configKey] = tex;
            })
            .catch(() => { /* texture not found — skip silently */ })
        );
      }
    }
    await Promise.all(texPromises);

    return this.createPBR(config);
  }

  // ── Preset materials ──

  static defaultLit(): PBRMaterialConfig {
    return { albedo: 0xcccccc, metalness: 0.0, roughness: 0.5 };
  }

  static metal(): PBRMaterialConfig {
    return { albedo: 0xaaaaaa, metalness: 1.0, roughness: 0.2 };
  }

  static glass(): PBRMaterialConfig {
    return {
      albedo: 0xffffff,
      metalness: 0.0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.3,
    };
  }

  static emissive(color: number | string = 0xff4400, intensity = 5): PBRMaterialConfig {
    return {
      albedo: 0x000000,
      emissive: color,
      emissiveIntensity: intensity,
      metalness: 0.0,
      roughness: 0.5,
    };
  }

  static ground(): PBRMaterialConfig {
    return { albedo: 0x4a6741, metalness: 0.0, roughness: 0.85 };
  }

  // ── Visual Material (.fluxvismat) support ──

  private visualMaterials: Map<string, THREE.MeshPhysicalMaterial> = new Map();

  /**
   * Create a PBR material from a parsed .fluxvismat file.
   * Textures are loaded via the provided callback (same pattern as createFromFluxMat).
   */
  async createFromVisualMat(
    data: VisualMaterialFile,
    loadTexture: (relPath: string) => Promise<THREE.Texture>,
    name?: string,
  ): Promise<THREE.MeshPhysicalMaterial> {
    const cachedLoader = this.textureCache.wrapLoader(loadTexture);
    const { material } = await buildVisualMaterial(data, cachedLoader);

    const matName = name ?? data.name ?? `vismat_${this.visualMaterials.size}`;
    material.name = matName;

    if (this.envMap) {
      material.envMap = this.envMap;
    }

    this.visualMaterials.set(matName, material);
    return material;
  }

  /** Call once per frame to update time uniforms on all visual materials. */
  updateVisualMaterials(time: number): void {
    for (const mat of this.visualMaterials.values()) {
      updateVisualMaterialTime(mat, time);
    }
  }

  getVisualMaterial(name: string): THREE.MeshPhysicalMaterial | undefined {
    return this.visualMaterials.get(name);
  }

  disposeVisualMaterial(name: string): void {
    const mat = this.visualMaterials.get(name);
    if (mat) {
      mat.dispose();
      this.visualMaterials.delete(name);
    }
  }
}
