// ============================================================
// FluxionJS V3 — Physics Gizmo System (editor-only)
//
// Draws wireframe shapes for every entity that carries a
// physics component while the simulation is paused (edit mode).
//
// Shape colours:
//   Collider (solid)   — green
//   Collider (trigger) — cyan
//   Rigidbody dynamic  — red
//   Rigidbody kinematic— yellow
//   Rigidbody static   — grey
//   Character Controller — blue
// ============================================================

import * as THREE from 'three';
import { ECSManager, EntityId, System } from '../core/ECS';
import {
  TransformComponent,
  ColliderComponent,
  RigidbodyComponent,
  CharacterControllerComponent,
} from '../core/Components';
import { DebugDraw } from '../renderer/DebugDraw';
import { Engine } from '../core/Engine';

// ── Module-level scratch — zero heap alloc in hot path ────────────────────────
const _wp  = new THREE.Vector3();
const _wq  = new THREE.Quaternion();
const _off = new THREE.Vector3();
const _top = new THREE.Vector3();
const _bot = new THREE.Vector3();
const _ax  = new THREE.Vector3();
const _p1  = new THREE.Vector3();
const _p2  = new THREE.Vector3();
const _p3  = new THREE.Vector3();
const _p4  = new THREE.Vector3();
// 8 OBB corners
const _c: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());

// ── Colour palette ────────────────────────────────────────────────────────────
const _cCollider  = new THREE.Color(0.15, 0.85, 0.35);   // solid collider — green
const _cTrigger   = new THREE.Color(0.10, 0.80, 0.95);   // trigger         — cyan
const _cDynamic   = new THREE.Color(0.95, 0.30, 0.20);   // dynamic RB      — red
const _cKinematic = new THREE.Color(0.95, 0.80, 0.10);   // kinematic RB    — yellow
const _cStatic    = new THREE.Color(0.50, 0.50, 0.50);   // static RB       — grey
const _cCC        = new THREE.Color(0.30, 0.55, 1.00);   // char controller — blue

// OBB corner sign table (constant, never mutated)
const _signs: [number, number, number][] = [
  [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
  [-1,  1, -1], [1,  1, -1], [1,  1, 1], [-1,  1, 1],
];
const _edges: [number, number][] = [
  [0,1],[1,2],[2,3],[3,0], // bottom face
  [4,5],[5,6],[6,7],[7,4], // top face
  [0,4],[1,5],[2,6],[3,7], // verticals
];

export class PhysicsGizmoSystem implements System {
  readonly name = 'PhysicsGizmoSystem';
  /** Process every entity — we check for physics components individually. */
  readonly requiredComponents = ['Transform'];
  /** After all game systems so gizmos land on top. */
  priority = 300;
  enabled  = true;

  constructor(private engine: Engine) {}

  // ── Optional System interface stubs ──────────────────────────────────────
  onSceneClear(): void {}

  // ── Per-frame gizmo draw ──────────────────────────────────────────────────

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    if (!this.engine.simulationPaused) return; // only in edit mode

    for (const entity of entities) {
      const t = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!t) continue;

      const col = ecs.getComponent<ColliderComponent>             (entity, 'Collider') ?? null;
      const rb  = ecs.getComponent<RigidbodyComponent>            (entity, 'Rigidbody') ?? null;
      const cc  = ecs.getComponent<CharacterControllerComponent>  (entity, 'CharacterController') ?? null;

      if (col) this._drawCollider(t, col, rb);
      if (rb && !col) this._drawRbMarker(t, rb); // RB with no collider → small cross
      if (cc) this._drawCC(t, cc);
    }
  }

  // ── Collider ───────────────────────────────────────────────────────────────

  private _drawCollider(
    t: TransformComponent,
    col: ColliderComponent,
    rb: RigidbodyComponent | null,
  ): void {
    const color = col.isTrigger ? _cTrigger : _cCollider;

    // World centre = worldPos + rotate(offset)
    _wp.copy(t.worldPosition);
    _wq.copy(t.worldRotation);
    _off.copy(col.offset).applyQuaternion(_wq);
    _wp.add(_off);

    switch (col.shape) {
      case 'box':
        this._drawOBB(_wp, _wq, col.size, color);
        break;

      case 'sphere':
        DebugDraw.drawLineSphere(_wp, col.radius, color, 16);
        break;

      case 'capsule':
        this._drawCapsule(_wp, _wq, col.radius, col.height, color);
        break;

      case 'mesh':
      case 'convex': {
        // Represent with a scaled unit box — actual mesh not available in editor
        const ws = t.worldScale;
        _p1.set(ws.x, ws.y, ws.z);
        this._drawOBB(_wp, _wq, _p1, color);
        break;
      }
    }

    // Small body-type cross drawn at centre so you can tell static vs dynamic
    if (rb) {
      const rbColor = rb.bodyType === 'dynamic'   ? _cDynamic
                    : rb.bodyType === 'kinematic' ? _cKinematic
                    : _cStatic;
      DebugDraw.drawCross(_wp, 0.12, rbColor);
    }
  }

  // ── Rigidbody without collider ─────────────────────────────────────────────

  private _drawRbMarker(t: TransformComponent, rb: RigidbodyComponent): void {
    const color = rb.bodyType === 'dynamic'   ? _cDynamic
                : rb.bodyType === 'kinematic' ? _cKinematic
                : _cStatic;
    DebugDraw.drawCross(t.worldPosition, 0.2, color);
  }

  // ── Character Controller ───────────────────────────────────────────────────

  private _drawCC(t: TransformComponent, cc: CharacterControllerComponent): void {
    _wp.copy(t.worldPosition);
    _wp.y += cc.centerOffsetY;
    _wq.copy(t.worldRotation);
    const activeH = cc._isCrouching ? cc.crouchHeight : cc.height;
    this._drawCapsule(_wp, _wq, cc.radius, activeH, _cCC);
  }

  // ── Shape helpers ──────────────────────────────────────────────────────────

  /** Oriented bounding box (rotated wireframe). */
  private _drawOBB(
    center: THREE.Vector3,
    rot: THREE.Quaternion,
    size: THREE.Vector3,
    color: THREE.Color,
  ): void {
    const hx = size.x * 0.5;
    const hy = size.y * 0.5;
    const hz = size.z * 0.5;
    for (let i = 0; i < 8; i++) {
      _c[i]
        .set(_signs[i][0] * hx, _signs[i][1] * hy, _signs[i][2] * hz)
        .applyQuaternion(rot)
        .add(center);
    }
    for (const [a, b] of _edges) {
      DebugDraw.drawLine(_c[a], _c[b], color);
    }
  }

  /**
   * Capsule gizmo — two hemisphere rings + four connecting lines.
   * The capsule axis is the entity's local Y rotated into world space.
   */
  private _drawCapsule(
    center: THREE.Vector3,
    rot: THREE.Quaternion,
    radius: number,
    height: number,
    color: THREE.Color,
  ): void {
    const halfCyl = Math.max(0, (height - 2 * radius)) * 0.5;

    // Capsule axis in world space (body local Y)
    _ax.set(0, 1, 0).applyQuaternion(rot);
    _top.copy(center).addScaledVector(_ax, halfCyl);
    _bot.copy(center).addScaledVector(_ax, -halfCyl);

    // Two "end cap" sphere approximations (16-seg)
    DebugDraw.drawLineSphere(_top, radius, color, 16);
    DebugDraw.drawLineSphere(_bot, radius, color, 16);

    // Build two perpendicular vectors to _ax for cylinder connecting lines
    if (halfCyl > 0.001) {
      // Pick a vector not parallel to _ax
      _p1.set(Math.abs(_ax.x) < 0.9 ? 1 : 0, Math.abs(_ax.y) < 0.9 ? 1 : 0, 0);
      _p1.crossVectors(_p1, _ax).normalize();
      _p2.crossVectors(_ax, _p1).normalize();

      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI * 0.5;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        // Radial offset along perp combination
        const rx = (_p1.x * c + _p2.x * s) * radius;
        const ry = (_p1.y * c + _p2.y * s) * radius;
        const rz = (_p1.z * c + _p2.z * s) * radius;
        _p3.set(_top.x + rx, _top.y + ry, _top.z + rz);
        _p4.set(_bot.x + rx, _bot.y + ry, _bot.z + rz);
        DebugDraw.drawLine(_p3, _p4, color);
      }
    }
  }
}
