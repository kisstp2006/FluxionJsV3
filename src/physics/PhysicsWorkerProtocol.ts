// ============================================================
// FluxionJS V3 — Physics Worker Protocol
// Typed message shapes for main ↔ physics worker communication.
// ============================================================

import type { EntityId } from '../core/ECS';

// ── Serialisable body description ────────────────────────────
export interface SerializedBodyDesc {
  bodyType: 'dynamic' | 'kinematic' | 'static';
  mass: number;
  linearDamping: number;
  angularDamping: number;
  gravityScale: number;
  canSleep: boolean;
  // Initial world-space pose (written into SharedTransformBuffer slot on main thread,
  // but also sent here for the worker to initialise the Rapier body position)
  slot: number;
}

// ── Main → Worker ─────────────────────────────────────────────
export type PhysicsWorkerRequest =
  | { type: 'init';        buffer: SharedArrayBuffer; gravity: [number, number, number] }
  | { type: 'step';        dt: number; kinematicSlots: Int32Array }
  | { type: 'add-body';    entity: EntityId; desc: SerializedBodyDesc }
  | { type: 'remove-body'; entity: EntityId }
  | { type: 'set-gravity'; gravity: [number, number, number] };

// ── Worker → Main ─────────────────────────────────────────────
export type PhysicsWorkerResponse =
  | { type: 'ready' }
  | { type: 'step-done'; dynamicSlots: Int32Array }
  | { type: 'events';    enter: CollisionEventData[]; exit: CollisionEventData[] };

export interface CollisionEventData {
  entity1: EntityId | null;
  entity2: EntityId | null;
  isTrigger: boolean;
}
