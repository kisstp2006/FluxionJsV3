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
    transformPropagateNative(entities, ecs);
  }
}
