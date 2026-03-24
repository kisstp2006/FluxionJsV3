// ============================================================
// FluxionJS V2 — Gizmo Interaction Service
// Replaces THREE.TransformControls with custom DebugDraw gizmo
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GizmoRenderer, GizmoAxis, GizmoMode } from '../../src/renderer/GizmoRenderer';

export { GizmoAxis, GizmoMode } from '../../src/renderer/GizmoRenderer';

export class GizmoService {
  // ── Public state (read by consumers) ──
  mode: GizmoMode = 'translate';
  space: 'local' | 'world' = 'local';
  object: THREE.Object3D | null = null;
  isDragging = false;
  activeAxis: GizmoAxis = null;
  hoveredAxis: GizmoAxis = null;

  // ── Snap ──
  private _translationSnap: number | null = null;
  private _rotationSnap: number | null = null;
  private _scaleSnap: number | null = null;

  // ── References ──
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private orbitControls: OrbitControls;

  // ── Events ──
  private listeners = new Map<string, Set<Function>>();

  // ── Drag state (persistent across a single drag operation) ──
  private dragAxisDir = new THREE.Vector3();
  private dragPlaneNormal = new THREE.Vector3();
  private dragPlanePoint = new THREE.Vector3();
  private dragInitialIntersection = new THREE.Vector3();
  private dragInitialPos = new THREE.Vector3();
  private dragInitialQuat = new THREE.Quaternion();
  private dragInitialScale = new THREE.Vector3();

  // ── Bound event handlers ──
  private _onPointerDown: (e: PointerEvent) => void;
  private _onPointerMove: (e: PointerEvent) => void;
  private _onPointerUp: (e: PointerEvent) => void;

  // ── Temp vectors (never stored across calls) ──
  private _ray = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();
  private _wpos = new THREE.Vector3();
  private _wquat = new THREE.Quaternion();
  private _tv0 = new THREE.Vector3();
  private _tv1 = new THREE.Vector3();
  private _tv2 = new THREE.Vector3();
  private _tv3 = new THREE.Vector3();
  private _tq = new THREE.Quaternion();

  constructor(
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    orbitControls: OrbitControls,
  ) {
    this.camera = camera;
    this.canvas = canvas;
    this.orbitControls = orbitControls;

    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
  }

  // ══════════════════════════════════════════════════════════
  // Public API (mirrors TransformControls for easy migration)
  // ══════════════════════════════════════════════════════════

  attach(obj: THREE.Object3D): void {
    this.object = obj;
  }

  detach(): void {
    this.object = null;
    this.activeAxis = null;
    this.hoveredAxis = null;
    if (this.isDragging) {
      this.isDragging = false;
      this.orbitControls.enabled = true;
    }
  }

  setMode(mode: string): void {
    this.mode = mode as GizmoMode;
  }

  getMode(): string {
    return this.mode;
  }

  setSpace(space: string): void {
    this.space = space as 'local' | 'world';
  }

  setTranslationSnap(v: number | null): void { this._translationSnap = v; }
  setRotationSnap(v: number | null): void { this._rotationSnap = v; }
  setScaleSnap(v: number | null): void { this._scaleSnap = v; }

  // ══════════════════════════════════════════════════════════
  // Rendering — call once per frame (before DebugDraw.flush)
  // ══════════════════════════════════════════════════════════

  render(): void {
    if (!this.object) return;

    const pos = this.object.getWorldPosition(this._wpos);
    const quat = this.object.getWorldQuaternion(this._wquat);

    switch (this.mode) {
      case 'translate':
        GizmoRenderer.drawTranslateGizmo(pos, quat, this.space, this.camera, this.activeAxis, this.hoveredAxis);
        break;
      case 'rotate':
        GizmoRenderer.drawRotateGizmo(pos, quat, this.space, this.camera, this.activeAxis, this.hoveredAxis);
        break;
      case 'scale':
        GizmoRenderer.drawScaleGizmo(pos, quat, this.space, this.camera, this.activeAxis, this.hoveredAxis);
        break;
    }
  }

  // ══════════════════════════════════════════════════════════
  // Event System
  // ══════════════════════════════════════════════════════════

  addEventListener(type: string, fn: Function): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: Function): void {
    this.listeners.get(type)?.delete(fn);
  }

  private emit(type: string, event: any = {}): void {
    const set = this.listeners.get(type);
    if (set) for (const fn of set) fn(event);
  }

  // ══════════════════════════════════════════════════════════
  // Pointer Event Handlers
  // ══════════════════════════════════════════════════════════

  private getMouseNDC(e: PointerEvent): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    this._mouse.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    return this._mouse;
  }

  private getRay(e: PointerEvent): THREE.Raycaster {
    this.getMouseNDC(e);
    this._ray.setFromCamera(this._mouse, this.camera);
    return this._ray;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.object) return;

    const ray = this.getRay(e);
    const hit = this.hitTest(ray);

    if (hit) {
      this.activeAxis = hit;
      this.isDragging = true;

      // Capture initial state
      this.object.getWorldPosition(this.dragPlanePoint);
      this.dragInitialPos.copy(this.object.position);
      this.dragInitialQuat.copy(this.object.quaternion);
      this.dragInitialScale.copy(this.object.scale);

      // Setup drag plane and initial intersection
      this.setupDragPlane(ray, hit);

      this.orbitControls.enabled = false;
      this.emit('mouseDown');
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.object) {
      this.hoveredAxis = null;
      return;
    }

    const ray = this.getRay(e);

    if (this.isDragging && this.activeAxis) {
      this.performDrag(ray);
    } else {
      this.hoveredAxis = this.hitTest(ray);
    }
  }

  private onPointerUp(_e: PointerEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.activeAxis = null;
      this.orbitControls.enabled = true;
      this.emit('mouseUp');
    }
  }

  // ══════════════════════════════════════════════════════════
  // Hit Testing
  // ══════════════════════════════════════════════════════════

  private hitTest(ray: THREE.Raycaster): GizmoAxis {
    if (!this.object) return null;

    const pos = this.object.getWorldPosition(this._wpos);
    const quat = this.object.getWorldQuaternion(this._wquat);
    const scale = GizmoRenderer.getScale(pos, this.camera);

    if (this.mode === 'rotate') {
      return this.hitTestCircles(ray, pos, quat, scale);
    }
    return this.hitTestAxes(ray, pos, quat, scale);
  }

  private hitTestAxes(
    ray: THREE.Raycaster, pos: THREE.Vector3,
    quat: THREE.Quaternion, gizmoScale: number,
  ): GizmoAxis {
    const threshold = gizmoScale * 0.08;
    const axisLength = gizmoScale * 1.15;

    let bestAxis: GizmoAxis = null;
    let bestDist = threshold;

    for (const ax of ['x', 'y', 'z'] as const) {
      this.getWorldAxisDir(ax, quat, this._tv0);
      const dist = this.rayToLineDistance(ray, pos, this._tv0, axisLength);
      if (dist < bestDist) {
        bestDist = dist;
        bestAxis = ax;
      }
    }

    return bestAxis;
  }

  private hitTestCircles(
    ray: THREE.Raycaster, pos: THREE.Vector3,
    quat: THREE.Quaternion, gizmoScale: number,
  ): GizmoAxis {
    const radius = gizmoScale;
    const tolerance = gizmoScale * 0.1;

    let bestAxis: GizmoAxis = null;
    let bestAngleCost = Infinity;

    for (const ax of ['x', 'y', 'z'] as const) {
      this.getWorldAxisDir(ax, quat, this._tv0);

      const denom = ray.ray.direction.dot(this._tv0);
      if (Math.abs(denom) < 1e-6) continue;

      const t = this._tv1.copy(pos).sub(ray.ray.origin).dot(this._tv0) / denom;
      if (t < 0) continue;

      const hitPoint = this._tv1.copy(ray.ray.origin).addScaledVector(ray.ray.direction, t);
      const distFromCenter = hitPoint.distanceTo(pos);

      if (Math.abs(distFromCenter - radius) < tolerance) {
        const angleCost = 1 - Math.abs(denom);
        if (angleCost < bestAngleCost) {
          bestAngleCost = angleCost;
          bestAxis = ax;
        }
      }
    }

    return bestAxis;
  }

  /** Closest distance from ray to a line segment (origin + dir * [0..length]). */
  private rayToLineDistance(
    ray: THREE.Raycaster, lineOrigin: THREE.Vector3,
    lineDir: THREE.Vector3, lineLength: number,
  ): number {
    const rayDir = ray.ray.direction;
    const w = this._tv1.copy(ray.ray.origin).sub(lineOrigin);

    const a = rayDir.dot(rayDir);
    const b = rayDir.dot(lineDir);
    const c = lineDir.dot(lineDir);
    const d = rayDir.dot(w);
    const e = lineDir.dot(w);

    const denom = a * c - b * b;
    if (Math.abs(denom) < 1e-10) return Infinity;

    let t = (b * e - c * d) / denom;
    let s = (a * e - b * d) / denom;

    s = Math.max(0, Math.min(s, lineLength));
    t = Math.max(0, t);

    const p1 = this._tv1.copy(ray.ray.origin).addScaledVector(rayDir, t);
    const p2 = this._tv2.copy(lineOrigin).addScaledVector(lineDir, s);

    return p1.distanceTo(p2);
  }

  // ══════════════════════════════════════════════════════════
  // Drag Manipulation
  // ══════════════════════════════════════════════════════════

  private setupDragPlane(ray: THREE.Raycaster, axis: 'x' | 'y' | 'z'): void {
    const quat = this.object!.getWorldQuaternion(this._tq);
    this.getWorldAxisDir(axis, quat, this._tv0);
    this.dragAxisDir.copy(this._tv0);

    if (this.mode === 'rotate') {
      // Rotation plane: perpendicular to the rotation axis
      this.dragPlaneNormal.copy(this.dragAxisDir);
    } else {
      // Translate/Scale plane: contains the axis, most perpendicular to view
      const viewDir = this._tv1.copy(this.camera.position).sub(this.dragPlanePoint).normalize();
      this.dragPlaneNormal.crossVectors(this.dragAxisDir, viewDir).cross(this.dragAxisDir).normalize();
    }

    // Compute initial ray-plane intersection
    const denom = ray.ray.direction.dot(this.dragPlaneNormal);
    if (Math.abs(denom) > 1e-6) {
      const t = this._tv0.copy(this.dragPlanePoint).sub(ray.ray.origin).dot(this.dragPlaneNormal) / denom;
      this.dragInitialIntersection.copy(ray.ray.origin).addScaledVector(ray.ray.direction, t);
    }
  }

  private performDrag(ray: THREE.Raycaster): void {
    if (!this.object || !this.activeAxis) return;

    const denom = ray.ray.direction.dot(this.dragPlaneNormal);
    if (Math.abs(denom) < 1e-6) return;

    const t = this._tv0.copy(this.dragPlanePoint).sub(ray.ray.origin).dot(this.dragPlaneNormal) / denom;
    const currentIntersection = this._tv0.copy(ray.ray.origin).addScaledVector(ray.ray.direction, t);

    switch (this.mode) {
      case 'translate': this.performTranslate(currentIntersection); break;
      case 'rotate':    this.performRotate(currentIntersection);    break;
      case 'scale':     this.performScale(currentIntersection);     break;
    }

    this.emit('objectChange');
  }

  private performTranslate(currentIntersection: THREE.Vector3): void {
    const delta = this._tv1.copy(currentIntersection).sub(this.dragInitialIntersection);
    let along = delta.dot(this.dragAxisDir);

    if (this._translationSnap != null) {
      along = Math.round(along / this._translationSnap) * this._translationSnap;
    }

    const worldDelta = this._tv1.copy(this.dragAxisDir).multiplyScalar(along);
    this.object!.position.copy(this.dragInitialPos).add(worldDelta);
  }

  private performRotate(currentIntersection: THREE.Vector3): void {
    const center = this.dragPlanePoint;
    const initial = this._tv1.copy(this.dragInitialIntersection).sub(center).normalize();
    const current = this._tv2.copy(currentIntersection).sub(center).normalize();

    const crossDot = this._tv3.crossVectors(initial, current).dot(this.dragAxisDir);
    const dotDot = initial.dot(current);
    let angle = Math.atan2(crossDot, dotDot);

    if (this._rotationSnap != null) {
      angle = Math.round(angle / this._rotationSnap) * this._rotationSnap;
    }

    this._tq.setFromAxisAngle(this.dragAxisDir, angle);
    this.object!.quaternion.copy(this._tq).multiply(this.dragInitialQuat);
  }

  private performScale(currentIntersection: THREE.Vector3): void {
    const d0 = this._tv1.copy(this.dragInitialIntersection).sub(this.dragPlanePoint).dot(this.dragAxisDir);
    const d1 = this._tv2.copy(currentIntersection).sub(this.dragPlanePoint).dot(this.dragAxisDir);

    let factor = Math.abs(d0) > 1e-6 ? d1 / d0 : 1;
    factor = Math.max(0.01, factor);

    if (this._scaleSnap != null) {
      factor = Math.round(factor / this._scaleSnap) * this._scaleSnap;
      factor = Math.max(this._scaleSnap, factor);
    }

    this.object!.scale.copy(this.dragInitialScale);
    switch (this.activeAxis) {
      case 'x': this.object!.scale.x *= factor; break;
      case 'y': this.object!.scale.y *= factor; break;
      case 'z': this.object!.scale.z *= factor; break;
    }
  }

  // ══════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════

  private getWorldAxisDir(axis: 'x' | 'y' | 'z', quat: THREE.Quaternion, out: THREE.Vector3): THREE.Vector3 {
    out.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    if (this.space === 'local') out.applyQuaternion(quat);
    return out;
  }

  // ══════════════════════════════════════════════════════════
  // Cleanup
  // ══════════════════════════════════════════════════════════

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.listeners.clear();
  }
}
