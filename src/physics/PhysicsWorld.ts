// ============================================================
// FluxionJS V2 — Physics World (Rapier3D)
// Nuake used Jolt Physics — we use Rapier.js for web perf
// ============================================================

import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { ECSManager, EntityId, System, isDirty, clearDirty } from '../core/ECS';
import { EngineEvents } from '../core/EventSystem';
import {
  TransformComponent,
  RigidbodyComponent,
  ColliderComponent,
} from '../core/Components';

// Rapier types (loaded dynamically since it's a WASM module)
type RAPIER = typeof import('@dimforge/rapier3d-compat');

const _velocityScratch = new THREE.Vector3();

export class PhysicsWorld {
  private rapier!: RAPIER;
  private world!: InstanceType<RAPIER['World']>;
  private bodyMap: Map<EntityId, any> = new Map();
  private colliderMap: Map<EntityId, any> = new Map();
  /** O(1) reverse lookup: collider handle number → entity */
  private colliderHandleToEntity: Map<number, EntityId> = new Map();
  private engine: Engine;
  private initialized = false;
  private gravity = new THREE.Vector3(0, -9.81, 0);

  constructor(engine: Engine) {
    this.engine = engine;
  }

  async init(): Promise<void> {
    const RAPIER = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    this.rapier = RAPIER;
    this.world = new RAPIER.World({ x: this.gravity.x, y: this.gravity.y, z: this.gravity.z } as any);
    this.initialized = true;

    // Register physics ECS system
    this.engine.ecs.addSystem(new PhysicsSyncSystem(this));

    // Hook into fixed update
    this.engine.events.on(EngineEvents.FIXED_UPDATE, (dt: number) => {
      if (this.initialized) {
        this.world.timestep = dt;
        this.world.step();
      }
    });

    this.engine.registerSubsystem('physics', this);
  }

  isReady(): boolean {
    return this.initialized;
  }

  setGravity(x: number, y: number, z: number): void {
    this.gravity.set(x, y, z);
    if (this.initialized) {
      this.world.gravity = { x, y, z };
    }
  }

  createBody(entity: EntityId, rb: RigidbodyComponent, transform: TransformComponent): void {
    if (!this.initialized) return;

    const RAPIER = this.rapier;
    let bodyDesc: any;

    switch (rb.bodyType) {
      case 'dynamic':
        bodyDesc = RAPIER.RigidBodyDesc.dynamic();
        break;
      case 'kinematic':
        bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        break;
      case 'static':
      default:
        bodyDesc = RAPIER.RigidBodyDesc.fixed();
        break;
    }

    bodyDesc
      .setTranslation(transform.position.x, transform.position.y, transform.position.z)
      .setRotation({
        x: transform.quaternion.x,
        y: transform.quaternion.y,
        z: transform.quaternion.z,
        w: transform.quaternion.w,
      })
      .setLinearDamping(rb.linearDamping)
      .setAngularDamping(rb.angularDamping)
      .setGravityScale(rb.gravityScale)
      .setCcdEnabled(rb.isContinuous);

    const body = this.world.createRigidBody(bodyDesc);

    if (rb.bodyType === 'dynamic') {
      (body as any).setAdditionalMass(rb.mass, true);
    }

    rb.bodyHandle = body;
    this.bodyMap.set(entity, body);
  }

  createCollider(entity: EntityId, collider: ColliderComponent, rb: RigidbodyComponent): void {
    if (!this.initialized || !rb.bodyHandle) return;

    const RAPIER = this.rapier;
    let colliderDesc: any;

    switch (collider.shape) {
      case 'sphere':
        colliderDesc = RAPIER.ColliderDesc.ball(collider.radius);
        break;
      case 'capsule':
        colliderDesc = RAPIER.ColliderDesc.capsule(collider.height / 2, collider.radius);
        break;
      case 'box':
      default:
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          collider.size.x / 2,
          collider.size.y / 2,
          collider.size.z / 2
        );
        break;
    }

    colliderDesc
      .setTranslation(collider.offset.x, collider.offset.y, collider.offset.z)
      .setFriction(rb.friction)
      .setRestitution(rb.restitution)
      .setSensor(collider.isTrigger);

    const coll = this.world.createCollider(colliderDesc, rb.bodyHandle);
    collider.colliderHandle = coll;
    this.colliderMap.set(entity, coll);
    this.colliderHandleToEntity.set(coll.handle, entity);
  }

  removeBody(entity: EntityId): void {
    const body = this.bodyMap.get(entity);
    if (body && this.initialized) {
      this.world.removeRigidBody(body);
      this.bodyMap.delete(entity);
    }
    const coll = this.colliderMap.get(entity);
    if (coll) this.colliderHandleToEntity.delete(coll.handle);
    this.colliderMap.delete(entity);
  }

  /**
   * Destroy and recreate a body (needed when bodyType changes).
   * Also recreates the collider if one exists.
   */
  recreateBody(
    entity: EntityId,
    rb: RigidbodyComponent,
    transform: TransformComponent,
    collider?: ColliderComponent,
  ): void {
    this.removeBody(entity);
    rb.bodyHandle = null;
    this.createBody(entity, rb, transform);
    if (collider) {
      collider.colliderHandle = null;
      this.createCollider(entity, collider, rb);
    }
  }

  /**
   * Update in-place body properties via Rapier API (mass, damping, gravity, CCD).
   * Avoids a full recreate when only scalar properties change.
   */
  updateBodyProperties(entity: EntityId, rb: RigidbodyComponent): void {
    const body = this.bodyMap.get(entity);
    if (!body || !this.initialized) return;

    body.setLinearDamping(rb.linearDamping);
    body.setAngularDamping(rb.angularDamping);
    body.setGravityScale(rb.gravityScale, true);
    body.enableCcd(rb.isContinuous);

    if (rb.bodyType === 'dynamic') {
      (body as any).setAdditionalMass(rb.mass, true);
    }
  }

  /**
   * Destroy and recreate a collider (needed when shape changes).
   */
  recreateCollider(
    entity: EntityId,
    collider: ColliderComponent,
    rb: RigidbodyComponent,
  ): void {
    const coll = this.colliderMap.get(entity);
    if (coll && this.initialized) {
      this.colliderHandleToEntity.delete(coll.handle);
      this.world.removeCollider(coll, true);
      this.colliderMap.delete(entity);
    }
    collider.colliderHandle = null;
    this.createCollider(entity, collider, rb);
  }

  /**
   * Update in-place collider properties via Rapier API.
   */
  updateColliderProperties(
    entity: EntityId,
    collider: ColliderComponent,
    rb: RigidbodyComponent,
  ): void {
    const coll = this.colliderMap.get(entity);
    if (!coll || !this.initialized) return;

    coll.setFriction(rb.friction);
    coll.setRestitution(rb.restitution);
    coll.setSensor(collider.isTrigger);
  }

  // ── Force & impulse API ──

  applyForce(entity: EntityId, force: THREE.Vector3): void {
    const body = this.bodyMap.get(entity);
    if (body) body.addForce({ x: force.x, y: force.y, z: force.z }, true);
  }

  applyImpulse(entity: EntityId, impulse: THREE.Vector3): void {
    const body = this.bodyMap.get(entity);
    if (body) body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
  }

  applyTorque(entity: EntityId, torque: THREE.Vector3): void {
    const body = this.bodyMap.get(entity);
    if (body) body.addTorque({ x: torque.x, y: torque.y, z: torque.z }, true);
  }

  setVelocity(entity: EntityId, velocity: THREE.Vector3): void {
    const body = this.bodyMap.get(entity);
    if (body) body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
  }

  getVelocity(entity: EntityId): THREE.Vector3 {
    const body = this.bodyMap.get(entity);
    if (!body) return _velocityScratch.set(0, 0, 0);
    const v = body.linvel();
    return _velocityScratch.set(v.x, v.y, v.z);
  }

  // ── Raycasting ──

  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance = 100
  ): { entity: EntityId | null; point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null {
    if (!this.initialized) return null;

    const ray = new this.rapier.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );

    const hit = this.world.castRay(ray, maxDistance, true);
    if (!hit) return null;

    const hitPoint = ray.pointAt(hit.timeOfImpact);
    const hitNormal = hit.collider.castRayAndGetNormal(ray, maxDistance, true);
    const normal = hitNormal ? hitNormal.normal : { x: 0, y: 1, z: 0 };

    // Find which entity owns this collider — O(1) via handle map
    const hitEntity: EntityId | null = this.colliderHandleToEntity.get(hit.collider.handle) ?? null;

    return {
      entity: hitEntity,
      point: new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z),
      normal: new THREE.Vector3(normal.x, normal.y, normal.z),
      distance: hit.timeOfImpact,
    };
  }

  dispose(): void {
    if (this.initialized) {
      this.world.free();
    }
    this.bodyMap.clear();
    this.colliderMap.clear();
    this.colliderHandleToEntity.clear();
  }
}

// ── Physics Sync ECS System ──

class PhysicsSyncSystem implements System {
  readonly name = 'PhysicsSync';
  readonly requiredComponents = ['Transform', 'Rigidbody'];
  priority = -50; // After transform, before rendering
  enabled = true;
  private tracked: Set<EntityId> = new Set();

  constructor(private physics: PhysicsWorld) {}

  private lastBodyType: Map<EntityId, string> = new Map();
  private lastColliderShape: Map<EntityId, string> = new Map();

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    if (!this.physics.isReady()) return;

    for (const entity of entities) {
      const rb = ecs.getComponent<RigidbodyComponent>(entity, 'Rigidbody');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!rb || !transform) continue;

      const collider = ecs.getComponent<ColliderComponent>(entity, 'Collider');

      // Create body if needed
      if (!this.tracked.has(entity)) {
        this.physics.createBody(entity, rb, transform);
        this.lastBodyType.set(entity, rb.bodyType);

        if (collider) {
          this.physics.createCollider(entity, collider, rb);
          this.lastColliderShape.set(entity, collider.shape);
        }

        this.tracked.add(entity);
      }

      // Handle dirty rigidbody — react to inspector property changes
      if (isDirty(rb)) {
        const prevType = this.lastBodyType.get(entity);
        if (prevType !== rb.bodyType) {
          // Body type changed → full recreate (Stride processor pattern)
          this.physics.recreateBody(entity, rb, transform, collider ?? undefined);
          this.lastBodyType.set(entity, rb.bodyType);
          if (collider) this.lastColliderShape.set(entity, collider.shape);
        } else {
          // Scalar property change → in-place update
          this.physics.updateBodyProperties(entity, rb);
        }
        clearDirty(rb);
      }

      // Handle dirty collider — react to inspector property changes
      if (collider && isDirty(collider)) {
        const prevShape = this.lastColliderShape.get(entity);
        if (prevShape !== collider.shape) {
          // Shape changed → recreate collider
          this.physics.recreateCollider(entity, collider, rb);
          this.lastColliderShape.set(entity, collider.shape);
        } else {
          // Scalar property change → in-place update
          this.physics.updateColliderProperties(entity, collider, rb);
        }
        clearDirty(collider);
      }

      // Sync physics → transform (for dynamic bodies)
      if (rb.bodyHandle && rb.bodyType === 'dynamic') {
        const pos = rb.bodyHandle.translation();
        const rot = rb.bodyHandle.rotation();
        transform.position.set(pos.x, pos.y, pos.z);
        transform.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        transform.rotation.setFromQuaternion(transform.quaternion);
      }

      // Sync transform → physics (for kinematic bodies)
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

    // Remove tracked entities no longer in the set
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this.physics.removeBody(entity);
        this.tracked.delete(entity);
        this.lastBodyType.delete(entity);
        this.lastColliderShape.delete(entity);
      }
    }
  }
}
