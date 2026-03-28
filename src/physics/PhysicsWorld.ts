// ============================================================
// FluxionJS V3 — Physics World (Lean Core)
// Responsibilities: Rapier world lifecycle, collision event emission
// (enter / stay / exit), force/impulse API, collider-handle → entity lookup.
//
// Fixed-update execution order (all in ecs.fixedUpdate()):
//   priority -100  PhysicsBodySystem   — create/sync bodies & colliders
//   priority -51   PhysicsStepSystem   — world.step() + event drain
//   priority -40   CharacterControllerSystem — CC movement (fresh pipeline)
//
// Body & collider lifecycle  → PhysicsBodySystem
// Character controller       → CharacterControllerSystem
// Raycasting / shapecasts    → PhysicsQuerySystem
// ============================================================

import * as THREE from 'three';
import { ECSManager, EntityId, System } from '../core/ECS';
import { Engine } from '../core/Engine';
import { PhysicsBodySystem } from './PhysicsBodySystem';
import { CharacterControllerSystem } from './CharacterControllerSystem';
import { PhysicsQuerySystem } from './PhysicsQuerySystem';
import { colliderPairKey } from './PhysicsTypes';

// Rapier module type (loaded dynamically — WASM)
type RAPIER = typeof import('@dimforge/rapier3d-compat');

// ── Module-level scratch (zero allocations in hot paths) ──────────────────────
const _vel = new THREE.Vector3();

// ── Internal: steps the Rapier world and drains events ───────────────────────
// Runs between PhysicsBodySystem (creates bodies) and
// CharacterControllerSystem (needs up-to-date query pipeline).
class PhysicsStepSystem implements System {
  readonly name = 'PhysicsStepSystem';
  readonly requiredComponents: string[] = [];
  priority = -51;
  enabled = true;

  constructor(private pw: PhysicsWorld) {}

  // Called every fixed step (only when !simulationPaused)
  fixedUpdate(_entities: Set<EntityId>, _ecs: ECSManager, dt: number): void {
    const world = this.pw.rapierWorld;
    world.timestep = dt;
    world.step(this.pw._eventQueue);
    this.pw._drainEvents();
    this.pw._emitStayEvents();
  }

  // Required by System interface — no variable-rate work needed
  update(_entities: Set<EntityId>, _ecs: ECSManager): void { /* no-op */ }
}

export class PhysicsWorld {
  private rapier!: RAPIER;
  private world!: InstanceType<RAPIER['World']>;
  /** @internal — accessed by PhysicsStepSystem */
  _eventQueue: any = null;
  private _engine: Engine;
  private _initialized = false;
  private gravity = new THREE.Vector3(0, -9.81, 0);

  /** Unified spatial query API — available after init(). */
  query!: PhysicsQuerySystem;

  // ── Reverse-lookup maps ───────────────────────────────────────────────────
  /** collider handle  → EntityId (all registered colliders incl. CC) */
  private colliderHandleToEntity: Map<number, EntityId> = new Map();
  /** EntityId → primary Rapier body (managed by PhysicsBodySystem) */
  private bodyMap: Map<EntityId, any> = new Map();
  /** EntityId → primary Rapier collider (managed by PhysicsBodySystem) */
  private colliderMap: Map<EntityId, any> = new Map();

  // ── Collision stay tracking ───────────────────────────────────────────────
  /** Pairs currently in contact (non-sensor). Key = colliderPairKey. */
  private activeCollisions: Set<string> = new Set();
  /** Pairs currently in trigger overlap. Key = colliderPairKey. */
  private activeTriggers: Set<string> = new Set();

  constructor(engine: Engine) {
    this._engine = engine;
  }

  /** Public accessor used by subsystems — avoids bracket-notation hacks. */
  get engineRef(): Engine { return this._engine; }

  async init(): Promise<void> {
    const RAPIER = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    this.rapier      = RAPIER;
    this.world       = new RAPIER.World({ x: this.gravity.x, y: this.gravity.y, z: this.gravity.z } as any);
    this._eventQueue = new RAPIER.EventQueue(true);
    this._initialized = true;

    // Spatial query API
    this.query = new PhysicsQuerySystem(this);

    // Register ECS systems in fixed-update priority order:
    //   PhysicsBodySystem (-100) → PhysicsStepSystem (-51) → CharacterControllerSystem (-40)
    this._engine.ecs.addSystem(new PhysicsBodySystem(this));
    this._engine.ecs.addSystem(new PhysicsStepSystem(this));
    this._engine.ecs.addSystem(new CharacterControllerSystem(this));

    this._engine.registerSubsystem('physics', this);
  }

  // ── Collision event drain (@internal — called by PhysicsStepSystem) ──────

  /** @internal */
  _drainEvents(): void {
    this._eventQueue.drainCollisionEvents((h1: number, h2: number, started: boolean) => {
      const e1  = this.colliderHandleToEntity.get(h1) ?? null;
      const e2  = this.colliderHandleToEntity.get(h2) ?? null;
      const col = this.world.getCollider(h1);
      const isTrigger = col?.isSensor() ?? false;
      const key = colliderPairKey(h1, h2);

      if (isTrigger) {
        if (started) {
          this.activeTriggers.add(key);
          this._engine.events.emit('physics:trigger-enter', { entity1: e1, entity2: e2 });
        } else {
          this.activeTriggers.delete(key);
          this._engine.events.emit('physics:trigger-exit', { entity1: e1, entity2: e2 });
        }
      } else {
        if (started) {
          this.activeCollisions.add(key);
          this._engine.events.emit('physics:collision-enter', { entity1: e1, entity2: e2 });
        } else {
          this.activeCollisions.delete(key);
          this._engine.events.emit('physics:collision-exit', { entity1: e1, entity2: e2 });
        }
      }
    });
  }

  /** Emit stay events for every pair still active this step. @internal */
  _emitStayEvents(): void {
    for (const key of this.activeCollisions) {
      const [s1, s2] = key.split(':');
      const e1 = this.colliderHandleToEntity.get(Number(s1)) ?? null;
      const e2 = this.colliderHandleToEntity.get(Number(s2)) ?? null;
      this._engine.events.emit('physics:collision-stay', { entity1: e1, entity2: e2, contactPoint: null });
    }
    for (const key of this.activeTriggers) {
      const [s1, s2] = key.split(':');
      const e1 = this.colliderHandleToEntity.get(Number(s1)) ?? null;
      const e2 = this.colliderHandleToEntity.get(Number(s2)) ?? null;
      this._engine.events.emit('physics:trigger-stay', { entity1: e1, entity2: e2 });
    }
  }

  // ── Reverse-lookup registration (called by PhysicsBodySystem & CC system) ──

  registerBody(entity: EntityId, body: any): void {
    this.bodyMap.set(entity, body);
  }

  unregisterBody(entity: EntityId): void {
    this.bodyMap.delete(entity);
  }

  registerCollider(entity: EntityId, collider: any): void {
    this.colliderMap.set(entity, collider);
    this.colliderHandleToEntity.set(collider.handle, entity);
  }

  unregisterCollider(entity: EntityId): void {
    const col = this.colliderMap.get(entity);
    if (col) this.colliderHandleToEntity.delete(col.handle);
    this.colliderMap.delete(entity);
  }

  /** Register a collider handle that doesn't belong to the main bodyMap
   *  (e.g. character controller internal colliders). */
  registerAuxColliderHandle(handle: number, entity: EntityId): void {
    this.colliderHandleToEntity.set(handle, entity);
  }

  unregisterAuxColliderHandle(handle: number): void {
    this.colliderHandleToEntity.delete(handle);
    // Remove stale stay-event tracking keys
    for (const key of [...this.activeCollisions]) {
      const [s1, s2] = key.split(':');
      if (Number(s1) === handle || Number(s2) === handle) this.activeCollisions.delete(key);
    }
    for (const key of [...this.activeTriggers]) {
      const [s1, s2] = key.split(':');
      if (Number(s1) === handle || Number(s2) === handle) this.activeTriggers.delete(key);
    }
  }

  /** Look up entity by collider handle — O(1). */
  entityForCollider(handle: number): EntityId | null {
    return this.colliderHandleToEntity.get(handle) ?? null;
  }

  getBody(entity: EntityId): any {
    return this.bodyMap.get(entity) ?? null;
  }

  getCollider(entity: EntityId): any {
    return this.colliderMap.get(entity) ?? null;
  }

  // ── Physics world access (for subsystems only) ────────────────────────────

  get rapierWorld() { return this.world; }
  get rapierModule() { return this.rapier; }
  get isInitialized() { return this._initialized; }
  get isReady(): boolean { return this._initialized; }

  // ── World settings ────────────────────────────────────────────────────────

  setGravity(x: number, y: number, z: number): void {
    this.gravity.set(x, y, z);
    if (this._initialized) this.world.gravity = { x, y, z };
  }

  // ── Force & impulse API ───────────────────────────────────────────────────

  applyForce(entity: EntityId, force: THREE.Vector3): void {
    this.bodyMap.get(entity)?.addForce({ x: force.x, y: force.y, z: force.z }, true);
  }

  applyImpulse(entity: EntityId, impulse: THREE.Vector3): void {
    this.bodyMap.get(entity)?.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
  }

  applyTorque(entity: EntityId, torque: THREE.Vector3): void {
    this.bodyMap.get(entity)?.addTorque({ x: torque.x, y: torque.y, z: torque.z }, true);
  }

  setVelocity(entity: EntityId, velocity: THREE.Vector3): void {
    this.bodyMap.get(entity)?.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
  }

  getVelocity(entity: EntityId): THREE.Vector3 {
    const body = this.bodyMap.get(entity);
    if (!body) return _vel.set(0, 0, 0);
    const v = body.linvel();
    return _vel.set(v.x, v.y, v.z);
  }

  wakeUp(entity: EntityId): void {
    this.bodyMap.get(entity)?.wakeUp();
  }

  sleep(entity: EntityId): void {
    this.bodyMap.get(entity)?.sleep();
  }

  isSleeping(entity: EntityId): boolean {
    return this.bodyMap.get(entity)?.isSleeping() ?? false;
  }

  // ── Character Controller API (script-facing) ──────────────────────────────

  ccMove(entity: EntityId, x: number, z: number): void {
    const cc = this._engine.ecs.getComponent<any>(entity, 'CharacterController');
    if (cc) cc._moveInput.set(x, z);
  }

  ccJump(entity: EntityId): void {
    const cc = this._engine.ecs.getComponent<any>(entity, 'CharacterController');
    if (cc) cc._wantsJump = true;
  }

  ccSetCrouch(entity: EntityId, state: boolean): void {
    const cc = this._engine.ecs.getComponent<any>(entity, 'CharacterController');
    if (cc) cc._wantsCrouch = state;
  }

  ccSetRunning(entity: EntityId, state: boolean): void {
    const cc = this._engine.ecs.getComponent<any>(entity, 'CharacterController');
    if (cc) cc._wantsRun = state;
  }

  ccIsGrounded(entity: EntityId): boolean {
    return this._engine.ecs.getComponent<any>(entity, 'CharacterController')?._isGrounded ?? false;
  }

  ccIsCrouching(entity: EntityId): boolean {
    return this._engine.ecs.getComponent<any>(entity, 'CharacterController')?._isCrouching ?? false;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    if (this._initialized) this.world.free();
    this.bodyMap.clear();
    this.colliderMap.clear();
    this.colliderHandleToEntity.clear();
    this.activeCollisions.clear();
    this.activeTriggers.clear();
  }
}
