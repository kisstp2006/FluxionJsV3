// ============================================================
// FluxionJS V2 — PBR Material System
// Nuake-inspired physically based rendering materials
// ============================================================

import * as THREE from 'three';

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
}
