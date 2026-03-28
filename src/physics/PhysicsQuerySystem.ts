// ============================================================
// FluxionJS V3 — Physics Query System
//
// Unified API for spatial queries against the Rapier world:
//   • Raycast    — first hit along a ray
//   • Shapecast  — first contact of a swept shape
//   • Overlap    — all colliders overlapping a shape
//
// All methods return plain result objects (no THREE allocations
// beyond the caller-supplied vectors).  Internal scratch vectors
// are module-level to keep the hot path allocation-free.
// ============================================================

import * as THREE from 'three';
import { EntityId } from '../core/ECS';
import { RaycastHit, ShapecastHit, OverlapHit } from './PhysicsTypes';
import { PhysicsWorld } from './PhysicsWorld';

// ── Module-level scratch ──────────────────────────────────────────────────────
const _hitPoint  = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();

/** Rapier filter flags — solid colliders only (exclude sensors by default).
 *  Cast to `any` because Rapier's TS bindings use an opaque QueryFilterFlags enum
 *  but the underlying value is a plain number. */
const SOLID_FILTER_FLAGS = 0x0000_000b as any; // QueryFilterFlags: ONLY_FIXED | DYNAMIC | KINEMATIC

export class PhysicsQuerySystem {
  constructor(private pw: PhysicsWorld) {}

  // ── Raycast ────────────────────────────────────────────────────────────────

  /**
   * Cast a ray from `origin` in `direction` up to `maxDistance`.
   * @param origin        Ray origin (world space).
   * @param direction     Ray direction — does NOT need to be normalised.
   * @param maxDistance   Maximum travel distance.
   * @param filterGroups  Optional Rapier interaction groups for layer filtering.
   *                      Use `interactionGroups(layer, mask)` from PhysicsBodySystem
   *                      or pass `undefined` to hit everything.
   * @returns Hit result, or `null` if nothing was hit.
   */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    filterGroups?: number,
  ): RaycastHit | null {
    if (!this.pw.isReady) return null;

    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    const ray = new RAPIER.Ray(
      { x: origin.x,    y: origin.y,    z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z },
    );

    const hit = world.castRay(
      ray,
      maxDistance,
      /* solid */ true,
      filterGroups !== undefined ? SOLID_FILTER_FLAGS : undefined,
      filterGroups !== undefined ? filterGroups : undefined,
    );

    if (!hit) return null;

    const toi    = hit.timeOfImpact;
    const entity = this.pw.entityForCollider(hit.collider.handle);

    _hitPoint.set(
      origin.x + direction.x * toi,
      origin.y + direction.y * toi,
      origin.z + direction.z * toi,
    );

    const normal = hit.collider.castRayAndGetNormal(ray, maxDistance, true);
    if (normal) {
      _hitNormal.set(normal.normal.x, normal.normal.y, normal.normal.z);
    } else {
      _hitNormal.set(0, 1, 0);
    }

    return {
      entity,
      point:    _hitPoint.clone(),
      normal:   _hitNormal.clone(),
      distance: toi,
    };
  }

  // ── Shapecast ──────────────────────────────────────────────────────────────

  /**
   * Sweep a shape from `origin` along `direction` up to `maxDistance`.
   * @param shapeType   `'box'` or `'sphere'` — shape to sweep.
   * @param halfExtents For box: half-extents Vector3.  For sphere: x component = radius.
   * @param origin      World-space start position of the shape.
   * @param direction   Sweep direction (normalised).
   * @param maxDistance Max sweep distance.
   * @param filterGroups Optional interaction groups.
   * @returns First contact, or `null`.
   */
  shapecast(
    shapeType: 'box' | 'sphere',
    halfExtents: THREE.Vector3,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    filterGroups?: number,
  ): ShapecastHit | null {
    if (!this.pw.isReady) return null;

    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    let shape: any;
    if (shapeType === 'sphere') {
      shape = new RAPIER.Ball(halfExtents.x);
    } else {
      shape = new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    }

    const shapePos = { x: origin.x, y: origin.y, z: origin.z };
    const shapeRot = { x: 0, y: 0, z: 0, w: 1 };
    const shapeVel = { x: direction.x * maxDistance, y: direction.y * maxDistance, z: direction.z * maxDistance };

    // Cast to any: Rapier's generated TS overloads for castShape vary between
    // patch versions — using any avoids brittle overload matching.
    const hit = (world as any).castShape(
      shapePos,
      shapeRot,
      shapeVel,
      shape,
      maxDistance,
      filterGroups !== undefined ? SOLID_FILTER_FLAGS : undefined,
      filterGroups !== undefined ? filterGroups : undefined,
    );

    if (!hit) return null;

    const entity = this.pw.entityForCollider(hit.collider.handle);
    const toi    = hit.time_of_impact ?? (hit as any).timeOfImpact ?? 0;
    const w1     = (hit as any).witness1 ?? { x: 0, y: 0, z: 0 };
    const n1     = (hit as any).normal1  ?? { x: 0, y: 1, z: 0 };

    return {
      entity,
      point:    new THREE.Vector3(w1.x, w1.y, w1.z),
      normal:   new THREE.Vector3(n1.x, n1.y, n1.z),
      distance: toi,
    };
  }

  // ── Overlap ────────────────────────────────────────────────────────────────

  /**
   * Return all entities whose colliders overlap a given shape at `origin`.
   * @param shapeType   `'box'` or `'sphere'`.
   * @param halfExtents For box: half-extents.  For sphere: x = radius.
   * @param origin      World-space position.
   * @param filterGroups Optional interaction groups.
   * @returns OverlapHit containing all overlapping entities.
   */
  overlap(
    shapeType: 'box' | 'sphere',
    halfExtents: THREE.Vector3,
    origin: THREE.Vector3,
    filterGroups?: number,
  ): OverlapHit {
    const result: EntityId[] = [];
    if (!this.pw.isReady) return { entities: result };

    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    let shape: any;
    if (shapeType === 'sphere') {
      shape = new RAPIER.Ball(halfExtents.x);
    } else {
      shape = new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    }

    const shapePos = { x: origin.x, y: origin.y, z: origin.z };
    const shapeRot = { x: 0, y: 0, z: 0, w: 1 };

    world.intersectionsWithShape(
      shapePos,
      shapeRot,
      shape,
      (collider: any) => {
        const entity = this.pw.entityForCollider(collider.handle);
        if (entity !== null) result.push(entity);
        return true; // continue
      },
      undefined,
      filterGroups !== undefined ? filterGroups : undefined,
    );

    return { entities: result };
  }

  // ── Convenience: line-of-sight check ──────────────────────────────────────

  /**
   * Returns `true` if there is unobstructed line-of-sight between `from` and `to`.
   */
  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    if (!this.pw.isReady) return true;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-6) return true;

    _hitPoint.set(dx / dist, dy / dist, dz / dist); // direction in _hitPoint
    const hit = this.raycast(from, _hitPoint, dist);
    return hit === null;
  }
}
