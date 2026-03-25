// ============================================================
// FluxionJS V3 — .fluxmesh Format
// JSON wrapper around imported 3D models that maps sub-meshes
// to material slots, enabling per-slot .fluxmat assignment.
// ============================================================

import * as THREE from 'three';

// ── Data types (serialised to JSON) ──

/** Precise reference to a material on a specific mesh (for multi-material meshes) */
export interface FluxMeshSubMeshRef {
  /** Depth-first traversal index of the THREE.Mesh node */
  meshIndex: number;
  /** Index within the mesh's material array (0 for single-material meshes) */
  materialIndex: number;
}

/** A single material slot inside a .fluxmesh file */
export interface FluxMeshMaterialSlot {
  /** Human-readable name derived from the original material */
  name: string;
  /** Depth-first traversal indices of child THREE.Meshes that use this slot (legacy) */
  subMeshIndices: number[];
  /** Precise mapping for multi-material meshes (preferred over subMeshIndices when present) */
  subMeshMappings?: FluxMeshSubMeshRef[];
  /** Project-relative path to the default .fluxmat generated on import */
  defaultMaterial: string;
}

/** Root structure of a .fluxmesh JSON file */
export interface FluxMeshData {
  version: 1;
  /** Project-relative path to the original model file (fbx/obj/gltf) */
  sourceModel: string;
  /** Material slot definitions */
  materialSlots: FluxMeshMaterialSlot[];
}

/** Per-slot override stored on MeshRendererComponent */
export interface MaterialSlotOverride {
  slotIndex: number;
  materialPath: string;
}

/** Result returned by AssetManager.loadFluxMesh() */
export interface FluxMeshLoadResult {
  scene: THREE.Group;
  slots: FluxMeshMaterialSlot[];
  data: FluxMeshData;
}

// ── Utilities ──

/**
 * Apply an array of materials to sub-meshes according to slot definitions.
 * `materials[i]` corresponds to `slots[i]`. A null entry is skipped.
 * Supports both legacy (subMeshIndices) and new (subMeshMappings) formats.
 */
export function applyMaterialsToModel(
  root: THREE.Object3D,
  slots: FluxMeshMaterialSlot[],
  materials: (THREE.Material | null)[],
): void {
  // Collect all mesh nodes in depth-first order
  const meshNodes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshNodes.push(child);
  });

  // Check if any slot uses the precise mapping format
  const hasMappings = slots.some(s => s.subMeshMappings && s.subMeshMappings.length > 0);

  if (hasMappings) {
    // New format: supports multi-material meshes
    // Build: meshIndex → materialIndex → slot material
    const meshAssignments = new Map<number, Map<number, THREE.Material>>();
    for (let si = 0; si < slots.length; si++) {
      const mat = materials[si];
      if (!mat) continue;
      for (const ref of (slots[si].subMeshMappings || [])) {
        if (!meshAssignments.has(ref.meshIndex)) {
          meshAssignments.set(ref.meshIndex, new Map());
        }
        meshAssignments.get(ref.meshIndex)!.set(ref.materialIndex, mat);
      }
    }

    for (const [meshIdx, matMap] of meshAssignments) {
      const mesh = meshNodes[meshIdx];
      if (!mesh) continue;

      const currentMats = Array.isArray(mesh.material) ? [...mesh.material] : [mesh.material];

      if (matMap.size === 1 && matMap.has(0) && currentMats.length <= 1) {
        // Single material — assign directly
        mesh.material = matMap.get(0)!;
      } else {
        // Multi-material — update the correct array entries
        for (const [matIdx, mat] of matMap) {
          if (matIdx < currentMats.length) {
            currentMats[matIdx] = mat;
          }
        }
        mesh.material = currentMats.length === 1 ? currentMats[0] : currentMats;
      }
    }
  } else {
    // Legacy format: mesh-index-only mapping
    const indexToMaterial = new Map<number, THREE.Material>();
    for (let si = 0; si < slots.length; si++) {
      const mat = materials[si];
      if (!mat) continue;
      for (const idx of slots[si].subMeshIndices) {
        indexToMaterial.set(idx, mat);
      }
    }

    for (let i = 0; i < meshNodes.length; i++) {
      const mat = indexToMaterial.get(i);
      if (mat) meshNodes[i].material = mat;
    }
  }
}

/**
 * Extract PBR properties from a THREE material into a FluxMatData-like
 * plain object suitable for writing as a .fluxmat JSON file.
 * Handles MeshStandardMaterial, MeshPhysicalMaterial, MeshPhongMaterial,
 * and MeshLambertMaterial (FBXLoader typically produces Phong materials).
 */
export function extractFluxMatFromMaterial(mat: THREE.Material): Record<string, any> {
  const data: Record<string, any> = { type: 'standard' };

  if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
    data.color = [mat.color.r, mat.color.g, mat.color.b];
    data.roughness = mat.roughness;
    data.metalness = mat.metalness;
    if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
      data.emissive = [mat.emissive.r, mat.emissive.g, mat.emissive.b];
      data.emissiveIntensity = mat.emissiveIntensity;
    }
    if (mat.transparent) {
      data.transparent = true;
      data.opacity = mat.opacity;
    }
    if (mat.side === THREE.DoubleSide) data.doubleSided = true;
    if (mat.wireframe) data.wireframe = true;
    if (mat.alphaTest > 0) data.alphaTest = mat.alphaTest;
  } else if (mat instanceof THREE.MeshPhongMaterial) {
    // FBXLoader typically produces Phong materials — convert to PBR approximation
    data.color = [mat.color.r, mat.color.g, mat.color.b];
    // Derive roughness from shininess (Phong → PBR approximation)
    const shininess = mat.shininess ?? 30;
    data.roughness = Math.max(0, Math.min(1, 1.0 - Math.sqrt(Math.min(shininess, 100) / 100)));
    // Approximate metalness from specular
    if (mat.specular) {
      const specIntensity = (mat.specular.r + mat.specular.g + mat.specular.b) / 3;
      data.metalness = specIntensity > 0.5 ? Math.min(1, specIntensity) : 0.0;
    } else {
      data.metalness = 0.0;
    }
    if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
      data.emissive = [mat.emissive.r, mat.emissive.g, mat.emissive.b];
      data.emissiveIntensity = mat.emissiveIntensity ?? 1.0;
    }
    if (mat.transparent) {
      data.transparent = true;
      data.opacity = mat.opacity;
    }
    if (mat.side === THREE.DoubleSide) data.doubleSided = true;
    if (mat.wireframe) data.wireframe = true;
    if (mat.alphaTest > 0) data.alphaTest = mat.alphaTest;
  } else if (mat instanceof THREE.MeshLambertMaterial) {
    data.color = [mat.color.r, mat.color.g, mat.color.b];
    data.roughness = 0.9;
    data.metalness = 0.0;
    if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
      data.emissive = [mat.emissive.r, mat.emissive.g, mat.emissive.b];
      data.emissiveIntensity = mat.emissiveIntensity ?? 1.0;
    }
    if (mat.transparent) {
      data.transparent = true;
      data.opacity = mat.opacity;
    }
    if (mat.side === THREE.DoubleSide) data.doubleSided = true;
  } else {
    // Fallback for unknown material types
    data.color = [0.8, 0.8, 0.8];
    data.roughness = 0.5;
    data.metalness = 0.0;
  }
  return data;
}

// ── Texture extraction utilities ──

/** Mapping from THREE.js material property names to FluxMat texture slot names */
const TEXTURE_MAP_KEYS: { threeProp: string; fluxmatKey: string; label: string }[] = [
  { threeProp: 'map', fluxmatKey: 'albedoMap', label: 'albedo' },
  { threeProp: 'normalMap', fluxmatKey: 'normalMap', label: 'normal' },
  { threeProp: 'roughnessMap', fluxmatKey: 'roughnessMap', label: 'roughness' },
  { threeProp: 'metalnessMap', fluxmatKey: 'metalnessMap', label: 'metalness' },
  { threeProp: 'aoMap', fluxmatKey: 'aoMap', label: 'ao' },
  { threeProp: 'emissiveMap', fluxmatKey: 'emissiveMap', label: 'emissive' },
  // Phong/Lambert additions (mapped to PBR equivalents)
  { threeProp: 'specularMap', fluxmatKey: 'metalnessMap', label: 'specular' },
  { threeProp: 'bumpMap', fluxmatKey: 'normalMap', label: 'bump' },
];

/**
 * Extract texture references from a THREE material.
 * Returns an array of { fluxmatKey, texture, label } for each texture found.
 * Deduplicates by fluxmatKey (first match wins).
 */
export function getTextureRefsFromMaterial(
  mat: THREE.Material,
): Array<{ fluxmatKey: string; texture: THREE.Texture; label: string }> {
  const refs: Array<{ fluxmatKey: string; texture: THREE.Texture; label: string }> = [];
  const seen = new Set<string>();

  for (const entry of TEXTURE_MAP_KEYS) {
    const tex = (mat as any)[entry.threeProp] as THREE.Texture | null | undefined;
    if (tex && !seen.has(entry.fluxmatKey)) {
      refs.push({ fluxmatKey: entry.fluxmatKey, texture: tex, label: entry.label });
      seen.add(entry.fluxmatKey);
    }
  }

  return refs;
}

/**
 * Save a THREE.Texture's image data to a PNG file.
 * Uses an offscreen canvas for rendering. Works in the Electron renderer process.
 * Returns true if the texture was saved successfully.
 */
export async function saveTextureToFile(
  texture: THREE.Texture,
  savePath: string,
  writeBinary: (path: string, data: ArrayBuffer) => Promise<void>,
): Promise<boolean> {
  try {
    const image = texture.image;
    if (!image) return false;

    const width = image.width || image.naturalWidth || 256;
    const height = image.height || image.naturalHeight || 256;
    if (width <= 0 || height <= 0) return false;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    if (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement ||
        (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)) {
      ctx.drawImage(image as CanvasImageSource, 0, 0);
    } else if (image.data) {
      // Raw pixel data (e.g. DataTexture, compressed texture readback)
      let clamped: Uint8ClampedArray;
      if (image.data instanceof Uint8ClampedArray) {
        clamped = new Uint8ClampedArray(image.data);
      } else if (image.data instanceof Uint8Array) {
        clamped = new Uint8ClampedArray(image.data);
      } else {
        // Float data — convert to uint8
        const src = image.data as Float32Array;
        clamped = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < src.length && i < clamped.length; i++) {
          clamped[i] = Math.max(0, Math.min(255, Math.round(src[i] * 255)));
        }
      }
      const imgData = new ImageData(new Uint8ClampedArray(clamped.buffer.slice(0)) as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
      ctx.putImageData(imgData, 0, 0);
    } else {
      return false;
    }

    // Export as PNG
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;

    const buffer = await blob.arrayBuffer();
    await writeBinary(savePath, buffer);
    return true;
  } catch (err) {
    console.warn('[FluxMeshData] Failed to save texture to', savePath, err);
    return false;
  }
}
