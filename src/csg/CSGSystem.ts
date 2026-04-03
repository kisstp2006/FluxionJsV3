// ============================================================
// FluxionJS V3 — CSG ECS System
// Manages CSGBrushComponent entities: builds CSG primitives
// in Rust, applies boolean operations, generates THREE.Mesh,
// and integrates with FluxionRenderer.
// ============================================================

import * as THREE from 'three';
import { toLocalUrl } from '../utils/localUrl';
import { ECSManager, EntityId, System } from '../core/ECS';
import { TransformComponent, CSGBrushComponent } from '../core/Components';
import {
  buildPrimitiveAsync, meshDataToGeometry,
  csgOpBatchAsync, type CsgMeshData, type PrimitiveRequest,
} from './CSGBridge';

/** Default brush material (gray PBR) */
function createDefaultBrushMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x808080,
    roughness: 0.85,
    metalness: 0.0,
  });
}

/**
 * Build a CsgMeshData from a brush component + transform in one Rust call.
 * The mat4 is passed so Rust applies the world transform to all vertices.
 */
async function buildEntryMesh(
  brush: CSGBrushComponent,
  transform: TransformComponent,
): Promise<CsgMeshData> {
  const mat4Obj = new THREE.Matrix4();
  mat4Obj.compose(transform.position, transform.quaternion, transform.scale);
  const mat4 = Array.from(mat4Obj.elements);

  const sx  = brush.size.x;
  const sy  = brush.size.y;
  const sz  = brush.size.z;
  const r   = brush.radius;
  const seg = Math.max(6, brush.segments);

  const uvScale  = [brush.uvScale.x,  brush.uvScale.y];
  const uvOffset = [brush.uvOffset.x, brush.uvOffset.y];

  let req: PrimitiveRequest;
  switch (brush.shape) {
    case 'box':
      req = { shape: 'box', sx, sy, sz, mat4, uvScale, uvOffset };
      break;
    case 'cylinder':
      req = { shape: 'cylinder', radius: r, height: sy, slices: seg, mat4, uvScale, uvOffset };
      break;
    case 'cone':
      req = { shape: 'cone', radius: r, height: sy, slices: seg, mat4, uvScale, uvOffset };
      break;
    case 'sphere':
      req = { shape: 'sphere', radius: r, slices: seg, stacks: Math.max(4, Math.floor(seg / 2)), mat4, uvScale, uvOffset };
      break;
    case 'wedge':
      req = { shape: 'wedge', sx, sy, sz, mat4, uvScale, uvOffset };
      break;
    case 'stairs':
      req = { shape: 'stairs', sx, sy, sz, steps: Math.max(1, brush.stairSteps), mat4, uvScale, uvOffset };
      break;
    case 'arch':
      req = { shape: 'arch', sx, sy, sz, archRadius: r, segments: seg, mat4, uvScale, uvOffset };
      break;
    default:
      req = { shape: 'box', sx, sy, sz, mat4, uvScale, uvOffset };
  }

  return buildPrimitiveAsync(req);
}

// ── System ──

interface BrushEntry {
  entity: EntityId;
  brush: CSGBrushComponent;
  transform: TransformComponent;
  version: number;
  transformHash: string;
}

function transformHash(t: TransformComponent): string {
  return `${t.position.x},${t.position.y},${t.position.z},` +
    `${t.quaternion.x},${t.quaternion.y},${t.quaternion.z},${t.quaternion.w},` +
    `${t.scale.x},${t.scale.y},${t.scale.z}`;
}

export class CSGSystem implements System {
  readonly name = 'CSGSystem';
  readonly requiredComponents = ['Transform', 'CSGBrush'];
  priority = -5; // Run before MeshRendererSystem (priority 0) but after TransformSync (-100)
  enabled = true;

  private renderer: any; // FluxionRenderer
  private tracked = new Map<EntityId, BrushEntry>();
  private resultMesh: THREE.Mesh | null = null;
  private needsRebuild = false;
  /** True while an async CSG operation is in flight — prevents double rebuilds. */
  private _rebuilding = false;
  private defaultMaterial = createDefaultBrushMaterial();
  /** The material path that was last applied (or is being loaded). */
  private currentMaterialPath: string | null = null;

  constructor(renderer: any) {
    this.renderer = renderer;
  }

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    let dirty = false;

    // Detect new / changed / removed brushes
    for (const entity of entities) {
      const brush = ecs.getComponent<CSGBrushComponent>(entity, 'CSGBrush');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!brush || !transform) continue;

      const existing = this.tracked.get(entity);
      const tHash = transformHash(transform);

      if (!existing) {
        // New brush
        this.tracked.set(entity, { entity, brush, transform, version: brush._version, transformHash: tHash });
        dirty = true;
      } else if (brush._dirty || brush.__dirty || existing.version !== brush._version || existing.transformHash !== tHash) {
        existing.version = brush._version;
        existing.transformHash = tHash;
        dirty = true;
      }

      brush._dirty = false;
      brush.__dirty = false;
    }

    // Removed brushes
    for (const entity of this.tracked.keys()) {
      if (!entities.has(entity)) {
        this.tracked.delete(entity);
        dirty = true;
      }
    }

    if (dirty) this.needsRebuild = true;

    if (this.needsRebuild && !this._rebuilding) {
      this.needsRebuild = false;
      this._rebuilding = true;
      this.rebuild(ecs)
        .catch(err => console.error('[CSGSystem] Rebuild failed:', err))
        .finally(() => { this._rebuilding = false; });
    }
  }

  private async rebuild(_ecs: ECSManager): Promise<void> {
    // Collect all brush entries sorted by entity ID for determinism
    const entries = [...this.tracked.values()].sort((a, b) => a.entity - b.entity);

    if (entries.length === 0) {
      this.removeResultMesh();
      return;
    }

    // Build all primitives in Rust (parallel, order preserved by Promise.all)
    const meshes = await Promise.all(
      entries.map(e => buildEntryMesh(e.brush, e.transform)),
    );

    // Separate additive and subtractive (preserving sort order)
    const additive:    { mesh: CsgMeshData; entry: BrushEntry }[] = [];
    const subtractive: { mesh: CsgMeshData; entry: BrushEntry }[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].brush.operation === 'subtractive') {
        subtractive.push({ mesh: meshes[i], entry: entries[i] });
      } else {
        additive.push({ mesh: meshes[i], entry: entries[i] });
      }
    }

    if (additive.length === 0) {
      this.removeResultMesh();
      return;
    }

    // Batch all boolean ops in a single Rust round-trip
    const baseMesh = additive[0].mesh;
    const ops: { op: 'union' | 'subtract'; mesh: CsgMeshData }[] = [
      ...additive.slice(1).map(e => ({ op: 'union' as const,     mesh: e.mesh })),
      ...subtractive.map(e  => ({ op: 'subtract' as const, mesh: e.mesh })),
    ];

    const resultData = await csgOpBatchAsync(baseMesh, ops);
    const geometry = meshDataToGeometry(resultData);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    // Create or update mesh
    if (!this.resultMesh) {
      this.resultMesh = new THREE.Mesh(geometry, this.defaultMaterial);
      this.resultMesh.castShadow = true;
      this.resultMesh.receiveShadow = true;
      this.resultMesh.name = '__csg_result__';
      this.renderer.scene.add(this.resultMesh);
    } else {
      this.resultMesh.geometry.dispose();
      this.resultMesh.geometry = geometry;
    }

    // Update shadow flags from first additive brush
    const first = additive[0].entry.brush;
    this.resultMesh.castShadow = first.castShadow;
    this.resultMesh.receiveShadow = first.receiveShadow;

    // Load material from first additive brush's materialPath
    const matPath = first.materialPath ?? null;
    if (matPath !== this.currentMaterialPath) {
      this.currentMaterialPath = matPath;
      if (matPath) {
        void this.loadAndApplyMaterial(matPath);
      } else {
        this.resultMesh.material = this.defaultMaterial;
      }
    }
  }

  private async loadAndApplyMaterial(path: string): Promise<void> {
    try {
      const { projectManager } = await import('../project/ProjectManager');
      let absPath: string;
      try { absPath = projectManager.resolvePath(path); } catch { absPath = path; }

      const engine = this.renderer.engine;
      const assets = engine.getSubsystem('assets');
      const materials = engine.getSubsystem('materials');
      if (!assets || !materials) return;

      const matDir = absPath.substring(0, absPath.lastIndexOf('/'));
      const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
        let texAbs: string;
        if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
          texAbs = relPath;
        } else if (relPath.startsWith('..')) {
          texAbs = `${matDir}/${relPath}`;
        } else {
          try { texAbs = projectManager.resolvePath(relPath); } catch { texAbs = `${matDir}/${relPath}`; }
        }
        return assets.loadTexture(toLocalUrl(texAbs));
      };

      let mat: THREE.Material;
      if (path.endsWith('.fluxvismat')) {
        const visData = await assets.loadAsset(absPath, 'visual_material');
        if (!visData) return;
        mat = await materials.createFromVisualMat(visData, loadTexture, path);
      } else {
        const matData = await assets.loadAsset(absPath, 'material');
        if (!matData) return;
        mat = await materials.createFromFluxMat(matData, loadTexture, path);
      }

      // Only apply if the path hasn't been replaced while loading
      if (this.currentMaterialPath === path && this.resultMesh) {
        this.resultMesh.material = mat;
      } else {
        mat.dispose();
      }
    } catch (err) {
      console.warn('[CSGSystem] Failed to load material:', path, err);
    }
  }

  private removeResultMesh(): void {
    if (this.resultMesh) {
      this.resultMesh.geometry.dispose();
      this.renderer.scene.remove(this.resultMesh);
      this.resultMesh = null;
    }
  }

  /** Get the combined result mesh (for external access, e.g. physics) */
  getResultMesh(): THREE.Mesh | null {
    return this.resultMesh;
  }

  /** Set a material for the CSG result mesh */
  setResultMaterial(material: THREE.Material): void {
    if (this.resultMesh) {
      this.resultMesh.material = material;
    }
  }

  /** Force a full rebuild on next update */
  markDirty(): void {
    this.needsRebuild = true;
  }

  onSceneClear(): void {
    this.removeResultMesh();
    this.tracked.clear();
    this.needsRebuild = false;
    this.currentMaterialPath = null;
  }

  destroy(): void {
    this.removeResultMesh();
    this.defaultMaterial.dispose();
    this.tracked.clear();
  }
}
