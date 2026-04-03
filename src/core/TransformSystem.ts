// ============================================================
// FluxionJS V3 — Transform System
//
// Responsibilities:
//   • Propagate local transforms into correct world-space matrices
//   • Maintain a dirty-flag system so only changed branches update
//   • Run in BOTH update() and fixedUpdate() so world positions
//     are always current before physics and rendering systems run
//
// Execution priority: -150
//   After  TransformNode (-200)   — Three.js scene nodes exist
//   Before PhysicsBodySystem (-100) — physics needs world positions
//   Before TransformSync  (-100)   — renderer reads worldMatrix
//
// Algorithm: iterative BFS from root entities (topological order).
//   • Recompute localMatrix when dirty = true
//   • Recompute worldMatrix when worldDirty = true
//   • Propagate worldDirty to direct children after any world change
//   • O(n) traversal; matrix math only for dirty nodes
// ============================================================

import { ECSManager, EntityId, System } from './ECS';
import { TransformComponent } from './Components';
import { transformPropagateNative } from './TransformBridge';

export class TransformSystem implements System {
  readonly name = 'TransformSystem';
  readonly requiredComponents = ['Transform'];
  priority = -150;
  enabled = true;

  // Reusable queue + visited set — allocated once, cleared each frame to avoid GC
  private _queue:   EntityId[] = [];
  private _visited: Set<EntityId> = new Set();

  // ── Public API ────────────────────────────────────────────────────────────

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    this._process(entities, ecs);
  }

  fixedUpdate(entities: Set<EntityId>, ecs: ECSManager, _dt: number): void {
    this._process(entities, ecs);
  }

  // ── Core propagation ─────────────────────────────────────────────────────

  /**
   * BFS traversal from root entities ensures parents are processed before
   * their children (topological order). Dirty flags control which nodes
   * actually recompute their matrices.
   */
  private _process(entities: Set<EntityId>, ecs: ECSManager): void {
    const nativeSuccess = transformPropagateNative(entities, ecs);
    if (!nativeSuccess) {
      this._processJS(entities, ecs);
    }
  }

  /**
   * JavaScript fallback for transform propagation when Wasm is unavailable.
   * Simple BFS traversal that computes world matrices and decomposes them.
   */
  private _processJS(entities: Set<EntityId>, ecs: ECSManager): void {
    // Find root entities (no parent)
    const roots: EntityId[] = [];
    const processed = new Set<EntityId>();
    
    for (const entity of entities) {
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!transform) continue;
      
      const parentId = ecs.getParent(entity);
      if (parentId === undefined) {
        roots.push(entity);
      }
    }

    // Process each root and its children
    for (const root of roots) {
      this._processEntityAndChildren(root, entities, ecs, processed);
    }
  }

  private _processEntityAndChildren(
    entity: EntityId, 
    allEntities: Set<EntityId>, 
    ecs: ECSManager, 
    processed: Set<EntityId>
  ): void {
    if (processed.has(entity)) return;
    
    const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
    if (!transform) return;

    const parentId = ecs.getParent(entity);
    
    // Update local matrix if dirty
    if (transform.dirty) {
      transform._matrix.compose(transform.position, transform.quaternion, transform.scale);
    }
    
    // Update world matrix
    if (parentId !== undefined && processed.has(parentId)) {
      const parentTransform = ecs.getComponent<TransformComponent>(parentId, 'Transform');
      if (parentTransform) {
        transform._worldMatrix.multiplyMatrices(parentTransform._worldMatrix, transform._matrix);
      } else {
        transform._worldMatrix.copy(transform._matrix);
      }
    } else {
      transform._worldMatrix.copy(transform._matrix);
    }

    // Decompose world matrix to position/rotation/scale
    transform._worldMatrix.decompose(transform.worldPosition, transform.worldRotation, transform.worldScale);

    // Clear dirty flags
    transform.dirty = false;
    transform.worldDirty = false;
    processed.add(entity);

    // Process children
    const children = ecs.getChildren(entity);
    for (const child of children) {
      if (allEntities.has(child)) {
        this._processEntityAndChildren(child, allEntities, ecs, processed);
      }
    }
  }
}
