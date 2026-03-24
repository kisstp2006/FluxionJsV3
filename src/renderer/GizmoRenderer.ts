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
  // Inspired by Stride/ezEngine camera gizmos: shows FOV, near/far planes, view direction

  private static readonly _camColor = new THREE.Color(0.85, 0.65, 0.2);     // warm amber
  private static readonly _camColorDim = new THREE.Color(0.5, 0.4, 0.15);   // dimmer for far edges
  private static readonly _camNearColor = new THREE.Color(0.3, 0.8, 0.4);   // green near plane
  private static readonly _camFarColor = new THREE.Color(0.8, 0.3, 0.3);    // red far plane

  // Reusable vectors for frustum corners
  private static readonly _fc: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
  private static readonly _fwd = new THREE.Vector3();
  private static readonly _up2 = new THREE.Vector3();
  private static readonly _rt = new THREE.Vector3();

  /**
   * Draw a camera frustum gizmo showing FOV, near/far planes and direction.
   * @param pos     Camera world position
   * @param quat    Camera world rotation
   * @param fov     Vertical FOV in degrees (perspective) 
   * @param near    Near clip plane distance
   * @param far     Far clip plane (clamped for visibility)
   * @param aspect  Aspect ratio (width/height)
   * @param isOrtho Whether orthographic
   * @param orthoSize Orthographic half-size
   * @param isSelected Whether the entity is currently selected (brighter)
   */
  static drawCameraFrustum(
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    fov: number,
    near: number,
    far: number,
    aspect: number,
    isOrtho: boolean,
    orthoSize: number,
    isSelected: boolean,
  ): void {
    // Clamp far for visual clarity (don't draw 1000-unit-long frustum)
    const visFar = Math.min(far, 15);

    // Compute local axes
    this._fwd.set(0, 0, -1).applyQuaternion(quat);
    this._up2.set(0, 1, 0).applyQuaternion(quat);
    this._rt.set(1, 0, 0).applyQuaternion(quat);

    const fc = this._fc;

    if (isOrtho) {
      const hw = orthoSize * aspect;
      const hh = orthoSize;
      // Near plane corners (0-3), Far plane corners (4-7)
      for (let i = 0; i < 2; i++) {
        const dist = i === 0 ? near : visFar;
        const base = i * 4;
        const center = _p0.copy(pos).addScaledVector(this._fwd, dist);
        fc[base + 0].copy(center).addScaledVector(this._rt, -hw).addScaledVector(this._up2, hh);
        fc[base + 1].copy(center).addScaledVector(this._rt, hw).addScaledVector(this._up2, hh);
        fc[base + 2].copy(center).addScaledVector(this._rt, hw).addScaledVector(this._up2, -hh);
        fc[base + 3].copy(center).addScaledVector(this._rt, -hw).addScaledVector(this._up2, -hh);
      }
    } else {
      const fovRad = THREE.MathUtils.degToRad(fov);
      const nearH = Math.tan(fovRad * 0.5) * near;
      const nearW = nearH * aspect;
      const farH = Math.tan(fovRad * 0.5) * visFar;
      const farW = farH * aspect;

      // Near plane corners
      const nc = _p0.copy(pos).addScaledVector(this._fwd, near);
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

    // Near plane (green when selected)
    DebugDraw.drawLineWorld(fc[0], fc[1], nearC);
    DebugDraw.drawLineWorld(fc[1], fc[2], nearC);
    DebugDraw.drawLineWorld(fc[2], fc[3], nearC);
    DebugDraw.drawLineWorld(fc[3], fc[0], nearC);

    // Far plane (red when selected)
    DebugDraw.drawLineWorld(fc[4], fc[5], farC);
    DebugDraw.drawLineWorld(fc[5], fc[6], farC);
    DebugDraw.drawLineWorld(fc[6], fc[7], farC);
    DebugDraw.drawLineWorld(fc[7], fc[4], farC);

    // Side edges (connecting near → far)
    DebugDraw.drawLineWorld(fc[0], fc[4], lineColor);
    DebugDraw.drawLineWorld(fc[1], fc[5], lineColor);
    DebugDraw.drawLineWorld(fc[2], fc[6], lineColor);
    DebugDraw.drawLineWorld(fc[3], fc[7], lineColor);

    // Direction arrow from camera position
    const arrowLen = visFar * 0.3;
    const arrowTip = _o.copy(pos).addScaledVector(this._fwd, arrowLen);
    DebugDraw.drawLineWorld(pos, arrowTip, lineColor);

    // Up indicator (small line showing camera up)
    const upLen = visFar * 0.12;
    const upMid = _t.copy(fc[0]).add(fc[1]).multiplyScalar(0.5); // top edge midpoint of near plane
    const upEnd = _p0.copy(upMid).addScaledVector(this._up2, upLen);
    DebugDraw.drawLineWorld(upMid, upEnd, lineColor);
    // Small triangle at top of up indicator
    const triW = upLen * 0.3;
    const triLeft = _p1.copy(upEnd).addScaledVector(this._rt, -triW).addScaledVector(this._up2, -triW);
    DebugDraw.drawLineWorld(upEnd, triLeft, lineColor);
    const triRight = _p0.copy(upEnd).addScaledVector(this._rt, triW).addScaledVector(this._up2, -triW);
    DebugDraw.drawLineWorld(upEnd, triRight, lineColor);
    DebugDraw.drawLineWorld(triLeft, triRight, lineColor);
  }
}
