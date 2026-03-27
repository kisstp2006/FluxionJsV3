// ============================================================
// FluxionJS V3 — Physics World (Lean Core)
// Responsibilities: Rapier world lifecycle, fixed-step simulation,
// collision event emission (enter / stay / exit), force/impulse API,
// collider-handle → entity reverse lookup.
//
// Body & collider lifecycle  → PhysicsBodySystem
// Character controller       → CharacterControllerSystem
// Raycasting / shapecasts    → PhysicsQuerySystem
// ============================================================

import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { EntityId } from '../core/ECS';
import { EngineEvents } from '../core/EventSystem';
import { PhysicsBodySystem } from './PhysicsBodySystem';
import { CharacterControllerSystem } from './CharacterControllerSystem';
import { colliderPairKey } from './PhysicsTypes';

// Rapier module type (loaded dynamically — WASM)
type RAPIER = typeof import('@dimforge/rapier3d-compat');

// ── Module-level scratch (zero allocations in hot paths) ──────────────────────
const _vel = new THREE.Vector3();

export class PhysicsWorld {
  private rapier!: RAPIER;
  private world!: InstanceType<RAPIER['World']>;
  private eventQueue: any = null;
  private engine: Engine;
  private _initialized = false;
  private gravity = new THREE.Vector3(0, -9.81, 0);

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
    this.engine = engine;
  }

  async init(): Promise<void> {
    const RAPIER = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    this.rapier  = RAPIER;
    this.world   = new RAPIER.World({ x: this.gravity.x, y: this.gravity.y, z: this.gravity.z } as any);
    this.eventQueue = new RAPIER.EventQueue(true);
    this._initialized = true;

    // Register focused ECS systems
    this.engine.ecs.addSystem(new PhysicsBodySystem(this));
    this.engine.ecs.addSystem(new CharacterControllerSystem(this));

    // Fixed-step simulation + event dispatch
    this.engine.events.on(EngineEvents.FIXED_UPDATE, (dt: number) => {
      if (!this._initialized) return;
      this.world.timestep = dt;
      this.world.step(this.eventQueue);
      this._drainEvents();
      this._emitStayEvents();
    });

    this.engine.registerSubsystem('physics', this);
  }

  // ── Collision event drain ─────────────────────────────────────────────────

  private _drainEvents(): void {
    this.eventQueue.drainCollisionEvents((h1: number, h2: number, started: boolean) => {
      const e1  = this.colliderHandleToEntity.get(h1) ?? null;
      const e2  = this.colliderHandleToEntity.get(h2) ?? null;
      const col = this.world.getCollider(h1);
      const isTrigger = col?.isSensor() ?? false;
      const key = colliderPairKey(h1, h2);

      if (isTrigger) {
        if (started) {
          this.activeTriggers.add(key);
          this.engine.events.emit('physics:trigger-enter', { entity1: e1, entity2: e2 });
        } else {
          this.activeTriggers.delete(key);
          this.engine.events.emit('physics:trigger-exit', { entity1: e1, entity2: e2 });
        }
      } else {
        if (started) {
          this.activeCollisions.add(key);
          this.engine.events.emit('physics:collision-enter', { entity1: e1, entity2: e2 });
        } else {
          this.activeCollisions.delete(key);
          this.engine.events.emit('physics:collision-exit', { entity1: e1, entity2: e2 });
        }
      }
    });
  }

  /** Emit stay events for every pair that is still active this step. */
  private _emitStayEvents(): void {
    for (const key of this.activeCollisions) {
      const [s1, s2] = key.split(':');
      const e1 = this.colliderHandleToEntity.get(Number(s1)) ?? null;
      const e2 = this.colliderHandleToEntity.get(Number(s2)) ?? null;
      this.engine.events.emit('physics:collision-stay', { entity1: e1, entity2: e2, contactPoint: null });
    }
    for (const key of this.activeTriggers) {
      const [s1, s2] = key.split(':');
      const e1 = this.colliderHandleToEntity.get(Number(s1)) ?? null;
      const e2 = this.colliderHandleToEntity.get(Number(s2)) ?? null;
      this.engine.events.emit('physics:trigger-stay', { entity1: e1, entity2: e2 });
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
    // Also remove from active collision sets to prevent stale stay events
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
    const cc = this.engine.ecs.getComponent<any>(entity, 'CharacterController');
    if (cc) cc._moveInput.set(x, z);
  }

  ccJump(entity: EntityId): void {
    const cc = this.engine.ecs.getComponent<any>(entity, 'CharacterController');
    if (cc) cc._wantsJump = true;
  }

  ccSetCrouch(entity: EntityId, state: boolean): void {
    const cc = this.engine.ecs.getComponent<any>(entity, 'CharacterController');
    if (cc) cc._wantsCrouch = state;
  }

  ccSetRunning(entity: EntityId, state: boolean): void {
    const cc = this.engine.ecs.getComponent<any>(entity, 'CharacterController');
    if (cc) cc._wantsRun = state;
  }

  ccIsGrounded(entity: EntityId): boolean {
    return this.engine.ecs.getComponent<any>(entity, 'CharacterController')?._isGrounded ?? false;
  }

  ccIsCrouching(entity: EntityId): boolean {
    return this.engine.ecs.getComponent<any>(entity, 'CharacterController')?._isCrouching ?? false;
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
