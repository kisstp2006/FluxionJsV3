// ============================================================
// FluxionJS V3 — CSG ECS System
// Manages CSGBrushComponent entities: builds CSG primitives,
// applies boolean operations, generates THREE.Mesh, and
// integrates with FluxionRenderer.
// ============================================================

import * as THREE from 'three';
import { ECSManager, EntityId, System } from '../core/ECS';
import { TransformComponent, CSGBrushComponent } from '../core/Components';
import { CSG, CSGPlane, Vec3 } from './CSGCore';
import { csgToGeometry } from './CSGBridge';

/** Default brush material (gray PBR) */
function createDefaultBrushMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x808080,
    roughness: 0.85,
    metalness: 0.0,
  });
}

/** Generate a CSG solid from a brush component's shape & dimensions */
function buildBrushCSG(brush: CSGBrushComponent): CSG {
  const sx = brush.size.x;
  const sy = brush.size.y;
  const sz = brush.size.z;
  const r = brush.radius;
  const seg = Math.max(6, brush.segments);

  switch (brush.shape) {
    case 'box':
      return CSG.box(0, 0, 0, sx, sy, sz);
    case 'cylinder':
      return CSG.cylinder(0, 0, 0, r, sy, seg);
    case 'cone':
      return CSG.cylinder(0, 0, 0, r, sy, seg, 0.001);
    case 'sphere':
      return CSG.sphere(0, 0, 0, r, seg, Math.max(4, Math.floor(seg / 2)));
    case 'wedge':
      return CSG.wedge(0, 0, 0, sx, sy, sz);
    case 'stairs':
      return CSG.stairs(0, 0, 0, sx, sy, sz, Math.max(1, brush.stairSteps));
    case 'arch':
      return CSG.arch(0, 0, 0, sx, sy, sz, r, seg);
    default:
      return CSG.box(0, 0, 0, sx, sy, sz);
  }
}

/** Apply transform to CSG polygons (position + rotation + scale) */
function transformCSG(csg: CSG, transform: TransformComponent): CSG {
  const mat4 = new THREE.Matrix4();
  mat4.compose(
    transform.position,
    transform.quaternion,
    transform.scale,
  );
  const normalMat = new THREE.Matrix3().getNormalMatrix(mat4);
  const result = csg.clone();
  for (const poly of result.polygons) {
    for (const v of poly.vertices) {
      const p = new THREE.Vector3(v.pos.x, v.pos.y, v.pos.z).applyMatrix4(mat4);
      v.pos.x = p.x; v.pos.y = p.y; v.pos.z = p.z;
      const n = new THREE.Vector3(v.normal.x, v.normal.y, v.normal.z).applyMatrix3(normalMat).normalize();
      v.normal.x = n.x; v.normal.y = n.y; v.normal.z = n.z;
    }
    // Recompute plane from first 3 verts
    if (poly.vertices.length >= 3) {
      const a = poly.vertices[0].pos, b = poly.vertices[1].pos, c = poly.vertices[2].pos;
      poly.plane = CSGPlane.fromPoints(
        new Vec3(a.x, a.y, a.z),
        new Vec3(b.x, b.y, b.z),
        new Vec3(c.x, c.y, c.z),
      );
    }
  }
  return result;
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
      } else if (brush._dirty || existing.version !== brush._version || existing.transformHash !== tHash) {
        existing.version = brush._version;
        existing.transformHash = tHash;
        dirty = true;
      }

      brush._dirty = false;
    }

    // Removed brushes
    for (const entity of this.tracked.keys()) {
      if (!entities.has(entity)) {
        this.tracked.delete(entity);
        dirty = true;
      }
    }

    if (dirty) this.needsRebuild = true;

    if (this.needsRebuild) {
      this.rebuild(ecs);
      this.needsRebuild = false;
    }
  }

  private rebuild(_ecs: ECSManager): void {
    // Collect all brush entries sorted by entity ID for determinism
    const entries = [...this.tracked.values()].sort((a, b) => a.entity - b.entity);

    if (entries.length === 0) {
      this.removeResultMesh();
      return;
    }

    // Separate additive and subtractive brushes
    const additive: { csg: CSG; entry: BrushEntry }[] = [];
    const subtractive: { csg: CSG; entry: BrushEntry }[] = [];

    for (const entry of entries) {
      const csg = transformCSG(buildBrushCSG(entry.brush), entry.transform);

      if (entry.brush.operation === 'subtractive') {
        subtractive.push({ csg, entry });
      } else {
        additive.push({ csg, entry });
      }
    }

    if (additive.length === 0) {
      this.removeResultMesh();
      return;
    }

    // Phase 1: Union all additive brushes
    let result = additive[0].csg;
    for (let i = 1; i < additive.length; i++) {
      result = result.union(additive[i].csg);
    }

    // Phase 2: Subtract all subtractive brushes
    for (const sub of subtractive) {
      result = result.subtract(sub.csg);
    }

    // Convert to THREE.BufferGeometry
    const geometry = csgToGeometry(result);
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
        const texAbs = /^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')
          ? relPath : `${matDir}/${relPath}`;
        const url = texAbs.startsWith('file://') ? texAbs : `file:///${texAbs.replace(/\\/g, '/')}`;
        return assets.loadTexture(url);
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
