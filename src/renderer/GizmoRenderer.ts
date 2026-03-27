// ============================================================
// FluxionJS V2 — Gizmo Visual Renderer
// Pure rendering of translate/rotate/scale gizmos via DebugDraw
// ============================================================

import * as THREE from 'three';
import { DebugDraw } from './DebugDraw';

export type GizmoAxis = 'x' | 'y' | 'z' | null;
export type GizmoMode = 'translate' | 'rotate' | 'scale';

// Visual constants
const SHAFT = 1.0;
const HEAD = 0.12;
const HEAD_R = 0.035;
const HEAD_SEGS = 6;
const RING_SEGS = 64;
const CUBE_H = 0.035;
const SIZE_FACTOR = 0.15;

// Axis colors (X=red, Y=green, Z=blue)
const _xC = new THREE.Color(0.9, 0.2, 0.2);
const _yC = new THREE.Color(0.2, 0.8, 0.2);
const _zC = new THREE.Color(0.2, 0.4, 0.95);
const _hi = new THREE.Color(1.0, 0.9, 0.0); // highlight (yellow)

// Temp vectors — safe to reuse since DebugDraw reads values immediately
const _o = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();

function col(axis: 'x' | 'y' | 'z', active: GizmoAxis, hovered: GizmoAxis): THREE.Color {
  if (active === axis || hovered === axis) return _hi;
  return axis === 'x' ? _xC : axis === 'y' ? _yC : _zC;
}

function dir(axis: 'x' | 'y' | 'z', quat: THREE.Quaternion, space: 'local' | 'world'): THREE.Vector3 {
  _d.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  if (space === 'local') _d.applyQuaternion(quat);
  return _d;
}

function perps(d: THREE.Vector3): void {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  if (ay <= ax && ay <= az) _u.set(0, 1, 0);
  else if (ax <= az) _u.set(1, 0, 0);
  else _u.set(0, 0, 1);
  _r.crossVectors(d, _u).normalize();
  _u.crossVectors(_r, d).normalize();
}

function drawCone(
  tip: THREE.Vector3, d: THREE.Vector3,
  len: number, rad: number, c: THREE.Color,
): void {
  const bx = tip.x - d.x * len;
  const by = tip.y - d.y * len;
  const bz = tip.z - d.z * len;
  perps(d);
  const step = (Math.PI * 2) / HEAD_SEGS;
  let px = bx + _r.x * rad, py = by + _r.y * rad, pz = bz + _r.z * rad;
  for (let i = 1; i <= HEAD_SEGS; i++) {
    const a = i * step;
    const cos = Math.cos(a), sin = Math.sin(a);
    const nx = bx + (cos * _r.x + sin * _u.x) * rad;
    const ny = by + (cos * _r.y + sin * _u.y) * rad;
    const nz = bz + (cos * _r.z + sin * _u.z) * rad;
    _p0.set(px, py, pz);
    DebugDraw.drawLine(_p0, tip, c);
    _p1.set(nx, ny, nz);
    DebugDraw.drawLine(_p0, _p1, c);
    px = nx; py = ny; pz = nz;
  }
}

export class GizmoRenderer {
  /** Compute scale factor for constant screen-size gizmo. */
  static getScale(pos: THREE.Vector3, cam: THREE.PerspectiveCamera): number {
    return pos.distanceTo(cam.position) * Math.tan(cam.fov * Math.PI / 360) * SIZE_FACTOR;
  }

  static drawTranslateGizmo(
    pos: THREE.Vector3, quat: THREE.Quaternion, space: 'local' | 'world',
    cam: THREE.PerspectiveCamera, active: GizmoAxis = null, hovered: GizmoAxis = null,
  ): void {
    const s = this.getScale(pos, cam);
    for (const ax of ['x', 'y', 'z'] as const) {
      const d2 = dir(ax, quat, space);
      const c = col(ax, active, hovered);
      _o.copy(pos);
      _t.copy(pos).addScaledVector(d2, SHAFT * s);
      DebugDraw.drawLine(_o, _t, c);
      _t.copy(pos).addScaledVector(d2, (SHAFT + HEAD) * s);
      drawCone(_t, d2, HEAD * s, HEAD_R * s, c);
    }
  }

  static drawRotateGizmo(
    pos: THREE.Vector3, quat: THREE.Quaternion, space: 'local' | 'world',
    cam: THREE.PerspectiveCamera, active: GizmoAxis = null, hovered: GizmoAxis = null,
  ): void {
    const radius = this.getScale(pos, cam) * SHAFT;
    for (const ax of ['x', 'y', 'z'] as const) {
      dir(ax, quat, space);
      const c = col(ax, active, hovered);
      perps(_d);
      const step = (Math.PI * 2) / RING_SEGS;
      for (let i = 0; i < RING_SEGS; i++) {
        const a0 = i * step, a1 = (i + 1) * step;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        _p0.set(
          pos.x + (c0 * _r.x + s0 * _u.x) * radius,
          pos.y + (c0 * _r.y + s0 * _u.y) * radius,
          pos.z + (c0 * _r.z + s0 * _u.z) * radius,
        );
        _p1.set(
          pos.x + (c1 * _r.x + s1 * _u.x) * radius,
          pos.y + (c1 * _r.y + s1 * _u.y) * radius,
          pos.z + (c1 * _r.z + s1 * _u.z) * radius,
        );
        DebugDraw.drawLine(_p0, _p1, c);
      }
    }
  }

  static drawScaleGizmo(
    pos: THREE.Vector3, quat: THREE.Quaternion, space: 'local' | 'world',
    cam: THREE.PerspectiveCamera, active: GizmoAxis = null, hovered: GizmoAxis = null,
  ): void {
    const s = this.getScale(pos, cam);
    for (const ax of ['x', 'y', 'z'] as const) {
      const d2 = dir(ax, quat, space);
      const c = col(ax, active, hovered);
      _o.copy(pos);
      _t.copy(pos).addScaledVector(d2, SHAFT * s);
      DebugDraw.drawLine(_o, _t, c);
      _t.copy(pos).addScaledVector(d2, (SHAFT + CUBE_H) * s);
      const h = CUBE_H * s;
      _p0.set(_t.x - h, _t.y - h, _t.z - h);
      _p1.set(_t.x + h, _t.y + h, _t.z + h);
      DebugDraw.drawLineBox(_p0, _p1, c);
    }
  }

  // ── Camera Frustum Visualization ──
  // Clean frustum inspired by Unity / Godot gizmos

  private static readonly _camColor = new THREE.Color(0.85, 0.65, 0.2);     // warm amber
  private static readonly _camColorDim = new THREE.Color(0.5, 0.4, 0.15);   // dimmer unselected
  private static readonly _camNearColor = new THREE.Color(0.3, 0.8, 0.4);   // green near plane
  private static readonly _camFarColor = new THREE.Color(1.0, 1.0, 1.0);    // white far plane

  // Reusable vectors for frustum corners
  private static readonly _fc: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
  private static readonly _fwd = new THREE.Vector3();
  private static readonly _up2 = new THREE.Vector3();
  private static readonly _rt = new THREE.Vector3();

  /**
   * Draw a camera frustum gizmo showing FOV, near/far planes and direction.
   * Fixed-size visualization with constant frustum depth for clarity.
   */
  static drawCameraFrustum(
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    fov: number,
    _near: number,
    far: number,
    aspect: number,
    isOrtho: boolean,
    orthoSize: number,
    isSelected: boolean,
    editorCam?: THREE.PerspectiveCamera,
  ): void {
    // Constant-size frustum depth for visual clarity (like Unity/Godot)
    const frustumDepth = editorCam
      ? pos.distanceTo(editorCam.position) * 0.12
      : 2.0;
    const visNear = frustumDepth * 0.05;
    const visFar = frustumDepth;

    // Compute local axes
    this._fwd.set(0, 0, -1).applyQuaternion(quat);
    this._up2.set(0, 1, 0).applyQuaternion(quat);
    this._rt.set(1, 0, 0).applyQuaternion(quat);

    const fc = this._fc;

    if (isOrtho) {
      const hw = orthoSize * aspect * (visFar / Math.max(far, 1));
      const hh = orthoSize * (visFar / Math.max(far, 1));
      for (let i = 0; i < 2; i++) {
        const dist = i === 0 ? visNear : visFar;
        const base = i * 4;
        const center = _p0.copy(pos).addScaledVector(this._fwd, dist);
        fc[base + 0].copy(center).addScaledVector(this._rt, -hw).addScaledVector(this._up2, hh);
        fc[base + 1].copy(center).addScaledVector(this._rt, hw).addScaledVector(this._up2, hh);
        fc[base + 2].copy(center).addScaledVector(this._rt, hw).addScaledVector(this._up2, -hh);
        fc[base + 3].copy(center).addScaledVector(this._rt, -hw).addScaledVector(this._up2, -hh);
      }
    } else {
      const fovRad = THREE.MathUtils.degToRad(fov);
      const nearH = Math.tan(fovRad * 0.5) * visNear;
      const nearW = nearH * aspect;
      const farH = Math.tan(fovRad * 0.5) * visFar;
      const farW = farH * aspect;

      // Near plane corners
      const nc = _p0.copy(pos).addScaledVector(this._fwd, visNear);
      fc[0].copy(nc).addScaledVector(this._rt, -nearW).addScaledVector(this._up2, nearH);
      fc[1].copy(nc).addScaledVector(this._rt, nearW).addScaledVector(this._up2, nearH);
      fc[2].copy(nc).addScaledVector(this._rt, nearW).addScaledVector(this._up2, -nearH);
      fc[3].copy(nc).addScaledVector(this._rt, -nearW).addScaledVector(this._up2, -nearH);

      // Far plane corners
      const frc = _p1.copy(pos).addScaledVector(this._fwd, visFar);
      fc[4].copy(frc).addScaledVector(this._rt, -farW).addScaledVector(this._up2, farH);
      fc[5].copy(frc).addScaledVector(this._rt, farW).addScaledVector(this._up2, farH);
      fc[6].copy(frc).addScaledVector(this._rt, farW).addScaledVector(this._up2, -farH);
      fc[7].copy(frc).addScaledVector(this._rt, -farW).addScaledVector(this._up2, -farH);
    }

    const lineColor = isSelected ? this._camColor : this._camColorDim;
    const nearC = isSelected ? this._camNearColor : this._camColorDim;
    const farC = isSelected ? this._camFarColor : this._camColorDim;

    // Near plane
    DebugDraw.drawLineWorld(fc[0], fc[1], nearC);
    DebugDraw.drawLineWorld(fc[1], fc[2], nearC);
    DebugDraw.drawLineWorld(fc[2], fc[3], nearC);
    DebugDraw.drawLineWorld(fc[3], fc[0], nearC);

    // Far plane
    DebugDraw.drawLineWorld(fc[4], fc[5], farC);
    DebugDraw.drawLineWorld(fc[5], fc[6], farC);
    DebugDraw.drawLineWorld(fc[6], fc[7], farC);
    DebugDraw.drawLineWorld(fc[7], fc[4], farC);

    // Side edges (connecting near → far corners)
    DebugDraw.drawLineWorld(fc[0], fc[4], lineColor);
    DebugDraw.drawLineWorld(fc[1], fc[5], lineColor);
    DebugDraw.drawLineWorld(fc[2], fc[6], lineColor);
    DebugDraw.drawLineWorld(fc[3], fc[7], lineColor);

    // Up indicator triangle at top edge midpoint of far plane
    const upLen = visFar * 0.15;
    const upMid = _t.copy(fc[4]).add(fc[5]).multiplyScalar(0.5);
    const upEnd = _p0.copy(upMid).addScaledVector(this._up2, upLen);
    DebugDraw.drawLineWorld(fc[4], upEnd, lineColor);
    DebugDraw.drawLineWorld(fc[5], upEnd, lineColor);
  }

  // ── Collider Gizmo ────────────────────────────────────────────────────────

  private static readonly _colSel    = new THREE.Color(0.0, 1.0, 0.53);  // bright green
  private static readonly _colDim    = new THREE.Color(0.0, 0.6, 0.32);  // dim green
  private static readonly _colTrigSel = new THREE.Color(1.0, 0.55, 0.0); // orange (trigger)
  private static readonly _colTrigDim = new THREE.Color(0.6, 0.33, 0.0);

  // 8 reusable corner vectors for box gizmo
  private static readonly _bc: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
  private static readonly _co = new THREE.Vector3(); // rotated offset

  /**
   * Draw a wireframe gizmo for a Collider component.
   * Supports box, sphere, and capsule shapes. Trigger colliders draw in orange.
   */
  static drawColliderGizmo(
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    shape: 'box' | 'sphere' | 'capsule' | 'mesh' | 'convex',
    size: THREE.Vector3,
    radius: number,
    height: number,
    offset: THREE.Vector3,
    isTrigger: boolean,
    isSelected: boolean,
  ): void {
    const color = isTrigger
      ? (isSelected ? this._colTrigSel : this._colTrigDim)
      : (isSelected ? this._colSel : this._colDim);

    // World-space centre = pos + rotate(offset)
    this._co.copy(offset).applyQuaternion(quat).add(pos);

    if (shape === 'sphere') {
      DebugDraw.drawLineSphere(this._co, radius, color);

    } else if (shape === 'box') {
      // Build 8 corners in local space then rotate into world space
      const hx = size.x * 0.5, hy = size.y * 0.5, hz = size.z * 0.5;
      const signs = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
      const bc = this._bc;
      for (let i = 0; i < 8; i++) {
        bc[i].set(signs[i][0]*hx, signs[i][1]*hy, signs[i][2]*hz)
             .applyQuaternion(quat)
             .add(this._co);
      }
      // Bottom face
      DebugDraw.drawLineWorld(bc[0], bc[1], color); DebugDraw.drawLineWorld(bc[1], bc[2], color);
      DebugDraw.drawLineWorld(bc[2], bc[3], color); DebugDraw.drawLineWorld(bc[3], bc[0], color);
      // Top face
      DebugDraw.drawLineWorld(bc[4], bc[5], color); DebugDraw.drawLineWorld(bc[5], bc[6], color);
      DebugDraw.drawLineWorld(bc[6], bc[7], color); DebugDraw.drawLineWorld(bc[7], bc[4], color);
      // Vertical edges
      DebugDraw.drawLineWorld(bc[0], bc[4], color); DebugDraw.drawLineWorld(bc[1], bc[5], color);
      DebugDraw.drawLineWorld(bc[2], bc[6], color); DebugDraw.drawLineWorld(bc[3], bc[7], color);

    } else if (shape === 'capsule') {
      // Capsule = cylinder body + two sphere ends along local Y
      const halfBody = Math.max(0, height * 0.5 - radius);
      const localUp = _u.set(0, 1, 0).applyQuaternion(quat);
      const topCenter = _p0.copy(this._co).addScaledVector(localUp,  halfBody);
      const botCenter = _p1.copy(this._co).addScaledVector(localUp, -halfBody);

      DebugDraw.drawLineSphere(topCenter, radius, color);
      DebugDraw.drawLineSphere(botCenter, radius, color);

      // 4 vertical connecting lines (N/S/E/W around the capsule body)
      const localFwd = _r.set(0, 0, 1).applyQuaternion(quat);
      const localRt  = _d.set(1, 0, 0).applyQuaternion(quat);
      const dirs = [localFwd, localRt,
        _t.copy(localFwd).negate(), new THREE.Vector3().copy(localRt).negate()];
      for (const d of dirs) {
        const a = new THREE.Vector3().copy(topCenter).addScaledVector(d, radius);
        const b = new THREE.Vector3().copy(botCenter).addScaledVector(d, radius);
        DebugDraw.drawLineWorld(a, b, color);
      }

    } else {
      // mesh / convex — just draw a small cross at the centre
      DebugDraw.drawCross(this._co, 0.3, color);
    }
  }

  // ── Light Gizmo ───────────────────────────────────────────────────────────

  private static readonly _lightFwd = new THREE.Vector3();
  private static readonly _lightUp  = new THREE.Vector3();
  private static readonly _lightRt  = new THREE.Vector3();
  // Temp vectors for spot cone circle
  private static readonly _sa = new THREE.Vector3();
  private static readonly _sb = new THREE.Vector3();

  /**
   * Draw a light gizmo:
   * - point  → sphere at the range radius
   * - spot   → cone in the -Z direction
   * - directional → 5 parallel arrows
   * - ambient → nothing
   */
  static drawLightGizmo(
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    lightType: 'point' | 'spot' | 'directional' | 'ambient',
    range: number,
    spotAngle: number,
    lightColor: THREE.Color,
    isSelected: boolean,
  ): void {
    const brightness = isSelected ? 1.0 : 0.45;
    const c = _p0.set(lightColor.r * brightness, lightColor.g * brightness, lightColor.b * brightness) as any as THREE.Color;
    // Reuse a Color for drawing — need an actual THREE.Color
    const drawColor = new THREE.Color(lightColor.r * brightness, lightColor.g * brightness, lightColor.b * brightness);

    if (lightType === 'point') {
      DebugDraw.drawLineSphere(pos, range, drawColor);

    } else if (lightType === 'spot') {
      // Direction = local -Z rotated by quat
      this._lightFwd.set(0, 0, -1).applyQuaternion(quat);
      this._lightUp.set(0, 1, 0).applyQuaternion(quat);
      this._lightRt.set(1, 0, 0).applyQuaternion(quat);

      const coneRadius = range * Math.tan(spotAngle * 0.5 * (Math.PI / 180));
      const tipPos = new THREE.Vector3().copy(pos).addScaledVector(this._lightFwd, range);

      // 8 lines from origin to cone rim
      const SEGS = 8;
      const step = (Math.PI * 2) / SEGS;
      let prevRim = new THREE.Vector3();
      for (let i = 0; i <= SEGS; i++) {
        const a = i * step;
        const rim = new THREE.Vector3()
          .copy(tipPos)
          .addScaledVector(this._lightUp, Math.sin(a) * coneRadius)
          .addScaledVector(this._lightRt, Math.cos(a) * coneRadius);
        if (i > 0) DebugDraw.drawLineWorld(prevRim, rim, drawColor);
        if (i % 2 === 0) DebugDraw.drawLineWorld(pos, rim, drawColor);
        prevRim.copy(rim);
      }

    } else if (lightType === 'directional') {
      // 5 parallel arrows (1 centre + 4 offset at radius 0.5)
      this._lightFwd.set(0, 0, -1).applyQuaternion(quat);
      this._lightUp.set(0, 1, 0).applyQuaternion(quat);
      this._lightRt.set(1, 0, 0).applyQuaternion(quat);

      const arrowLen = 1.5;
      const headLen  = 0.25;
      const headRad  = 0.08;
      const offsets: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3().copy(this._lightRt).multiplyScalar( 0.5),
        new THREE.Vector3().copy(this._lightRt).multiplyScalar(-0.5),
        new THREE.Vector3().copy(this._lightUp).multiplyScalar( 0.5),
        new THREE.Vector3().copy(this._lightUp).multiplyScalar(-0.5),
      ];
      for (const off of offsets) {
        const base = new THREE.Vector3().copy(pos).add(off);
        const tip  = new THREE.Vector3().copy(base).addScaledVector(this._lightFwd, arrowLen);
        DebugDraw.drawLineWorld(base, tip, drawColor);
        drawCone(tip, this._lightFwd, headLen, headRad, drawColor);
      }
    }
    // ambient: no gizmo needed
  }

  // ── Audio Source Gizmo ────────────────────────────────────────────────────

  private static readonly _audioInner = new THREE.Color(0.2, 0.9, 0.4);   // green
  private static readonly _audioOuter = new THREE.Color(0.2, 0.5, 0.9);   // blue

  /**
   * Draw two spheres showing the spatial audio min/max distances.
   * Only drawn when `spatial = true`.
   */
  static drawAudioGizmo(
    pos: THREE.Vector3,
    minDistance: number,
    maxDistance: number,
    spatial: boolean,
    isSelected: boolean,
  ): void {
    if (!spatial) return;
    const brightness = isSelected ? 1.0 : 0.4;
    const innerColor = new THREE.Color(
      this._audioInner.r * brightness,
      this._audioInner.g * brightness,
      this._audioInner.b * brightness,
    );
    const outerColor = new THREE.Color(
      this._audioOuter.r * brightness,
      this._audioOuter.g * brightness,
      this._audioOuter.b * brightness,
    );
    DebugDraw.drawLineSphere(pos, minDistance, innerColor);
    DebugDraw.drawLineSphere(pos, maxDistance, outerColor);
  }

  // ── Particle Emitter Gizmo ────────────────────────────────────────────────

  private static readonly _partSel = new THREE.Color(1.0, 0.67, 0.0);  // orange
  private static readonly _partDim = new THREE.Color(0.53, 0.35, 0.0);

  /**
   * Draw a cone showing the particle emission volume (emits along local +Y).
   * The cone angle is derived from the `spread` value.
   */
  static drawParticleGizmo(
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    spread: number,
    isSelected: boolean,
  ): void {
    const color = isSelected ? this._partSel : this._partDim;
    const coneHeight = 1.5;

    // Local +Y is the emission axis (particles go upward with spread on XZ)
    const emitUp  = _u.set(0, 1, 0).applyQuaternion(quat);
    const emitFwd = _r.set(0, 0, 1).applyQuaternion(quat);
    const emitRt  = _d.set(1, 0, 0).applyQuaternion(quat);

    const coneRadius = Math.tan(spread) * coneHeight;
    const tipPos = new THREE.Vector3().copy(pos).addScaledVector(emitUp, coneHeight);

    // 8 lines from origin to cone rim + rim circle
    const SEGS = 8;
    const step = (Math.PI * 2) / SEGS;
    let prevRim = new THREE.Vector3();
    for (let i = 0; i <= SEGS; i++) {
      const a = i * step;
      const rim = new THREE.Vector3()
        .copy(tipPos)
        .addScaledVector(emitFwd, Math.sin(a) * coneRadius)
        .addScaledVector(emitRt,  Math.cos(a) * coneRadius);
      if (i > 0) DebugDraw.drawLineWorld(prevRim, rim, color);
      if (i % 2 === 0) DebugDraw.drawLineWorld(pos, rim, color);
      prevRim.copy(rim);
    }
  }
}
