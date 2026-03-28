// ============================================================
// FluxionJS V3 — Physics Shared Types
// Used by PhysicsWorld, PhysicsBodySystem, PhysicsQuerySystem,
// CharacterControllerSystem — single source of truth.
// ============================================================

import * as THREE from 'three';
import { EntityId } from '../core/ECS';

// ── Query results ─────────────────────────────────────────────────────────────

export interface RaycastHit {
  /** Entity owning the hit collider, or null if not tracked. */
  entity: EntityId | null;
  /** World-space hit point. */
  point: THREE.Vector3;
  /** Surface normal at the hit point. */
  normal: THREE.Vector3;
  /** Distance along the ray (time of impact). */
  distance: number;
}

export interface ShapecastHit {
  /** Entity owning the hit collider, or null. */
  entity: EntityId | null;
  /** World-space contact point on the hit collider. */
  point: THREE.Vector3;
  /** World-space contact normal. */
  normal: THREE.Vector3;
  /** Distance the shape travelled before first contact. */
  distance: number;
}

export interface OverlapHit {
  /** All entities whose colliders overlap with the query shape. */
  entities: EntityId[];
}

// ── Collision events ──────────────────────────────────────────────────────────

export interface CollisionEventData {
  entity1: EntityId | null;
  entity2: EntityId | null;
}

/** Emitted every fixed step while two non-sensor colliders remain in contact. */
export interface CollisionStayData extends CollisionEventData {
  /** World-space contact point (approximated as body midpoint when unavailable). */
  contactPoint: THREE.Vector3 | null;
}

// ── Internal handle pair (for stay-event tracking) ───────────────────────────

/** Canonical key for a collider pair — always min-max ordered. */
export function colliderPairKey(h1: number, h2: number): string {
  return h1 < h2 ? `${h1}:${h2}` : `${h2}:${h1}`;
}
