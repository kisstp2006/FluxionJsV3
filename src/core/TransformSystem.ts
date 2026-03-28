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

export class TransformSystem implements System {
  readonly name = 'TransformSystem';
  readonly requiredComponents = ['Transform'];
  priority = -150;
  enabled = true;

  // Reusable queue — allocated once, cleared each frame to avoid GC
  private _queue: EntityId[] = [];

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
    const queue = this._queue;
    queue.length = 0;

    // Seed with all root entities (no parent)
    const roots = ecs.getRootEntities();
    for (let i = 0; i < roots.length; i++) queue.push(roots[i]);

    const visited = new Set<EntityId>();

    let head = 0;
    while (head < queue.length) {
      const entity = queue[head++];
      if (visited.has(entity)) continue;
      visited.add(entity);

      const t = ecs.getComponent<TransformComponent>(entity, 'Transform');

      if (t) {
        // Step 1: recompute local matrix if local transform changed
        if (t.dirty) {
          t._matrix.compose(t.position, t.quaternion, t.scale);
          t.dirty = false;
          t.worldDirty = true; // local change forces world recompute
        }

        // Step 2: recompute world matrix if needed
        if (t.worldDirty) {
          const parentId = ecs.getParent(entity);
          if (parentId !== undefined) {
            const pt = ecs.getComponent<TransformComponent>(parentId, 'Transform');
            if (pt) {
              t._worldMatrix.multiplyMatrices(pt._worldMatrix, t._matrix);
            } else {
              // Parent has no Transform — treat as root
              t._worldMatrix.copy(t._matrix);
            }
          } else {
            // Root entity: world = local
            t._worldMatrix.copy(t._matrix);
          }

          // Extract world-space components for convenient access
          t._worldMatrix.decompose(t.worldPosition, t.worldRotation, t.worldScale);
          t.worldDirty = false;

          // Propagate world dirty to direct children so they recompute next
          for (const childId of ecs.getChildren(entity)) {
            const ct = ecs.getComponent<TransformComponent>(childId, 'Transform');
            if (ct) ct.worldDirty = true;
          }
        }
      }

      // Enqueue all direct children for topological processing
      for (const childId of ecs.getChildren(entity)) {
        if (!visited.has(childId)) queue.push(childId);
      }
    }

    // Safety pass: handle any Transform entities not reachable from roots
    // (e.g., entity's parent has no Transform component — orphaned branch)
    for (const entity of entities) {
      if (visited.has(entity)) continue;
      const t = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!t) continue;

      if (t.dirty) {
        t._matrix.compose(t.position, t.quaternion, t.scale);
        t.dirty = false;
        t.worldDirty = true;
      }
      if (t.worldDirty) {
        t._worldMatrix.copy(t._matrix);
        t._worldMatrix.decompose(t.worldPosition, t.worldRotation, t.worldScale);
        t.worldDirty = false;
      }
    }
  }
}
