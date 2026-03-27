// ============================================================
// FluxionJS V3 — Scene Serializer
// Thin orchestrator: delegates to per-component serialize/deserialize.
// Scenes with version < 2 are handled by SceneSerializerLegacy.ts.
// ============================================================

import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { DebugConsole } from '../core/DebugConsole';
import { EntityId } from '../core/ECS';
import { MeshRendererComponent } from '../core/Components';
import { BaseComponent } from '../core/BaseComponent';
import { ComponentRegistry } from '../core/ComponentRegistry';
import type { DeserializationContext } from '../core/SerializationContext';
import { deserializeLegacyScene } from './SceneSerializerLegacy';
import { Scene, SceneSettings, SerializedEntity, SerializedComponent } from '../scene/Scene';
import { AssetManager } from '../assets/AssetManager';
import { MaterialSystem, FluxMatData } from '../renderer/MaterialSystem';
import type { VisualMaterialFile } from '../materials/VisualMaterialGraph';
import { projectManager } from './ProjectManager';
import { applyMaterialsToModel } from '../assets/FluxMeshData';
import type { FluxMeshLoadResult } from '../assets/FluxMeshData';

// ── Material serialization data ──

export interface SerializedMaterial {
  color: [number, number, number];
  roughness: number;
  metalness: number;
  emissive?: [number, number, number];
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  wireframe?: boolean;
  doubleSided?: boolean;
  alphaTest?: number;
  normalScale?: number;
  aoIntensity?: number;
  envMapIntensity?: number;
  albedoMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  aoMap?: string;
  emissiveMap?: string;
}

export interface SerializedGeometry {
  // Box
  width?: number;
  height?: number;
  depth?: number;
  // Sphere
  radius?: number;
  // Cylinder / Cone / Capsule
  radiusTop?: number;
  radiusBottom?: number;
  // Torus
  tube?: number;
}

export interface SceneFileData {
  name: string;
  version: number;
  settings: SceneSettings & { backgroundColor?: [number, number, number] };
  editorCamera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  entities: SerializedEntity[];
}

// ── Serialize from ECS to JSON (v2) ──

export function serializeScene(scene: Scene, engine: Engine, editorCamera?: THREE.PerspectiveCamera, orbitTarget?: THREE.Vector3): SceneFileData {
  const entities: SerializedEntity[] = [];

  for (const entityId of engine.ecs.getAllEntities()) {
    entities.push({
      id: entityId,
      name: engine.ecs.getEntityName(entityId),
      parent: engine.ecs.getParent(entityId) ?? null,
      tags: [],
      components: engine.ecs.getAllComponents(entityId).map(comp => ({
        type: comp.type,
        data: (comp as BaseComponent).serialize(),
      })),
    });
  }

  const result: SceneFileData = {
    name: scene.name,
    version: 2,
    settings: { ...scene.settings },
    entities,
  };

  if (editorCamera) {
    result.editorCamera = {
      position: [editorCamera.position.x, editorCamera.position.y, editorCamera.position.z],
      target: orbitTarget ? [orbitTarget.x, orbitTarget.y, orbitTarget.z] : [0, 0, 0],
      fov: editorCamera.fov,
    };
  }

  return result;
}

// ── Deserialize JSON to ECS ──

export function deserializeScene(engine: Engine, data: SceneFileData, scene: Scene): void {
  // Route legacy scenes (version < 2) to the preserved v1 implementation
  if (!data.version || data.version < 2) {
    return deserializeLegacyScene(engine, data, scene);
  }

  scene.clear();
  scene.name = data.name;
  if (data.settings) {
    scene.settings = {
      ambientColor: data.settings.ambientColor || [0.2, 0.2, 0.3],
      ambientIntensity: data.settings.ambientIntensity ?? 0.5,
      fogEnabled: data.settings.fogEnabled ?? true,
      fogColor: data.settings.fogColor || [0.1, 0.1, 0.15],
      fogDensity: data.settings.fogDensity ?? 0.005,
      skybox: data.settings.skybox || null,
      physicsGravity: data.settings.physicsGravity || [0, -9.81, 0],
    };
  }

  const ctx: DeserializationContext = {
    engine,
    entityIdMap: new Map(),
    deferredModelLoads: [],
    deferredMaterialLoads: [],
  };

  for (const entityData of data.entities) {
    const entityId = engine.ecs.createEntity(entityData.name);
    ctx.entityIdMap.set(entityData.id, entityId);

    for (const compData of entityData.components) {
      const comp = ComponentRegistry.create(compData.type);
      if (!comp) {
        DebugConsole.LogWarning(`[SceneSerializer] Unknown component type: "${compData.type}" — skipped.`);
        continue;
      }
      (comp as BaseComponent).deserialize(compData.data, ctx);
      engine.ecs.addComponent(entityId, comp);
    }
  }

  // Restore parent relationships using the id map
  for (const entityData of data.entities) {
    if (entityData.parent !== null) {
      const newChildId = ctx.entityIdMap.get(entityData.id)!;
      const newParentId = ctx.entityIdMap.get(entityData.parent);
      if (newParentId !== undefined) {
        engine.ecs.setParent(newChildId, newParentId);
      } else {
        engine.ecs.setParent(newChildId, entityData.parent as EntityId);
      }
    }
  }

  // Fire deferred asset loads (fire-and-forget)
  for (const d of ctx.deferredModelLoads) {
    if (d.modelPath.endsWith('.fluxmesh')) {
      loadDeferredFluxMesh(engine, d.meshComp, d.modelPath);
    } else {
      loadDeferredModel(engine, d.meshComp, d.modelPath);
    }
  }
  for (const d of ctx.deferredMaterialLoads) loadDeferredMaterial(engine, d.meshComp, d.materialPath);
}

/** Resolve path and load a .fluxmesh asset with per-slot materials onto a MeshRendererComponent */
export async function loadDeferredFluxMesh(
  engine: Engine,
  meshComp: MeshRendererComponent,
  fluxmeshPath: string,
): Promise<void> {
  try {
    let loadPath: string;
    try {
      loadPath = projectManager.resolvePath(fluxmeshPath);
    } catch {
      loadPath = fluxmeshPath;
    }

    const assets = engine.getSubsystem('assets') as AssetManager;
    const result: FluxMeshLoadResult = await assets.loadFluxMesh(loadPath);
    const scene = result.scene.clone();
    scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = meshComp.castShadow;
        child.receiveShadow = meshComp.receiveShadow;
      }
    });

    // Build overrides map from component's materialSlots
    const overrides = new Map<number, string>();
    if (meshComp.materialSlots) {
      for (const ov of meshComp.materialSlots) {
        overrides.set(ov.slotIndex, ov.materialPath);
      }
    }

    // Load materials per slot
    const materials = engine.getSubsystem('materials') as MaterialSystem;
    const matPromises = result.slots.map(async (slot, idx) => {
      const override = overrides.get(idx);
      try {
        let absMatPath: string;
        if (override) {
          // Override paths are project-relative, need resolvePath
          try { absMatPath = projectManager.resolvePath(override); } catch { absMatPath = override; }
        } else {
          // Default material paths are already absolute from loadFluxMesh
          absMatPath = slot.defaultMaterial;
        }
        const matData = await assets.loadAsset(absMatPath, 'material') as FluxMatData | null;
        if (!matData || !materials) return null;

        // Resolve texture paths relative to the .fluxmat's directory, with project-relative fallback
        const matDir = absMatPath.substring(0, absMatPath.lastIndexOf('/'));
        const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
          let texAbsPath: string;
          if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
            texAbsPath = relPath;
          } else {
            texAbsPath = `${matDir}/${relPath}`;
            try {
              const projResolved = projectManager.resolvePath(relPath);
              const { getFileSystem } = await import('../filesystem');
              if (!(await getFileSystem().exists(texAbsPath)) && await getFileSystem().exists(projResolved)) {
                texAbsPath = projResolved;
              }
            } catch { /* keep matDir-relative */ }
          }
          const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
          return assets.loadTexture(texUrl);
        };

        return materials.createFromFluxMat(matData, loadTexture, absMatPath);
      } catch (err) {
        DebugConsole.LogWarning(`[SceneSerializer] Failed to load material for slot "${slot.name}": ${err}`);
        return null;
      }
    });

    const loadedMaterials = await Promise.all(matPromises);
    applyMaterialsToModel(scene, result.slots, loadedMaterials);
    meshComp.mesh = scene;
    applyComponentUvTransform(meshComp);
  } catch (err) {
    DebugConsole.LogError(`[SceneSerializer] Failed to load .fluxmesh "${fluxmeshPath}": ${err}`);
  }
}

/** Resolve path and load a 3D model asset onto a MeshRendererComponent */
export async function loadDeferredModel(
  engine: Engine,
  meshComp: MeshRendererComponent,
  modelPath: string,
): Promise<void> {
  try {
    let loadPath: string;
    try {
      loadPath = projectManager.resolvePath(modelPath);
    } catch {
      loadPath = modelPath;
    }

    const fileUrl = loadPath.startsWith('file://') ? loadPath : `file:///${loadPath.replace(/\\/g, '/')}`;
    const assets = engine.getSubsystem('assets') as AssetManager;
    const gltf = await assets.loadModel(fileUrl);
    const scene = gltf.scene.clone();
    scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = meshComp.castShadow;
        child.receiveShadow = meshComp.receiveShadow;
      }
    });
    meshComp.mesh = scene;
    applyComponentUvTransform(meshComp);
  } catch (err) {
    DebugConsole.LogError(`[SceneSerializer] Failed to load model "${modelPath}": ${err}`);
  }
}

/** Resolve a .fluxmat or .fluxvismat path and apply the material to a MeshRendererComponent */
export async function loadDeferredMaterial(
  engine: Engine,
  meshComp: MeshRendererComponent,
  materialPath: string,
): Promise<void> {
  try {
    let absPath: string;
    try {
      absPath = projectManager.resolvePath(materialPath);
    } catch {
      absPath = materialPath;
    }

    const assets = engine.getSubsystem('assets') as AssetManager;
    const materials = engine.getSubsystem('materials') as MaterialSystem;
    if (!materials) return;

    // Resolve texture paths relative to the material's directory, with project-relative fallback
    const matDir = absPath.substring(0, absPath.lastIndexOf('/'));
    const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
      let texAbsPath: string;
      if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
        texAbsPath = relPath;
      } else {
        texAbsPath = `${matDir}/${relPath}`;
        try {
          const projResolved = projectManager.resolvePath(relPath);
          const { getFileSystem } = await import('../filesystem');
          if (!(await getFileSystem().exists(texAbsPath)) && await getFileSystem().exists(projResolved)) {
            texAbsPath = projResolved;
          }
        } catch { /* project not loaded or path invalid — keep matDir-relative */ }
      }
      const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
      return assets.loadTexture(texUrl);
    };

    let mat: THREE.Material;

    if (materialPath.endsWith('.fluxvismat')) {
      // Visual material — compile graph to shader
      const visData = await assets.loadAsset(absPath, 'visual_material') as VisualMaterialFile | null;
      if (!visData) return;
      const result = await materials.createFromVisualMat(visData, loadTexture, materialPath);
      mat = result;
    } else {
      // Standard .fluxmat material
      const matData = await assets.loadAsset(absPath, 'material') as FluxMatData | null;
      if (!matData) return;
      mat = await materials.createFromFluxMat(matData, loadTexture, materialPath);
      // Store texture map paths in userData for round-trip serialization
      const mapKeys = ['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
      for (const key of mapKeys) {
        if (matData[key]) {
          mat.userData[key] = matData[key];
        }
      }
    }

    // Apply to mesh
    if (meshComp.mesh instanceof THREE.Mesh) {
      meshComp.mesh.material = mat;
    } else if (meshComp.mesh instanceof THREE.Group) {
      meshComp.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = mat;
        }
      });
    }
    applyComponentUvTransform(meshComp);
  } catch (err) {
    DebugConsole.LogError(`[SceneSerializer] Failed to load material "${materialPath}": ${err}`);
  }
}

// ── Geometry reconstruction ──

/** Apply component-level UV transform to all texture maps on a mesh's materials. */
function applyComponentUvTransform(meshComp: MeshRendererComponent): void {
  if (!meshComp.mesh) return;
  const { uvScale, uvOffset, uvRotation } = meshComp;
  if (uvScale.x === 1 && uvScale.y === 1 && uvOffset.x === 0 && uvOffset.y === 0 && uvRotation === 0) return;
  const rotRad = (uvRotation * Math.PI) / 180;
  const visit = (mat: THREE.Material) => {
    if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) return;
    const maps: (THREE.Texture | null)[] = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap, mat.emissiveMap];
    for (const tex of maps) {
      if (!tex) continue;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(uvScale.x, uvScale.y);
      tex.offset.set(uvOffset.x, uvOffset.y);
      tex.rotation = rotRad;
      tex.center.set(0.5, 0.5);
      tex.needsUpdate = true;
    }
  };
  const mesh = meshComp.mesh;
  if (mesh instanceof THREE.Mesh) {
    if (Array.isArray(mesh.material)) mesh.material.forEach(visit);
    else visit(mesh.material);
  } else {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) child.material.forEach(visit);
        else visit(child.material);
      }
    });
  }
}

function buildGeometry(primitiveType: string, params: any): THREE.BufferGeometry {
  switch (primitiveType) {
    case 'cube':
      return new THREE.BoxGeometry(params.width ?? 1, params.height ?? 1, params.depth ?? 1);
    case 'sphere':
      return new THREE.SphereGeometry(params.radius ?? 0.5, 32, 32);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        params.radiusTop ?? 0.5, params.radiusBottom ?? 0.5, params.height ?? 1, 32
      );
    case 'cone':
      return new THREE.ConeGeometry(params.radius ?? 0.5, params.height ?? 1, 32);
    case 'plane':
      return new THREE.PlaneGeometry(params.width ?? 1, params.height ?? 1).rotateX(-Math.PI / 2);
    case 'capsule':
      return new THREE.CapsuleGeometry(params.radius ?? 0.3, params.height ?? 0.6, 8, 16);
    case 'torus':
      return new THREE.TorusGeometry(params.radius ?? 0.5, params.tube ?? 0.15, 16, 48);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

// ── File I/O helpers ──

export async function saveSceneToFile(
  scene: Scene,
  engine: Engine,
  filePath: string,
  editorCamera?: THREE.PerspectiveCamera,
  orbitTarget?: THREE.Vector3
): Promise<void> {
  const api = window.fluxionAPI;
  if (!api) throw new Error('fluxionAPI not available');

  const data = serializeScene(scene, engine, editorCamera, orbitTarget);
  await api.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function loadSceneFromFile(
  engine: Engine,
  scene: Scene,
  filePath: string
): Promise<SceneFileData> {
  const api = window.fluxionAPI;
  if (!api) throw new Error('fluxionAPI not available');

  const content = await api.readFile(filePath);
  const data = JSON.parse(content) as SceneFileData;
  deserializeScene(engine, data, scene);
  return data;
}

// ── Entity snapshot helpers (used by UndoService DeleteEntityCommand) ──

/** Serialize one entity's components using per-component serialize() method. */
function _serializeEntityComponents(entityId: EntityId, engine: Engine): SerializedComponent[] {
  return engine.ecs.getAllComponents(entityId).map(comp => ({
    type: comp.type,
    data: (comp as BaseComponent).serialize(),
  }));
}

/**
 * Serialize an entity and all its descendants (BFS order, root first).
 * Used by DeleteEntityCommand for full undo support.
 */
export function snapshotEntitySubtree(rootId: EntityId, engine: Engine): SerializedEntity[] {
  const result: SerializedEntity[] = [];
  const queue: EntityId[] = [rootId];
  while (queue.length > 0) {
    const entityId = queue.shift()!;
    result.push({
      id: entityId as number,
      name: engine.ecs.getEntityName(entityId),
      parent: (engine.ecs.getParent(entityId) as number | undefined) ?? null,
      tags: [],
      components: _serializeEntityComponents(entityId, engine),
    });
    for (const childId of engine.ecs.getChildren(entityId)) queue.push(childId);
  }
  return result;
}

/**
 * Restore a subtree snapshot created by snapshotEntitySubtree.
 * Creates new entities with new IDs, remaps parent references, defers asset loads.
 * Returns the new root entity ID.
 */
export function restoreEntitySubtree(
  entities: SerializedEntity[],
  engine: Engine,
  onRootRestored?: (newRootId: EntityId) => void,
): EntityId {
  if (entities.length === 0) return -1 as EntityId;

  const ctx: DeserializationContext = {
    engine,
    entityIdMap: new Map(),
    deferredModelLoads: [],
    deferredMaterialLoads: [],
  };
  let newRootId: EntityId = -1 as EntityId;

  for (const entityData of entities) {
    const entityId = engine.ecs.createEntity(entityData.name);
    ctx.entityIdMap.set(entityData.id, entityId);
    if (entityData.id === entities[0].id) newRootId = entityId;

    for (const compData of entityData.components) {
      const comp = ComponentRegistry.create(compData.type);
      if (!comp) {
        DebugConsole.LogWarning(`[SceneSerializer] Unknown component: "${compData.type}" — skipped.`);
        continue;
      }
      (comp as BaseComponent).deserialize(compData.data, ctx);
      engine.ecs.addComponent(entityId, comp);
    }
  }

  // Remap parent relationships
  for (const entityData of entities) {
    if (entityData.parent !== null) {
      const newChildId = ctx.entityIdMap.get(entityData.id)!;
      const newParentId = ctx.entityIdMap.get(entityData.parent);
      if (newParentId !== undefined) {
        engine.ecs.setParent(newChildId, newParentId);
      } else {
        engine.ecs.setParent(newChildId, entityData.parent as EntityId);
      }
    }
  }

  for (const d of ctx.deferredModelLoads)    loadDeferredModel(engine, d.meshComp, d.modelPath);
  for (const d of ctx.deferredMaterialLoads) loadDeferredMaterial(engine, d.meshComp, d.materialPath);

  onRootRestored?.(newRootId);
  return newRootId;
}

// ── Register snapshot helpers into UndoService (avoids circular import) ──
// Import is deferred to avoid top-level circular reference.
import('../../editor/core/UndoService').then(({ registerSnapshotHelpers }) => {
  registerSnapshotHelpers(snapshotEntitySubtree, restoreEntitySubtree);
}).catch(() => { /* editor not loaded in runtime builds */ });
