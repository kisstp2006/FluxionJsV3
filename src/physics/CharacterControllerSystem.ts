// ============================================================
// FluxionJS V3 — Character Controller System
//
// Responsibilities:
//   • Rapier KinematicCharacterController lifecycle
//   • Coyote time + jump buffering for responsive feel
//   • Stable ground detection (post-computeColliderMovement)
//   • Crouch collider rebuild only on actual state change
//   • Push force on dynamic bodies via setCharacterMass
//   • Capsule + velocity debug visualization (opt-in)
//
// Performance:
//   • All scratch vectors are module-level — zero heap alloc in hot path
//   • Crouch rebuild is O(1) and rare
//   • Debug draw is gated behind cc.debugVisualize flag
// ============================================================

import * as THREE from 'three';
import { ECSManager, EntityId, System } from '../core/ECS';
import { TransformComponent, CharacterControllerComponent } from '../core/Components';
import { DebugDraw } from '../renderer/DebugDraw';
import { PhysicsWorld } from './PhysicsWorld';

const DEG2RAD = Math.PI / 180;

// ── Module-level scratch (zero heap allocations in hot path) ─────────────────
const _desired       = { x: 0, y: 0, z: 0 };
const _moveDir       = new THREE.Vector3();
// debug draw — 10 slots avoids per-call allocation
const _dA = new THREE.Vector3();
const _dB = new THREE.Vector3();
const _dC = new THREE.Vector3();
const _dD = new THREE.Vector3();
const _dE = new THREE.Vector3();
const _dF = new THREE.Vector3();
const _dG = new THREE.Vector3();
const _dH = new THREE.Vector3();
const _dbgGround  = new THREE.Color(0.1, 0.85, 0.3);
const _dbgAir     = new THREE.Color(1.0, 0.5, 0.1);
const _dbgVelUp   = new THREE.Color(0.3, 0.9, 1.0);
const _dbgVelDown = new THREE.Color(1.0, 0.3, 0.3);

/** Rapier skin offset — keeps the CC collider slightly away from surfaces. */
const SKIN = 0.01;
/** Min snap-to-ground distance multiplier relative to stepDownHeight. */
const SNAP_DIST_MULTIPLIER = 1.0;

export class CharacterControllerSystem implements System {
  readonly name = 'CharacterControllerSystem';
  readonly requiredComponents = ['Transform', 'CharacterController'];
  priority = -40;     // after PhysicsStepSystem (-51), before scripts (0)
  enabled = true;

  private tracked = new Set<EntityId>();

  constructor(private pw: PhysicsWorld) {}

  // ── Scene lifecycle ────────────────────────────────────────────────────────

  onSceneClear(): void {
    for (const entity of this.tracked) {
      this._destroy(entity);
    }
    this.tracked.clear();
  }

  // ── Main loops ─────────────────────────────────────────────────────────────

  // All simulation runs in fixedUpdate so it executes AFTER world.step()
  // (PhysicsStepSystem priority -51 → this system priority -40).
  fixedUpdate(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
    if (!this.pw.isReady) return;

    for (const entity of entities) {
      const cc = ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
      const t  = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!cc || !t) continue;

      if (!this.tracked.has(entity)) {
        this._setup(entity, cc, t);
        this.tracked.add(entity);
      }

      // Bail if Rapier objects failed to create
      if (!cc._rapierController || !cc._rapierBody || !cc._rapierCollider) continue;

      this._step(entity, cc, t, dt);
    }

    // Remove entities that no longer have the component
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this._destroy(entity);
        this.tracked.delete(entity);
      }
    }
  }

  // Variable-rate update: debug visualization only
  update(entities: Set<EntityId>, ecs: ECSManager): void {
    if (!this.pw.isReady) return;

    for (const entity of entities) {
      const cc = ecs.getComponent<CharacterControllerComponent>(entity, 'CharacterController');
      const t  = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!cc || !t || !this.tracked.has(entity)) continue;
      if (cc.debugVisualize) this._debugDraw(cc, t);
    }
  }

  // ── Setup (first-time init) ────────────────────────────────────────────────

  private _setup(
    entity: EntityId,
    cc: CharacterControllerComponent,
    t: TransformComponent,
  ): void {
    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    // Kinematic body — position-based, driven entirely by our movement computation
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(
        t.position.x,
        t.position.y + cc.centerOffsetY,
        t.position.z,
      );
    const body = world.createRigidBody(bodyDesc);
    cc._rapierBody = body;

    // Standing capsule collider
    const halfCyl = Math.max(0, (cc.height - 2 * cc.radius)) / 2;
    const colDesc = RAPIER.ColliderDesc.capsule(halfCyl, cc.radius);
    const collider = world.createCollider(colDesc, body);
    cc._rapierCollider = collider;
    this.pw.registerAuxColliderHandle(collider.handle, entity);

    // Rapier character controller
    const controller = world.createCharacterController(SKIN);
    controller.setMaxSlopeClimbAngle(cc.maxSlopeAngle * DEG2RAD);
    controller.setMinSlopeSlideAngle(cc.maxSlopeAngle * DEG2RAD);
    if (cc.maxStepHeight > 0) {
      controller.enableAutostep(cc.maxStepHeight, 0.05, true);
    }
    if (cc.stepDownHeight > 0) {
      controller.enableSnapToGround(cc.stepDownHeight * SNAP_DIST_MULTIPLIER);
    }
    controller.setSlideEnabled(true);
    controller.setCharacterMass(cc.mass);
    controller.setUp({ x: 0, y: 1, z: 0 });

    cc._rapierController = controller;

    // Reset runtime state
    cc._isGrounded      = false;
    cc._isCrouching     = false;
    cc._isRunning       = false;
    cc._velocityY       = 0;
    cc._jumpCount       = 0;
    cc._coyoteTimer     = 0;
    cc._jumpBufferTimer = 0;
    cc._moveInput.set(0, 0);
    cc._wantsJump    = false;
    cc._wantsCrouch  = false;
    cc._wantsRun     = false;
  }

  // ── Per-frame step ─────────────────────────────────────────────────────────

  private _step(
    entity: EntityId,
    cc: CharacterControllerComponent,
    t: TransformComponent,
    dt: number,
  ): void {
    // Snapshot grounded state from last frame (before this step overwrites it)
    const prevGrounded = cc._isGrounded;

    // ── Coyote time ─────────────────────────────────────────────────────────
    // Keep timer full while grounded; count down after leaving ground
    if (prevGrounded) {
      cc._coyoteTimer = cc.coyoteTime;
    } else {
      cc._coyoteTimer = Math.max(0, cc._coyoteTimer - dt);
    }

    // ── Jump buffer ─────────────────────────────────────────────────────────
    if (cc._wantsJump) {
      cc._jumpBufferTimer = cc.jumpBufferTime;
      cc._wantsJump = false;
    } else {
      cc._jumpBufferTimer = Math.max(0, cc._jumpBufferTimer - dt);
    }

    // ── Gravity ──────────────────────────────────────────────────────────────
    if (prevGrounded) {
      // Stay pressed against ground; clear downward drift
      if (cc._velocityY < 0) cc._velocityY = 0;
    } else {
      cc._velocityY -= 9.81 * cc.gravityScale * dt;
      // Terminal velocity — prevents tunneling through thin floors
      if (cc._velocityY < -50.0) cc._velocityY = -50.0;
    }

    // ── Jump execution ───────────────────────────────────────────────────────
    // First jump: must be grounded or within coyote window
    // Extra jumps: available as long as jumpCount < maxJumps
    const effectivelyGrounded = prevGrounded || cc._coyoteTimer > 0;
    const firstJumpAllowed    = cc._jumpCount === 0 && effectivelyGrounded;
    const extraJumpAllowed    = cc._jumpCount > 0 && cc._jumpCount < cc.maxJumps;

    if (cc._jumpBufferTimer > 0 && (firstJumpAllowed || extraJumpAllowed)) {
      cc._velocityY       = cc.jumpImpulse;
      cc._jumpCount      += 1;
      cc._coyoteTimer     = 0;   // consume coyote
      cc._jumpBufferTimer = 0;   // consume buffer
    }

    // ── Crouch toggle (rebuild collider only on actual state change) ─────────
    if (cc._wantsCrouch !== cc._isCrouching) {
      const canChange = cc._wantsCrouch || this._hasHeadroom(entity, cc, t);
      if (canChange) {
        cc._isCrouching = cc._wantsCrouch;
        this._rebuildCollider(entity, cc);
      }
    }

    // ── Running state ────────────────────────────────────────────────────────
    cc._isRunning = cc._wantsRun && prevGrounded && !cc._isCrouching;

    // ── Lateral speed selection ──────────────────────────────────────────────
    let lateralSpeed: number;
    if (cc._isCrouching) {
      lateralSpeed = cc.crouchSpeed;
    } else if (cc._isRunning) {
      lateralSpeed = cc.runSpeed;
    } else if (!prevGrounded) {
      lateralSpeed = cc.airSpeed * cc.airControl;
    } else {
      lateralSpeed = cc.walkSpeed;
    }

    // ── Desired movement vector ──────────────────────────────────────────────
    _moveDir.set(cc._moveInput.x, 0, cc._moveInput.y);
    if (_moveDir.lengthSq() > 1e-6) {
      _moveDir.normalize().multiplyScalar(lateralSpeed);
    }

    _desired.x = _moveDir.x * dt;
    _desired.y = cc._velocityY * dt;
    _desired.z = _moveDir.z * dt;

    // ── Rapier CC collision resolution ──────────────────────────────────────
    (cc._rapierController as any).computeColliderMovement(
      cc._rapierCollider,
      _desired,
    );

    // ── Update grounded state (post-step is authoritative) ──────────────────
    const nowGrounded = !!(cc._rapierController as any).computedGrounded();
    cc._isGrounded = nowGrounded;

    // Landing: reset jump count and clamp downward velocity
    if (!prevGrounded && nowGrounded) {
      cc._jumpCount = 0;
      if (cc._velocityY < 0) cc._velocityY = 0;
    }

    // ── Apply movement ───────────────────────────────────────────────────────
    const actual  = (cc._rapierController as any).computedMovement();
    const bodyPos = (cc._rapierBody as any).translation();

    const newX = bodyPos.x + actual.x;
    const newY = bodyPos.y + actual.y;
    const newZ = bodyPos.z + actual.z;

    (cc._rapierBody as any).setNextKinematicTranslation({ x: newX, y: newY, z: newZ });

    // ── Sync transform from body (body center = feet + offsetY) ─────────────
    t.position.x = newX;
    t.position.y = newY - cc.centerOffsetY;
    t.position.z = newZ;

    // ── Reset per-frame input ────────────────────────────────────────────────
    cc._moveInput.set(0, 0);
    cc._wantsRun = false;
    // _wantsCrouch is intentionally NOT reset — it's a held state
  }

  // ── Headroom check (uncrouch) ──────────────────────────────────────────────
  // Uses an overlap query with the *standing* capsule to detect obstructions.
  // Returns true if safe to uncrouch (no geometry in standing capsule volume).
  private _hasHeadroom(entity: EntityId, cc: CharacterControllerComponent, t: TransformComponent): boolean {
    // Sphere overlap at the top of the *standing* capsule — detects overhead geometry.
    // The standing top sphere centre = feet + centerOffsetY + halfCyl_stand
    const halfCylStand = Math.max(0, (cc.height - 2 * cc.radius)) / 2;
    _dE.set(t.position.x, t.position.y + cc.centerOffsetY + halfCylStand, t.position.z);
    _dA.set(cc.radius * 0.9, 0, 0); // re-used as halfExtents (x = radius)
    const result = this.pw.query.overlap('sphere', _dA, _dE);
    // Safe if nothing overlaps, or only this entity's own CC collider
    for (const e of result.entities) {
      if (e !== entity) return false;
    }
    return true;
  }

  // ── Collider rebuild (crouch ↔ stand, triggered only on state change) ──────

  private _rebuildCollider(entity: EntityId, cc: CharacterControllerComponent): void {
    const RAPIER = this.pw.rapierModule;
    const world  = this.pw.rapierWorld;

    if (cc._rapierCollider) {
      this.pw.unregisterAuxColliderHandle((cc._rapierCollider as any).handle);
      try { world.removeCollider(cc._rapierCollider as any, true); } catch { /**/ }
      cc._rapierCollider = null;
    }

    const activeH = cc._isCrouching ? cc.crouchHeight : cc.height;
    const halfCyl = Math.max(0, (activeH - 2 * cc.radius)) / 2;
    const colDesc = RAPIER.ColliderDesc.capsule(halfCyl, cc.radius);
    const collider = world.createCollider(colDesc, cc._rapierBody as any);
    cc._rapierCollider = collider;
    this.pw.registerAuxColliderHandle(collider.handle, entity);
  }

  // ── Destroy (entity removed or scene cleared) ─────────────────────────────

  private _destroy(entity: EntityId): void {
    const cc = this.pw.engineRef.ecs.getComponent<CharacterControllerComponent>(
      entity,
      'CharacterController',
    );
    if (!cc) return;

    const world = this.pw.rapierWorld;

    if (cc._rapierCollider) {
      this.pw.unregisterAuxColliderHandle((cc._rapierCollider as any).handle);
      try { world.removeCollider(cc._rapierCollider as any, true); } catch { /**/ }
      cc._rapierCollider = null;
    }
    if (cc._rapierBody) {
      try { world.removeRigidBody(cc._rapierBody as any); } catch { /**/ }
      cc._rapierBody = null;
    }
    if (cc._rapierController) {
      try { world.removeCharacterController(cc._rapierController as any); } catch { /**/ }
      cc._rapierController = null;
    }
  }

  // ── Debug visualization (capsule + velocity indicator) ────────────────────

  private _debugDraw(cc: CharacterControllerComponent, t: TransformComponent): void {
    const activeH = cc._isCrouching ? cc.crouchHeight : cc.height;
    const halfCyl = Math.max(0, (activeH - 2 * cc.radius)) / 2;
    const r       = cc.radius;
    const cx      = t.position.x;
    const cy      = t.position.y + cc.centerOffsetY;
    const cz      = t.position.z;

    const bodyColor = cc._isGrounded ? _dbgGround : _dbgAir;

    // Bottom hemisphere center (capsule bottom sphere)
    _dA.set(cx, cy - halfCyl, cz);
    // Top hemisphere center (capsule top sphere)
    _dB.set(cx, cy + halfCyl, cz);

    // Draw two "rings" approximating each hemisphere (16-segment circles)
    DebugDraw.drawLineSphere(_dA, r, bodyColor, 16);
    DebugDraw.drawLineSphere(_dB, r, bodyColor, 16);

    // Four vertical lines connecting top and bottom hemispheres (cylinder outline)
    _dC.set(cx + r, cy - halfCyl, cz);   _dD.set(cx + r, cy + halfCyl, cz);
    DebugDraw.drawLine(_dC, _dD, bodyColor);

    _dC.set(cx - r, cy - halfCyl, cz);   _dD.set(cx - r, cy + halfCyl, cz);
    DebugDraw.drawLine(_dC, _dD, bodyColor);

    _dC.set(cx, cy - halfCyl, cz + r);   _dD.set(cx, cy + halfCyl, cz + r);
    DebugDraw.drawLine(_dC, _dD, bodyColor);

    _dC.set(cx, cy - halfCyl, cz - r);   _dD.set(cx, cy + halfCyl, cz - r);
    DebugDraw.drawLine(_dC, _dD, bodyColor);

    // Vertical velocity indicator (short line from center, scaled)
    if (Math.abs(cc._velocityY) > 0.05) {
      const velColor = cc._velocityY > 0 ? _dbgVelUp : _dbgVelDown;
      const scale    = Math.min(Math.abs(cc._velocityY) * 0.15, 1.5);
      _dE.set(cx, cy, cz);
      _dF.set(cx, cy + Math.sign(cc._velocityY) * scale, cz);
      DebugDraw.drawLine(_dE, _dF, velColor);
    }

    // Ground contact cross (small red cross at feet)
    if (cc._isGrounded) {
      const fy = t.position.y;
      const hs = 0.1;
      _dG.set(cx - hs, fy, cz);   _dH.set(cx + hs, fy, cz);
      DebugDraw.drawLine(_dG, _dH, _dbgGround);
      _dG.set(cx, fy, cz - hs);   _dH.set(cx, fy, cz + hs);
      DebugDraw.drawLine(_dG, _dH, _dbgGround);
    }
  }
}
