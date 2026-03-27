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
  CharacterControllerComponent,
} from '../core/Components';

const DEG2RAD = Math.PI / 180;

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
  private eventQueue: any = null;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  async init(): Promise<void> {
    const RAPIER = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    this.rapier = RAPIER;
    this.world = new RAPIER.World({ x: this.gravity.x, y: this.gravity.y, z: this.gravity.z } as any);
    this.eventQueue = new RAPIER.EventQueue(true);
    this.initialized = true;

    // Register physics ECS systems
    this.engine.ecs.addSystem(new PhysicsSyncSystem(this));
    this.engine.ecs.addSystem(new CharacterControllerSystem(this));

    // Hook into fixed update
    this.engine.events.on(EngineEvents.FIXED_UPDATE, (dt: number) => {
      if (!this.initialized) return;
      this.world.timestep = dt;
      this.world.step(this.eventQueue);

      // Drain collision events and emit on engine event bus
      this.eventQueue.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
        const e1 = this.colliderHandleToEntity.get(handle1) ?? null;
        const e2 = this.colliderHandleToEntity.get(handle2) ?? null;
        // Distinguish trigger vs solid collisions via sensor flag
        const coll1 = this.world.getCollider(handle1);
        const isTrigger = coll1?.isSensor() ?? false;
        if (isTrigger) {
          this.engine.events.emit(started ? 'physics:trigger-enter' : 'physics:trigger-exit', { entity1: e1, entity2: e2 });
        } else {
          this.engine.events.emit(started ? 'physics:collision-enter' : 'physics:collision-exit', { entity1: e1, entity2: e2 });
        }
      });
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

    // Axis locks
    if (rb.lockLinearX || rb.lockLinearY || rb.lockLinearZ) {
      body.setEnabledTranslations(!rb.lockLinearX, !rb.lockLinearY, !rb.lockLinearZ, true);
    }
    if (rb.lockAngularX || rb.lockAngularY || rb.lockAngularZ) {
      body.setEnabledRotations(!rb.lockAngularX, !rb.lockAngularY, !rb.lockAngularZ, true);
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
      case 'capsule': {
        // Rapier capsule(halfHeight, radius): halfHeight is the half-length of the
        // cylindrical section only — the hemispherical caps are NOT included.
        // Total height = 2*radius + 2*halfHeight, so halfHeight = (height - 2*radius) / 2.
        const halfCylinder = Math.max(0, (collider.height - 2 * collider.radius)) / 2;
        colliderDesc = RAPIER.ColliderDesc.capsule(halfCylinder, collider.radius);
        break;
      }
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

    body.setEnabledTranslations(!rb.lockLinearX, !rb.lockLinearY, !rb.lockLinearZ, true);
    body.setEnabledRotations(!rb.lockAngularX, !rb.lockAngularY, !rb.lockAngularZ, true);
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

    // Single-pass: castRayAndGetNormal returns both the hit and the surface normal
    const hit = this.world.castRayAndGetNormal(ray, maxDistance, true);
    if (!hit) return null;

    const hitPoint = ray.pointAt(hit.timeOfImpact);
    const normal = hit.normal;

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

  // ── CharacterController public API (called from scripts) ──

  /** Set the horizontal movement input for the next fixed step. */
  ccMove(entity: EntityId, x: number, z: number): void {
    const cc = this.engine.ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
    if (cc) { cc._moveInput.set(x, z); }
  }

  /** Trigger a jump on the next fixed step. */
  ccJump(entity: EntityId): void {
    const cc = this.engine.ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
    if (cc) cc._wantsJump = true;
  }

  /** Enable or disable crouching. */
  ccSetCrouch(entity: EntityId, state: boolean): void {
    const cc = this.engine.ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
    if (cc) cc._wantsCrouch = state;
  }

  /** Enable or disable running. */
  ccSetRunning(entity: EntityId, state: boolean): void {
    const cc = this.engine.ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
    if (cc) cc._wantsRun = state;
  }

  ccIsGrounded(entity: EntityId): boolean {
    return this.engine.ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController')?._isGrounded ?? false;
  }

  ccIsCrouching(entity: EntityId): boolean {
    return this.engine.ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController')?._isCrouching ?? false;
  }

  /** Direct access to the Rapier world (used by CharacterControllerSystem). */
  get rapierWorld() { return this.world; }
  get rapierModule() { return this.rapier; }
  get isInitialized() { return this.initialized; }
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

  onSceneClear(): void {
    // Remove all Rapier bodies before entities are destroyed.
    // CRITICAL: ECS.clear() resets nextEntityId to 1, so the next session
    // reuses the same entity IDs. Without this reset, tracked.has(entity)
    // returns true for the new entities → body creation is skipped → physics
    // stops working on the second play session.
    for (const entity of this.tracked) {
      this.physics.removeBody(entity);
    }
    this.tracked.clear();
    this.lastBodyType.clear();
    this.lastColliderShape.clear();
  }

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

// ── Character Controller ECS System ──────────────────────────────────────────

const _ccMoveDir = new THREE.Vector3();
const _ccQuat = new THREE.Quaternion();

class CharacterControllerSystem implements System {
  readonly name = 'CharacterController';
  readonly requiredComponents = ['Transform', 'CharacterController'];
  priority = -49; // just after PhysicsSync
  enabled = true;
  private tracked: Set<EntityId> = new Set();

  constructor(private physics: PhysicsWorld) {}

  onSceneClear(): void {
    for (const entity of this.tracked) {
      this.destroyCC(entity);
    }
    this.tracked.clear();
  }

  private destroyCC(entity: EntityId): void {
    const ecs = this.physics['engine'].ecs;
    const cc = ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
    if (!cc) return;
    const world = this.physics.rapierWorld;
    if (cc._rapierController) { try { world.removeCharacterController(cc._rapierController); } catch { /**/ } }
    if (cc._rapierCollider)   { try { world.removeCollider(cc._rapierCollider, false); } catch { /**/ } }
    if (cc._rapierBody)       { try { world.removeRigidBody(cc._rapierBody); } catch { /**/ } }
    cc._rapierController = null;
    cc._rapierCollider = null;
    cc._rapierBody = null;
  }

  private createCC(entity: EntityId, cc: CharacterControllerComponent, transform: TransformComponent): void {
    const RAPIER = this.physics.rapierModule;
    const world = this.physics.rapierWorld;

    // Kinematic body at entity position
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(
        transform.position.x,
        transform.position.y + cc.centerOffsetY,
        transform.position.z,
      );
    cc._rapierBody = world.createRigidBody(bodyDesc);

    // Capsule collider
    const halfCyl = Math.max(0, (cc.height - 2 * cc.radius)) / 2;
    const collDesc = RAPIER.ColliderDesc.capsule(halfCyl, cc.radius);
    cc._rapierCollider = world.createCollider(collDesc, cc._rapierBody);

    // Rapier KinematicCharacterController
    const controller = world.createCharacterController(0.01); // 1 cm skin offset
    controller.setUp({ x: 0.0, y: 1.0, z: 0.0 });
    controller.setMaxSlopeClimbAngle(cc.maxSlopeAngle * DEG2RAD);
    controller.setMinSlopeSlideAngle(cc.maxSlopeAngle * DEG2RAD);
    controller.enableAutostep(cc.maxStepHeight, 0.05, true);
    controller.enableSnapToGround(cc.stepDownHeight);
    controller.setCharacterMass(cc.mass);
    cc._rapierController = controller;

    // Reset runtime state
    cc._isGrounded = false;
    cc._isCrouching = false;
    cc._velocityY = 0;
    cc._lateralVelocity.set(0, 0);
    cc._jumpCount = 0;
  }

  private recreateCapsule(cc: CharacterControllerComponent, isStanding: boolean): void {
    const world = this.physics.rapierWorld;
    const RAPIER = this.physics.rapierModule;
    if (cc._rapierCollider) {
      try { world.removeCollider(cc._rapierCollider, false); } catch { /**/ }
      cc._rapierCollider = null;
    }
    const targetHeight = isStanding ? cc.height : cc.crouchHeight;
    const halfCyl = Math.max(0, (targetHeight - 2 * cc.radius)) / 2;
    const collDesc = RAPIER.ColliderDesc.capsule(halfCyl, cc.radius);
    cc._rapierCollider = world.createCollider(collDesc, cc._rapierBody);
  }

  fixedUpdate(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
    if (!this.physics.isInitialized) return;

    const gravity = 9.81;

    for (const entity of entities) {
      const cc = ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!cc || !transform) continue;

      // ── Initialise ───────────────────────────────────────────────────────
      if (!this.tracked.has(entity)) {
        this.createCC(entity, cc, transform);
        this.tracked.add(entity);
      }
      if (!cc._rapierController || !cc._rapierBody || !cc._rapierCollider) continue;

      // ── Crouch toggle ────────────────────────────────────────────────────
      if (cc._wantsCrouch !== cc._isCrouching) {
        cc._isCrouching = cc._wantsCrouch;
        this.recreateCapsule(cc, !cc._isCrouching);
        cc.centerOffsetY = (cc._isCrouching ? cc.crouchHeight : cc.height) / 2;
      }

      // ── Run toggle ───────────────────────────────────────────────────────
      if (cc._wantsRun !== cc._isRunning) {
        cc._isRunning = cc._wantsRun;
      }

      // ── Jump ─────────────────────────────────────────────────────────────
      if (cc._wantsJump && cc._jumpCount < cc.maxJumps) {
        if (cc._isGrounded || cc._jumpCount > 0) {
          cc._velocityY = cc.jumpImpulse;
          cc._jumpCount++;
        }
      }
      cc._wantsJump = false;

      // ── Gravity ──────────────────────────────────────────────────────────
      if (cc._isGrounded && cc._velocityY <= 0) {
        cc._velocityY = 0;
        cc._jumpCount = 0;
      } else {
        cc._velocityY -= gravity * cc.gravityScale * dt;
      }

      // ── Horizontal speed selection ────────────────────────────────────────
      const speed = cc._isCrouching ? cc.crouchSpeed
                  : cc._isRunning   ? cc.runSpeed
                  : cc.walkSpeed;

      // ── Movement direction (world space, honours entity Y rotation) ──────
      const input = cc._moveInput;
      const inputLen = Math.sqrt(input.x * input.x + input.y * input.y);
      if (inputLen > 1) { input.x /= inputLen; input.y /= inputLen; }

      _ccQuat.setFromEuler(
        new THREE.Euler(0, transform.rotation.y, 0, 'YXZ'),
      );
      _ccMoveDir.set(input.x, 0, input.y).applyQuaternion(_ccQuat);

      let moveX: number;
      let moveZ: number;

      if (cc._isGrounded) {
        moveX = _ccMoveDir.x * speed * dt;
        moveZ = _ccMoveDir.z * speed * dt;
        cc._lateralVelocity.set(_ccMoveDir.x * speed, _ccMoveDir.z * speed);
      } else {
        // Air control: apply input with airControl scalar, then apply friction
        cc._lateralVelocity.x += _ccMoveDir.x * cc.airSpeed * cc.airControl * dt;
        cc._lateralVelocity.y += _ccMoveDir.z * cc.airSpeed * cc.airControl * dt;
        // Exponential damping
        const decay = Math.pow(1 - Math.min(cc.airFriction, 0.999), dt);
        cc._lateralVelocity.x *= decay;
        cc._lateralVelocity.y *= decay;
        // Clamp to airSpeed
        const airLen = Math.sqrt(cc._lateralVelocity.x ** 2 + cc._lateralVelocity.y ** 2);
        if (airLen > cc.airSpeed) {
          cc._lateralVelocity.x = (cc._lateralVelocity.x / airLen) * cc.airSpeed;
          cc._lateralVelocity.y = (cc._lateralVelocity.y / airLen) * cc.airSpeed;
        }
        moveX = cc._lateralVelocity.x * dt;
        moveZ = cc._lateralVelocity.y * dt;
      }

      // ── Compute movement via Rapier controller ────────────────────────────
      const desired = { x: moveX, y: cc._velocityY * dt, z: moveZ };
      cc._rapierController.computeColliderMovement(cc._rapierCollider, desired);
      const effective = cc._rapierController.computedMovement();
      cc._isGrounded = cc._rapierController.computedGrounded();

      // ── Apply to body ─────────────────────────────────────────────────────
      const pos = cc._rapierBody.translation();
      cc._rapierBody.setNextKinematicTranslation({
        x: pos.x + effective.x,
        y: pos.y + effective.y,
        z: pos.z + effective.z,
      });

      // ── Push overlapping dynamic bodies ──────────────────────────────────
      for (let i = 0; i < cc._rapierController.numComputedCollisions(); i++) {
        const collision = cc._rapierController.computedCollision(i);
        if (!collision) continue;
        const otherBody = collision.collider?.parent();
        if (otherBody && otherBody.isDynamic()) {
          const n = collision.translationApplied;
          const pushDir = { x: -n.x, y: 0, z: -n.z };
          const len = Math.sqrt(pushDir.x ** 2 + pushDir.z ** 2);
          if (len > 0.001) {
            otherBody.applyImpulse({
              x: (pushDir.x / len) * cc.pushForce * dt,
              y: 0,
              z: (pushDir.z / len) * cc.pushForce * dt,
            }, true);
          }
        }
      }

      // ── Sync Transform ────────────────────────────────────────────────────
      const newPos = cc._rapierBody.translation();
      transform.position.set(
        newPos.x,
        newPos.y - cc.centerOffsetY,
        newPos.z,
      );

      // Clear move input (must be re-set every frame by scripts)
      cc._moveInput.set(0, 0);
    }

    // ── Cleanup removed entities ──────────────────────────────────────────
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this.destroyCC(entity);
        this.tracked.delete(entity);
      }
    }
  }

  update(_entities: Set<EntityId>, _ecs: ECSManager, _dt: number): void {
    // Transform sync happens in fixedUpdate; nothing needed here
  }
}
