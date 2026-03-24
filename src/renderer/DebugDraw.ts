// ============================================================
// FluxionJS V2 — Debug Drawing Service
// Engine-level immediate-mode debug line renderer
// Inspired by ezEngine's ezDebugRenderer static API
// ============================================================

import * as THREE from 'three';

export interface DebugLine {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color?: THREE.Color;
  startColor?: THREE.Color;
  endColor?: THREE.Color;
}

const INITIAL_CAPACITY = 1024; // max lines before realloc

/**
 * Static debug drawing service (ezEngine pattern).
 * Accumulates line segments per frame, flushed to a single THREE.LineSegments
 * in the gizmo overlay scene (no bloom / tone-mapping).
 *
 * Usage:
 *   DebugDraw.drawLine(a, b, color);
 *   // ... renderer calls DebugDraw.flush() at end of frame
 */
export class DebugDraw {
  private static scene: THREE.Scene | null = null;
  private static mesh: THREE.LineSegments | null = null;
  private static geometry: THREE.BufferGeometry | null = null;
  private static material: THREE.LineBasicMaterial | null = null;

  // Flat buffers: 6 floats per line (2 vertices × 3 components)
  private static positions: Float32Array = new Float32Array(INITIAL_CAPACITY * 6);
  private static colors: Float32Array = new Float32Array(INITIAL_CAPACITY * 6);
  private static lineCount = 0;
  private static capacity = INITIAL_CAPACITY;

  /** Initialize with the overlay scene (called once by FluxionRenderer). */
  static init(gizmoScene: THREE.Scene): void {
    this.scene = gizmoScene;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });

    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    gizmoScene.add(this.mesh);
  }

  // ── Core API (ezEngine ezDebugRenderer pattern) ──

  /** Draw a single colored line for this frame. */
  static drawLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: THREE.Color = _white,
  ): void {
    this.drawLineColored(start, end, color, color);
  }

  /** Draw a single line with per-vertex colors. */
  static drawLineColored(
    start: THREE.Vector3,
    end: THREE.Vector3,
    startColor: THREE.Color,
    endColor: THREE.Color,
  ): void {
    if (this.lineCount >= this.capacity) {
      this.grow();
    }
    const i = this.lineCount * 6;
    this.positions[i]     = start.x;
    this.positions[i + 1] = start.y;
    this.positions[i + 2] = start.z;
    this.positions[i + 3] = end.x;
    this.positions[i + 4] = end.y;
    this.positions[i + 5] = end.z;

    this.colors[i]     = startColor.r;
    this.colors[i + 1] = startColor.g;
    this.colors[i + 2] = startColor.b;
    this.colors[i + 3] = endColor.r;
    this.colors[i + 4] = endColor.g;
    this.colors[i + 5] = endColor.b;

    this.lineCount++;
  }

  /** Draw a batch of lines. */
  static drawLines(lines: DebugLine[]): void {
    for (const line of lines) {
      const sc = line.startColor ?? line.color ?? _white;
      const ec = line.endColor ?? line.color ?? _white;
      this.drawLineColored(line.start, line.end, sc, ec);
    }
  }

  /** Draw a cross (3 short axis-aligned lines) at a position. */
  static drawCross(position: THREE.Vector3, size: number, color: THREE.Color = _white): void {
    const h = size * 0.5;
    this.drawLine(_v0.set(position.x - h, position.y, position.z), _v1.set(position.x + h, position.y, position.z), color);
    this.drawLine(_v0.set(position.x, position.y - h, position.z), _v1.set(position.x, position.y + h, position.z), color);
    this.drawLine(_v0.set(position.x, position.y, position.z - h), _v1.set(position.x, position.y, position.z + h), color);
  }

  /** Draw a wireframe box. */
  static drawLineBox(min: THREE.Vector3, max: THREE.Vector3, color: THREE.Color = _white): void {
    // Bottom face
    this.drawLine(_v0.set(min.x, min.y, min.z), _v1.set(max.x, min.y, min.z), color);
    this.drawLine(_v0.set(max.x, min.y, min.z), _v1.set(max.x, min.y, max.z), color);
    this.drawLine(_v0.set(max.x, min.y, max.z), _v1.set(min.x, min.y, max.z), color);
    this.drawLine(_v0.set(min.x, min.y, max.z), _v1.set(min.x, min.y, min.z), color);
    // Top face
    this.drawLine(_v0.set(min.x, max.y, min.z), _v1.set(max.x, max.y, min.z), color);
    this.drawLine(_v0.set(max.x, max.y, min.z), _v1.set(max.x, max.y, max.z), color);
    this.drawLine(_v0.set(max.x, max.y, max.z), _v1.set(min.x, max.y, max.z), color);
    this.drawLine(_v0.set(min.x, max.y, max.z), _v1.set(min.x, max.y, min.z), color);
    // Verticals
    this.drawLine(_v0.set(min.x, min.y, min.z), _v1.set(min.x, max.y, min.z), color);
    this.drawLine(_v0.set(max.x, min.y, min.z), _v1.set(max.x, max.y, min.z), color);
    this.drawLine(_v0.set(max.x, min.y, max.z), _v1.set(max.x, max.y, max.z), color);
    this.drawLine(_v0.set(min.x, min.y, max.z), _v1.set(min.x, max.y, max.z), color);
  }

  /** Draw a wireframe sphere approximation. */
  static drawLineSphere(center: THREE.Vector3, radius: number, color: THREE.Color = _white, segments = 32): void {
    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      const a0 = i * step;
      const a1 = (i + 1) * step;
      // XY circle
      this.drawLine(
        _v0.set(center.x + Math.cos(a0) * radius, center.y + Math.sin(a0) * radius, center.z),
        _v1.set(center.x + Math.cos(a1) * radius, center.y + Math.sin(a1) * radius, center.z),
        color,
      );
      // XZ circle
      this.drawLine(
        _v0.set(center.x + Math.cos(a0) * radius, center.y, center.z + Math.sin(a0) * radius),
        _v1.set(center.x + Math.cos(a1) * radius, center.y, center.z + Math.sin(a1) * radius),
        color,
      );
      // YZ circle
      this.drawLine(
        _v0.set(center.x, center.y + Math.cos(a0) * radius, center.z + Math.sin(a0) * radius),
        _v1.set(center.x, center.y + Math.cos(a1) * radius, center.z + Math.sin(a1) * radius),
        color,
      );
    }
  }

  // ── Grid (replaces THREE.GridHelper) ──

  /** Draw an XZ grid centered at origin with axis-colored center lines. */
  static drawGrid(
    size = 100,
    divisions = 100,
    lineColor: THREE.Color = _gridLine,
    centerColor: THREE.Color = _gridCenter,
  ): void {
    const half = size / 2;
    const step = size / divisions;

    for (let i = 0; i <= divisions; i++) {
      const pos = -half + i * step;
      const isCenter = Math.abs(pos) < step * 0.01;

      if (isCenter) {
        // Center X axis line (red on positive side, darker on negative)
        this.drawLineColored(
          _v0.set(-half, 0, 0), _v1.set(0, 0, 0),
          centerColor, centerColor,
        );
        this.drawLineColored(
          _v0.set(0, 0, 0), _v1.set(half, 0, 0),
          _axisRed, _axisRed,
        );
        // Center Z axis line (blue on positive side, darker on negative)
        this.drawLineColored(
          _v0.set(0, 0, -half), _v1.set(0, 0, 0),
          centerColor, centerColor,
        );
        this.drawLineColored(
          _v0.set(0, 0, 0), _v1.set(0, 0, half),
          _axisBlue, _axisBlue,
        );
      } else {
        // Regular grid lines along X (varying Z)
        this.drawLine(_v0.set(-half, 0, pos), _v1.set(half, 0, pos), lineColor);
        // Regular grid lines along Z (varying X)
        this.drawLine(_v0.set(pos, 0, -half), _v1.set(pos, 0, half), lineColor);
      }
    }

    // Y axis stub (green, short upward line from origin)
    this.drawLine(_v0.set(0, 0, 0), _v1.set(0, 3, 0), _axisGreen);
  }

  // ── Lifecycle ──

  /** Commit accumulated lines to the GPU and clear the buffer. Called by renderer each frame. */
  static flush(): void {
    if (!this.geometry || !this.mesh) return;

    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;

    // Update buffer data (may need to resize the attribute)
    if (posAttr.array.length < this.lineCount * 6) {
      this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
      this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    } else {
      (posAttr.array as Float32Array).set(this.positions.subarray(0, this.lineCount * 6));
      posAttr.needsUpdate = true;
      (colAttr.array as Float32Array).set(this.colors.subarray(0, this.lineCount * 6));
      colAttr.needsUpdate = true;
    }

    this.geometry.setDrawRange(0, this.lineCount * 2);
    this.mesh.visible = this.lineCount > 0;

    // Reset for next frame
    this.lineCount = 0;
  }

  /** Dispose all GPU resources. */
  static dispose(): void {
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
    }
    this.geometry?.dispose();
    this.material?.dispose();
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.scene = null;
  }

  // ── Internal ──

  private static grow(): void {
    this.capacity *= 2;
    const newPos = new Float32Array(this.capacity * 6);
    const newCol = new Float32Array(this.capacity * 6);
    newPos.set(this.positions);
    newCol.set(this.colors);
    this.positions = newPos;
    this.colors = newCol;
  }
}

// Shared temp vectors to avoid allocations in hot path
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _white = new THREE.Color(1, 1, 1);
const _gridLine = new THREE.Color(0x30363d);
const _gridCenter = new THREE.Color(0x1c2333);
const _axisRed = new THREE.Color(0.85, 0.2, 0.15);
const _axisGreen = new THREE.Color(0.2, 0.75, 0.2);
const _axisBlue = new THREE.Color(0.2, 0.4, 0.9);
