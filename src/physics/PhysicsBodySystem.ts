// ============================================================
// FluxionJS V3 — Physics Body System
// Single responsibility: rigid body + collider lifecycle and
// Transform ↔ Rapier synchronisation.
//
// Rules:
//   • All Rapier object creation/destruction goes through PhysicsWorld
//     registration helpers so the reverse-lookup maps stay consistent.
//   • Body type change → full recreate (bodyType is immutable in Rapier).
//   • Scalar property change → in-place Rapier API update (no recreate).
//   • Collider shape change → collider recreate only (body preserved).
//   • Mesh / Convex shapes → explicit dev warning, fall back to box.
//   • Collision filtering applied via Rapier interaction groups.
//   • Sleeping configured per-body via canSleep flag.
// ============================================================

import { ECSManager, EntityId, System, isDirty, clearDirty } from '../core/ECS';
import { TransformComponent, RigidbodyComponent, ColliderComponent } from '../core/Components';
import { DebugConsole } from '../core/DebugConsole';
import { PhysicsWorld } from './PhysicsWorld';

const DEG2RAD = Math.PI / 180;

// ── Rapier interaction groups helper ─────────────────────────────────────────
// High 16 bits = membership (which groups this collider belongs to)
// Low  16 bits = filter     (which groups this collider interacts with)
function interactionGroups(layer: number, mask: number): number {
  return ((layer & 0xFFFF) << 16) | (mask & 0xFFFF);
}

export class PhysicsBodySystem implements System {
  readonly name = 'PhysicsBodySystem';
  readonly requiredComponents = ['Transform', 'Rigidbody'];
  priority = -50;
  enabled = true;

  private tracked       = new Set<EntityId>();
  private lastBodyType  = new Map<EntityId, string>();
  private lastShape     = new Map<EntityId, string>();

  constructor(private pw: PhysicsWorld) {}

  onSceneClear(): void {
    for (const entity of this.tracked) {
      this._removeBody(entity);
    }
    this.tracked.clear();
    this.lastBodyType.clear();
    this.lastShape.clear();
  }

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    if (!this.pw.isReady) return;

    for (const entity of entities) {
      const rb        = ecs.getComponent<RigidbodyComponent>(entity, 'Rigidbody');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!rb || !transform) continue;

      const collider = ecs.getComponent<ColliderComponent>(entity, 'Collider');

      // ── Create on first encounter ─────────────────────────────────────────
      if (!this.tracked.has(entity)) {
        this._createBody(entity, rb, transform);
        this.lastBodyType.set(entity, rb.bodyType);
        if (collider) {
          this._createCollider(entity, collider, rb);
          this.lastShape.set(entity, collider.shape);
        }
        this.tracked.add(entity);
      }

      // ── React to rigidbody property changes ──────────────────────────────
      if (isDirty(rb)) {
        if (this.lastBodyType.get(entity) !== rb.bodyType) {
          // Body type is immutable → full recreate
          this._removeBody(entity);
          rb.bodyHandle = null;
          this._createBody(entity, rb, transform);
          this.lastBodyType.set(entity, rb.bodyType);
          if (collider) {
            collider.colliderHandle = null;
            this._createCollider(entity, collider, rb);
            this.lastShape.set(entity, collider.shape);
          }
        } else {
          this._updateBodyProperties(entity, rb);
        }
        clearDirty(rb);
      }

      // ── React to collider property changes ───────────────────────────────
      if (collider && isDirty(collider)) {
        if (this.lastShape.get(entity) !== collider.shape) {
          // Shape change → recreate collider, preserve body
          this._removeCollider(entity);
          collider.colliderHandle = null;
          this._createCollider(entity, collider, rb);
          this.lastShape.set(entity, collider.shape);
        } else {
          this._updateColliderProperties(entity, collider, rb);
        }
        clearDirty(collider);
      }

      // ── Sync physics → transform (dynamic bodies) ─────────────────────────
      if (rb.bodyHandle && rb.bodyType === 'dynamic') {
        const pos = rb.bodyHandle.translation();
        const rot = rb.bodyHandle.rotation();
        transform.position.set(pos.x, pos.y, pos.z);
        transform.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        transform.rotation.setFromQuaternion(transform.quaternion);
      }

      // ── Sync transform → physics (kinematic bodies) ───────────────────────
      if (rb.bodyHandle && rb.bodyType === 'kinematic') {
        rb.bodyHandle.setNextKinematicTranslation({
          x: transform.position.x,
          y: transform.position.y,
          z: transform.position.z,
        });
        rb.bodyHandle.setNextKinematicRotation({
          x: transform.quaternion.x,
          y: transform.quaternion.y,
          z: transform.quaternion.z,
          w: transform.quaternion.w,
        });
      }
    }

    // ── Remove entities that left the tracked set ─────────────────────────
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this._removeBody(entity);
        this.tracked.delete(entity);
        this.lastBodyType.delete(entity);
        this.lastShape.delete(entity);
      }
    }
  }

  // ── Body creation ─────────────────────────────────────────────────────────

  private _createBody(entity: EntityId, rb: RigidbodyComponent, t: TransformComponent): void {
    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    let desc: any;
    switch (rb.bodyType) {
      case 'dynamic':   desc = RAPIER.RigidBodyDesc.dynamic(); break;
      case 'kinematic': desc = RAPIER.RigidBodyDesc.kinematicPositionBased(); break;
      default:          desc = RAPIER.RigidBodyDesc.fixed(); break;
    }

    desc
      .setTranslation(t.position.x, t.position.y, t.position.z)
      .setRotation({ x: t.quaternion.x, y: t.quaternion.y, z: t.quaternion.z, w: t.quaternion.w })
      .setLinearDamping(rb.linearDamping)
      .setAngularDamping(rb.angularDamping)
      .setGravityScale(rb.gravityScale)
      .setCcdEnabled(rb.isContinuous)
      .setCanSleep(rb.canSleep);

    const body = world.createRigidBody(desc);

    if (rb.bodyType === 'dynamic') {
      body.setAdditionalMass(rb.mass, true);
    }

    if (rb.lockLinearX || rb.lockLinearY || rb.lockLinearZ) {
      body.setEnabledTranslations(!rb.lockLinearX, !rb.lockLinearY, !rb.lockLinearZ, true);
    }
    if (rb.lockAngularX || rb.lockAngularY || rb.lockAngularZ) {
      body.setEnabledRotations(!rb.lockAngularX, !rb.lockAngularY, !rb.lockAngularZ, true);
    }

    rb.bodyHandle = body;
    this.pw.registerBody(entity, body);
  }

  // ── Collider creation ─────────────────────────────────────────────────────

  private _createCollider(entity: EntityId, col: ColliderComponent, rb: RigidbodyComponent): void {
    if (!rb.bodyHandle) return;
    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    let desc: any;
    switch (col.shape) {
      case 'sphere':
        desc = RAPIER.ColliderDesc.ball(col.radius);
        break;
      case 'capsule': {
        const halfCyl = Math.max(0, (col.height - 2 * col.radius)) / 2;
        desc = RAPIER.ColliderDesc.capsule(halfCyl, col.radius);
        break;
      }
      case 'mesh':
      case 'convex':
        DebugConsole.LogWarning(
          `[PhysicsBodySystem] Shape '${col.shape}' is not yet supported. ` +
          `Falling back to Box for entity ${entity}. ` +
          `Assign a supported shape (box / sphere / capsule) or implement mesh extraction.`
        );
        desc = RAPIER.ColliderDesc.cuboid(col.size.x / 2, col.size.y / 2, col.size.z / 2);
        break;
      case 'box':
      default:
        desc = RAPIER.ColliderDesc.cuboid(col.size.x / 2, col.size.y / 2, col.size.z / 2);
        break;
    }

    // Collision filtering — interaction groups: (membership << 16) | filter
    desc
      .setTranslation(col.offset.x, col.offset.y, col.offset.z)
      .setFriction(rb.friction)
      .setRestitution(rb.restitution)
      .setSensor(col.isTrigger)
      .setCollisionGroups(interactionGroups(col.collisionLayer, col.collisionMask))
      .setSolverGroups(interactionGroups(col.collisionLayer, col.collisionMask));

    const rapierCol = world.createCollider(desc, rb.bodyHandle);
    col.colliderHandle = rapierCol;
    this.pw.registerCollider(entity, rapierCol);
  }

  // ── In-place body property update (no recreate) ───────────────────────────

  private _updateBodyProperties(entity: EntityId, rb: RigidbodyComponent): void {
    const body = this.pw.getBody(entity);
    if (!body) return;
    body.setLinearDamping(rb.linearDamping);
    body.setAngularDamping(rb.angularDamping);
    body.setGravityScale(rb.gravityScale, true);
    body.enableCcd(rb.isContinuous);
    body.setCanSleep(rb.canSleep);
    if (rb.bodyType === 'dynamic') body.setAdditionalMass(rb.mass, true);
    body.setEnabledTranslations(!rb.lockLinearX, !rb.lockLinearY, !rb.lockLinearZ, true);
    body.setEnabledRotations(!rb.lockAngularX, !rb.lockAngularY, !rb.lockAngularZ, true);
  }

  // ── In-place collider property update (no recreate) ──────────────────────

  private _updateColliderProperties(entity: EntityId, col: ColliderComponent, rb: RigidbodyComponent): void {
    const rapierCol = this.pw.getCollider(entity);
    if (!rapierCol) return;
    rapierCol.setFriction(rb.friction);
    rapierCol.setRestitution(rb.restitution);
    rapierCol.setSensor(col.isTrigger);
    rapierCol.setCollisionGroups(interactionGroups(col.collisionLayer, col.collisionMask));
    rapierCol.setSolverGroups(interactionGroups(col.collisionLayer, col.collisionMask));
  }

  // ── Removal helpers ───────────────────────────────────────────────────────

  private _removeCollider(entity: EntityId): void {
    const rapierCol = this.pw.getCollider(entity);
    if (rapierCol) {
      try { this.pw.rapierWorld.removeCollider(rapierCol, true); } catch { /**/ }
    }
    this.pw.unregisterCollider(entity);
  }

  private _removeBody(entity: EntityId): void {
    this._removeCollider(entity);
    const body = this.pw.getBody(entity);
    if (body) {
      try { this.pw.rapierWorld.removeRigidBody(body); } catch { /**/ }
    }
    this.pw.unregisterBody(entity);
    const rb = this.pw['engine'].ecs.getComponent<RigidbodyComponent>(entity, 'Rigidbody');
    if (rb) rb.bodyHandle = null;
    const col = this.pw['engine'].ecs.getComponent<ColliderComponent>(entity, 'Collider');
    if (col) col.colliderHandle = null;
  }
}
