// ============================================================
// FluxionJS V3 — Viewport Drop Service
// Unified, pluggable system for handling asset drops onto the
// 3D viewport. Inspired by Stride's drag-drop entity pipeline
// and ezEngine's asset instantiation registry.
//
// Each supported asset type registers a handler that receives
// the drop context (ray hit, engine, asset info) and decides
// what to do: create entities, apply materials, etc.
// ============================================================

import * as THREE from 'three';
import { AssetTypeRegistry, AssetTypeDefinition } from '../../src/assets/AssetTypeRegistry';
import { AssetManager } from '../../src/assets/AssetManager';
import { FluxMatData } from '../../src/renderer/MaterialSystem';
import { MeshRendererComponent, AudioSourceComponent, TransformComponent, FuiComponent, CSGBrushComponent } from '../../src/core/Components';
import type { EngineSubsystems } from './EditorEngine';
import type { EntityId } from '../../src/core/ECS';
import { getFileSystem } from '../../src/filesystem';
import { parseFuiJson } from '../../src/ui/FuiParser';

// ── Types ──

/** Raycast result for the drop location */
export interface DropHitInfo {
  /** World-space position where the ray hits geometry (or origin if nothing hit) */
  worldPos: THREE.Vector3;
  /** Entity under the cursor, if any */
  entityUnderCursor: EntityId | null;
  /** The THREE.Object3D that was hit */
  hitObject: THREE.Object3D | null;
}

/** Context passed to every drop handler */
export interface ViewportDropContext {
  /** Project-relative asset path */
  assetPath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** Resolved asset type definition */
  typeDef: AssetTypeDefinition;
  /** Raycast hit info */
  hit: DropHitInfo;
  /** Engine subsystems */
  engine: EngineSubsystems;
  /** Logging callback */
  log: (text: string, type?: 'info' | 'warn' | 'error') => void;
}

/** Result returned from a drop handler */
export interface ViewportDropResult {
  /** Entity to select after the drop (if any) */
  selectEntity?: EntityId | null;
  /** Whether the scene was modified */
  sceneModified?: boolean;
  /** User-facing message */
  message?: string;
}

/**
 * A handler function for a specific asset type.
 * Returns null if it cannot handle the drop (pass to next handler).
 */
export type ViewportDropHandlerFn = (ctx: ViewportDropContext) => Promise<ViewportDropResult | null>;

// ── Registry ──

class ViewportDropServiceImpl {
  /**
   * Map of asset type → handler function.
   * Checked in priority order: exact type match first, then '*' wildcard.
   */
  private handlers = new Map<string, ViewportDropHandlerFn>();

  /** Register a handler for a specific asset type id (from AssetTypeRegistry) */
  register(assetType: string, handler: ViewportDropHandlerFn): void {
    this.handlers.set(assetType, handler);
  }

  /** Check if any handler can accept this asset type */
  canHandle(assetPath: string): boolean {
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef) return false;
    return this.handlers.has(typeDef.type) || this.handlers.has('*');
  }

  /** Get a user-friendly label for what will happen on drop */
  getDropLabel(assetPath: string): string | null {
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef) return null;
    const labels: Record<string, string> = {
      model: 'Add Model',
      mesh: 'Add Model',
      material: 'Apply Material',
      texture: 'Apply Texture',
      audio: 'Add Audio Source',
      scene: 'Load Scene',
      prefab: 'Instantiate Prefab',
    };
    return labels[typeDef.type] ?? null;
  }

  /**
   * Execute the drop. Resolves type, finds handler, runs it.
   * Returns result or null if no handler matched.
   */
  async handleDrop(
    assetPath: string,
    absolutePath: string,
    hit: DropHitInfo,
    engine: EngineSubsystems,
    log: (text: string, type?: 'info' | 'warn' | 'error') => void,
  ): Promise<ViewportDropResult | null> {
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef) {
      log(`Unknown asset type: ${assetPath}`, 'warn');
      return null;
    }

    const ctx: ViewportDropContext = { assetPath, absolutePath, typeDef, hit, engine, log };

    // Try exact type handler
    const handler = this.handlers.get(typeDef.type) ?? this.handlers.get('*');
    if (!handler) {
      log(`No viewport handler for type: ${typeDef.displayName}`, 'warn');
      return null;
    }

    return handler(ctx);
  }
}

export const ViewportDropService = new ViewportDropServiceImpl();

// ── Shared utilities ──

/** Resolve a project-relative path to an absolute one */
async function resolveAssetPath(relPath: string): Promise<string> {
  const { projectManager } = await import('../../src/project/ProjectManager');
  try { return projectManager.resolvePath(relPath); } catch { return relPath; }
}

/** Create a file:// URL from an absolute path */
function toFileUrl(absPath: string): string {
  return absPath.startsWith('file://') ? absPath : `file:///${absPath.replace(/\\/g, '/')}`;
}

/** Build a texture loader that resolves paths relative to a given directory */
function makeTextureLoader(
  assets: AssetManager,
  baseDir: string,
): (relPath: string) => Promise<THREE.Texture> {
  return async (relPath: string): Promise<THREE.Texture> => {
    let absPath: string;
    if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
      absPath = relPath;
    } else {
      absPath = `${baseDir}/${relPath}`;
    }
    return assets.loadTexture(toFileUrl(absPath));
  };
}

/** Extract entity name from an asset path */
function entityNameFromPath(assetPath: string): string {
  const fileName = assetPath.replace(/\\/g, '/').split('/').pop() || 'Asset';
  return fileName.replace(/\.[^.]+$/, '');
}

// ── Built-in handlers ──

// ── Model / Mesh drop: create a new entity with MeshRenderer ──

ViewportDropService.register('model', handleModelDrop);
ViewportDropService.register('mesh', handleModelDrop);

async function handleModelDrop(ctx: ViewportDropContext): Promise<ViewportDropResult> {
  const { assetPath, absolutePath, hit, engine, log } = ctx;
  const entityName = entityNameFromPath(assetPath);

  try {
    const entityId = await engine.scene.createModelEntity(
      entityName,
      assetPath,
      absolutePath || undefined,
    );
    // Position at drop point
    const t = engine.engine.ecs.getComponent<TransformComponent>(entityId, 'Transform');
    if (t) t.position.copy(hit.worldPos);

    log(`Added model: ${entityName}`, 'info');
    return { selectEntity: entityId, sceneModified: true };
  } catch (err: any) {
    log(`Failed to load model: ${err.message}`, 'error');
    return {};
  }
}

// ── Material drop: apply to entity under cursor ──

ViewportDropService.register('material', async (ctx) => {
  const { assetPath, hit, engine, log } = ctx;

  if (hit.entityUnderCursor === null) {
    log('Drop a material onto a mesh to apply it', 'warn');
    return null;
  }

  const mr = engine.engine.ecs.getComponent<MeshRendererComponent>(
    hit.entityUnderCursor,
    'MeshRenderer',
  );

  // ── CSGBrush fallback ──
  if (!mr) {
    const brush = engine.engine.ecs.getComponent<CSGBrushComponent>(
      hit.entityUnderCursor,
      'CSGBrush',
    );
    if (brush) {
      return applyMaterialToCsg(assetPath, brush, engine, log);
    }
    log('Target entity has no mesh to apply material to', 'warn');
    return null;
  }

  if (!mr.mesh) {
    log('Target entity has no mesh to apply material to', 'warn');
    return null;
  }

  try {
    const absPath = await resolveAssetPath(assetPath);
    const assets = engine.assets;
    const materials = engine.materials;

    const matData = await assets.loadAsset(absPath, 'material') as FluxMatData | null;
    if (!matData) {
      log('Failed to load material data', 'error');
      return null;
    }

    const matDir = absPath.substring(0, absPath.lastIndexOf('/'));
    const loadTexture = makeTextureLoader(assets, matDir);
    const mat = await materials.createFromFluxMat(matData, loadTexture, assetPath);

    // Check if this is a .fluxmesh model with material slots
    const isFluxMesh = mr.modelPath?.endsWith('.fluxmesh') ?? false;

    if (isFluxMesh && mr.modelPath) {
      const slotIndex = findHitSlotIndex(mr.mesh, hit.hitObject);
      if (slotIndex >= 0) {
        const overrides = mr.materialSlots ? [...mr.materialSlots] : [];
        const existingIdx = overrides.findIndex(o => o.slotIndex === slotIndex);
        if (existingIdx >= 0) {
          overrides[existingIdx] = { slotIndex, materialPath: assetPath };
        } else {
          overrides.push({ slotIndex, materialPath: assetPath });
        }
        mr.materialSlots = overrides;
        applyMaterialToSlotMeshes(mr.mesh, slotIndex, mat);
        log(`Applied material to slot ${slotIndex}: ${entityNameFromPath(assetPath)}`, 'info');
      } else {
        applyMaterialToAllMeshes(mr.mesh, mat);
        mr.materialPath = assetPath;
        log(`Applied material to all meshes: ${entityNameFromPath(assetPath)}`, 'info');
      }
    } else {
      applyMaterialToAllMeshes(mr.mesh, mat);
      mr.materialPath = assetPath;
      log(`Applied material: ${entityNameFromPath(assetPath)}`, 'info');
    }

    return { selectEntity: hit.entityUnderCursor, sceneModified: true };
  } catch (err: any) {
    log(`Failed to apply material: ${err.message}`, 'error');
    return null;
  }
});

/** Apply a .fluxmat or .fluxvismat material to the CSG result mesh */
async function applyMaterialToCsg(
  assetPath: string,
  brush: CSGBrushComponent,
  engine: EngineSubsystems,
  log: ViewportDropContext['log'],
): Promise<ViewportDropResult | null> {
  try {
    const absPath = await resolveAssetPath(assetPath);
    const assets = engine.assets;
    const materials = engine.materials;
    const matDir = absPath.substring(0, absPath.lastIndexOf('/'));
    const loadTexture = makeTextureLoader(assets, matDir);

    let mat: THREE.Material;
    if (assetPath.endsWith('.fluxvismat')) {
      const visData = await assets.loadAsset(absPath, 'visual_material') as any;
      if (!visData) { log('Failed to load visual material', 'error'); return null; }
      mat = await materials.createFromVisualMat(visData, loadTexture, assetPath);
    } else {
      const matData = await assets.loadAsset(absPath, 'material') as FluxMatData | null;
      if (!matData) { log('Failed to load material data', 'error'); return null; }
      mat = await materials.createFromFluxMat(matData, loadTexture, assetPath);
    }

    brush.materialPath = assetPath;
    const csg = engine.csgSystem;
    csg.setResultMaterial(mat);
    log(`Applied material to CSG: ${entityNameFromPath(assetPath)}`, 'info');
    return { sceneModified: true };
  } catch (err: any) {
    log(`Failed to apply material to CSG: ${err.message}`, 'error');
    return null;
  }
}

/** Apply a material to all Mesh children of a scene graph */
function applyMaterialToAllMeshes(root: THREE.Object3D, mat: THREE.Material): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = mat;
    }
  });
  if (root instanceof THREE.Mesh) {
    root.material = mat;
  }
}

/** Apply a material to sub-meshes belonging to a specific slot index (depth-first order) */
function applyMaterialToSlotMeshes(
  root: THREE.Object3D,
  targetMeshIndex: number,
  mat: THREE.Material,
): void {
  let idx = 0;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (idx === targetMeshIndex) {
        child.material = mat;
      }
      idx++;
    }
  });
}

/** Find the depth-first mesh index of a hit object within a model hierarchy */
function findHitSlotIndex(
  root: THREE.Object3D,
  hitObject: THREE.Object3D | null,
): number {
  if (!hitObject) return -1;
  let idx = 0;
  let found = -1;
  root.traverse((child) => {
    if (found >= 0) return;
    if (child instanceof THREE.Mesh) {
      if (child === hitObject || child.uuid === hitObject.uuid) {
        found = idx;
      }
      idx++;
    }
  });
  return found;
}

// ── Texture drop: apply as albedo map to entity under cursor ──

ViewportDropService.register('texture', async (ctx) => {
  const { assetPath, absolutePath, hit, engine, log } = ctx;

  if (hit.entityUnderCursor === null) {
    log('Drop a texture onto a mesh to apply it as albedo', 'warn');
    return null;
  }

  const mr = engine.engine.ecs.getComponent<MeshRendererComponent>(
    hit.entityUnderCursor,
    'MeshRenderer',
  );

  // ── CSGBrush fallback ──
  if (!mr) {
    const brush = engine.engine.ecs.getComponent<CSGBrushComponent>(
      hit.entityUnderCursor,
      'CSGBrush',
    );
    if (brush) {
      try {
        const absPath = absolutePath || await resolveAssetPath(assetPath);
        const texture = await engine.assets.loadTexture(toFileUrl(absPath));
        texture.colorSpace = THREE.SRGBColorSpace;
        const resultMesh = engine.csgSystem.getResultMesh();
        if (resultMesh) {
          const mat = resultMesh.material as THREE.Material;
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.map = texture;
            mat.needsUpdate = true;
          } else {
            resultMesh.material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0 });
          }
        }
        log(`Applied texture to CSG: ${entityNameFromPath(assetPath)}`, 'info');
        return { sceneModified: true };
      } catch (err: any) {
        log(`Failed to apply texture to CSG: ${err.message}`, 'error');
        return null;
      }
    }
    log('Target entity has no mesh to apply texture to', 'warn');
    return null;
  }

  if (!mr.mesh) {
    log('Target entity has no mesh to apply texture to', 'warn');
    return null;
  }

  try {
    const absPath = absolutePath || await resolveAssetPath(assetPath);
    const texture = await engine.assets.loadTexture(toFileUrl(absPath));
    texture.colorSpace = THREE.SRGBColorSpace;

    const targetMat = findMaterialAtHit(mr.mesh, hit.hitObject);
    if (targetMat instanceof THREE.MeshStandardMaterial) {
      targetMat.map = texture;
      targetMat.needsUpdate = true;
      log(`Applied texture as albedo: ${entityNameFromPath(assetPath)}`, 'info');
    } else {
      const newMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.5,
        metalness: 0.0,
      });
      applyMaterialAtHit(mr.mesh, hit.hitObject, newMat);
      log(`Applied texture with new material: ${entityNameFromPath(assetPath)}`, 'info');
    }

    return { selectEntity: hit.entityUnderCursor, sceneModified: true };
  } catch (err: any) {
    log(`Failed to apply texture: ${err.message}`, 'error');
    return null;
  }
});

// ── FUI drop: attach UI component ───────────────────────────────

ViewportDropService.register('fui', async (ctx) => {
  const { assetPath, absolutePath, hit, engine, log } = ctx;

  // Find or create target entity.
  let target = hit.entityUnderCursor;
  if (target == null) {
    target = engine.scene.createEmpty(`UI: ${assetPath.split(/[\\/]/).pop()?.replace(/\.fui$/i, '') ?? 'FUI'}`);
    const t = engine.engine.ecs.getComponent<TransformComponent>(target, 'Transform');
    if (t) t.position.copy(hit.worldPos);
  }

  try {
    const ecs = engine.engine.ecs;
    if (!ecs.hasComponent(target, 'Fui')) {
      const comp = new FuiComponent();
      comp.fuiPath = assetPath;
      ecs.addComponent(target, comp);
    } else {
      const comp = ecs.getComponent<FuiComponent>(target, 'Fui');
      if (comp) comp.fuiPath = assetPath;
    }

    // Optional: initialize screen dimensions from document canvas.
    const fs = getFileSystem();
    const raw = await fs.readFile(absolutePath);
    const doc = parseFuiJson(raw);
    const comp = engine.engine.ecs.getComponent<FuiComponent>(target, 'Fui');
    if (comp) {
      comp.mode = doc.mode;
      comp.screenWidth = doc.canvas.width;
      comp.screenHeight = doc.canvas.height;
    }

    log(`Attached FUI: ${assetPath}`, 'info');
    return { selectEntity: target, sceneModified: true };
  } catch (e: any) {
    log(`Failed to attach FUI: ${e?.message ?? String(e)}`, 'error');
    return null;
  }
});

/** Find the THREE material at the hit point within a model */
function findMaterialAtHit(
  root: THREE.Object3D,
  hitObject: THREE.Object3D | null,
): THREE.Material | null {
  // Direct hit on a mesh
  if (hitObject instanceof THREE.Mesh && hitObject.material) {
    return Array.isArray(hitObject.material) ? hitObject.material[0] : hitObject.material;
  }
  // Fallback: first mesh in the hierarchy
  if (root instanceof THREE.Mesh && root.material) {
    return Array.isArray(root.material) ? root.material[0] : root.material;
  }
  let found: THREE.Material | null = null;
  root.traverse((child) => {
    if (!found && child instanceof THREE.Mesh && child.material) {
      found = Array.isArray(child.material) ? child.material[0] : child.material;
    }
  });
  return found;
}

/** Apply a material to the hit mesh (or all meshes if no specific hit) */
function applyMaterialAtHit(
  root: THREE.Object3D,
  hitObject: THREE.Object3D | null,
  mat: THREE.Material,
): void {
  if (hitObject instanceof THREE.Mesh) {
    hitObject.material = mat;
    return;
  }
  applyMaterialToAllMeshes(root, mat);
}

// ── Audio drop: create entity with AudioSource component ──

ViewportDropService.register('audio', async (ctx) => {
  const { assetPath, hit, engine, log } = ctx;
  const entityName = entityNameFromPath(assetPath);

  const entityId = engine.scene.createEmpty(entityName);
  const t = engine.engine.ecs.getComponent<TransformComponent>(entityId, 'Transform');
  if (t) t.position.copy(hit.worldPos);

  const audioComp = new AudioSourceComponent();
  audioComp.clip = assetPath;
  audioComp.spatial = true;
  audioComp.playOnStart = false;
  engine.engine.ecs.addComponent(entityId, audioComp);

  log(`Added audio source: ${entityName}`, 'info');
  return { selectEntity: entityId, sceneModified: true };
});

// ── Scene drop: load the scene (with confirmation) ──

ViewportDropService.register('scene', async (ctx) => {
  const { assetPath, absolutePath, engine, log } = ctx;

  // Check if current scene has unsaved changes
  if (engine.scene.isDirty) {
    // Simple browser confirm — works in Electron renderer
    const ok = window.confirm(
      'Current scene has unsaved changes. Load the dropped scene anyway?',
    );
    if (!ok) return null;
  }

  try {
    const { loadProjectScene } = await import('./SceneService');
    const absPath = absolutePath || await resolveAssetPath(assetPath);
    await loadProjectScene(engine, absPath, log as any);
    log(`Loaded scene: ${entityNameFromPath(assetPath)}`, 'info');
    return { selectEntity: null, sceneModified: false };
  } catch (err: any) {
    log(`Failed to load scene: ${err.message}`, 'error');
    return null;
  }
});

// ── Visual material drop: apply .fluxvismat to entity under cursor ──

ViewportDropService.register('visual_material', async (ctx) => {
  const { assetPath, hit, engine, log } = ctx;

  if (hit.entityUnderCursor === null) {
    log('Drop a visual material onto a mesh to apply it', 'warn');
    return null;
  }

  const mr = engine.engine.ecs.getComponent<MeshRendererComponent>(hit.entityUnderCursor, 'MeshRenderer');

  // CSGBrush fallback
  if (!mr) {
    const brush = engine.engine.ecs.getComponent<CSGBrushComponent>(hit.entityUnderCursor, 'CSGBrush');
    if (brush) return applyMaterialToCsg(assetPath, brush, engine, log);
    log('Target entity has no mesh to apply visual material to', 'warn');
    return null;
  }

  if (!mr.mesh) {
    log('Target entity has no mesh to apply visual material to', 'warn');
    return null;
  }

  try {
    const absPath = await resolveAssetPath(assetPath);
    const assets = engine.assets;
    const materials = engine.materials;
    const matDir = absPath.substring(0, absPath.lastIndexOf('/'));
    const loadTexture = makeTextureLoader(assets, matDir);

    const visData = await assets.loadAsset(absPath, 'visual_material') as any;
    if (!visData) { log('Failed to load visual material data', 'error'); return null; }

    const mat = await materials.createFromVisualMat(visData, loadTexture, assetPath);
    applyMaterialToAllMeshes(mr.mesh, mat);
    mr.materialPath = assetPath;
    log(`Applied visual material: ${entityNameFromPath(assetPath)}`, 'info');
    return { selectEntity: hit.entityUnderCursor, sceneModified: true };
  } catch (err: any) {
    log(`Failed to apply visual material: ${err.message}`, 'error');
    return null;
  }
});
