// ============================================================
// FluxionJS V3 — .fluxmesh Format
// JSON wrapper around imported 3D models that maps sub-meshes
// to material slots, enabling per-slot .fluxmat assignment.
// ============================================================

import * as THREE from 'three';

// ── Data types (serialised to JSON) ──

/** A single material slot inside a .fluxmesh file */
export interface FluxMeshMaterialSlot {
  /** Human-readable name derived from the original material */
  name: string;
  /** Depth-first traversal indices of child THREE.Meshes that use this slot */
  subMeshIndices: number[];
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
 */
export function applyMaterialsToModel(
  root: THREE.Object3D,
  slots: FluxMeshMaterialSlot[],
  materials: (THREE.Material | null)[],
): void {
  // Build a mesh-index → material lookup
  const indexToMaterial = new Map<number, THREE.Material>();
  for (let si = 0; si < slots.length; si++) {
    const mat = materials[si];
    if (!mat) continue;
    for (const idx of slots[si].subMeshIndices) {
      indexToMaterial.set(idx, mat);
    }
  }

  // Traverse depth-first, counting only Mesh nodes
  let meshIndex = 0;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = indexToMaterial.get(meshIndex);
      if (mat) {
        child.material = mat;
      }
      meshIndex++;
    }
  });
}

/**
 * Extract PBR properties from a THREE material into a FluxMatData-like
 * plain object suitable for writing as a .fluxmat JSON file.
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
  } else {
    // Fallback for non-PBR materials
    data.color = [0.8, 0.8, 0.8];
    data.roughness = 0.5;
    data.metalness = 0.0;
  }
  return data;
}
