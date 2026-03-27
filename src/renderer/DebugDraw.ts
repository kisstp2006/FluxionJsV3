// ============================================================
// FluxionJS V2 — Debug Drawing Service
// Engine-level immediate-mode debug line renderer
// Inspired by ezEngine's ezDebugRenderer static API
// ============================================================

import * as THREE from 'three';
import { DebugConsole } from '../core/DebugConsole';

export interface DebugLine {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color?: THREE.Color;
  startColor?: THREE.Color;
  endColor?: THREE.Color;
}

const INITIAL_CAPACITY = 4096; // max lines before realloc

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
  private static sceneW: THREE.Scene | null = null;

  // Overlay layer (depthTest: false) — gizmos, always on top
  private static mesh: THREE.LineSegments | null = null;
  private static geometry: THREE.BufferGeometry | null = null;
  private static material: THREE.LineBasicMaterial | null = null;
  private static positions: Float32Array = new Float32Array(INITIAL_CAPACITY * 6);
  private static colors: Float32Array = new Float32Array(INITIAL_CAPACITY * 6);
  private static lineCount = 0;
  private static capacity = INITIAL_CAPACITY;

  // World layer (depthTest: true) — grid, scene-space helpers
  private static meshW: THREE.LineSegments | null = null;
  private static geometryW: THREE.BufferGeometry | null = null;
  private static materialW: THREE.LineBasicMaterial | null = null;
  private static positionsW: Float32Array = new Float32Array(INITIAL_CAPACITY * 6);
  private static colorsW: Float32Array = new Float32Array(INITIAL_CAPACITY * 6);
  private static lineCountW = 0;
  private static capacityW = INITIAL_CAPACITY;

  /** Initialize with both scenes (called once by FluxionRenderer). */
  static init(overlayScene: THREE.Scene, mainScene: THREE.Scene): void {
    this.scene = overlayScene;
    this.sceneW = mainScene;

    // Overlay (no depth test)
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
    overlayScene.add(this.mesh);

    // World (depth tested — lives in main scene for correct depth)
    this.geometryW = new THREE.BufferGeometry();
    this.geometryW.setAttribute('position', new THREE.BufferAttribute(this.positionsW, 3));
    this.geometryW.setAttribute('color', new THREE.BufferAttribute(this.colorsW, 3));

    this.materialW = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });

    this.meshW = new THREE.LineSegments(this.geometryW, this.materialW);
    this.meshW.frustumCulled = false;
    this.meshW.renderOrder = 0;
    mainScene.add(this.meshW);
  }

  // ── Core API (ezEngine ezDebugRenderer pattern) ──

  /** Draw a single colored line for this frame. */
  static drawLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: THREE.Color = _white,
  ): void {
    if (!this.scene) return;
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

  // ── World-layer API (depth tested) ──

  /** Draw a depth-tested line (occluded by scene geometry). */
  static drawLineWorld(
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: THREE.Color = _white,
  ): void {
    if (!this.sceneW) return;
    this.drawLineColoredWorld(start, end, color, color);
  }

  /** Draw a depth-tested line with per-vertex colors. */
  static drawLineColoredWorld(
    start: THREE.Vector3,
    end: THREE.Vector3,
    startColor: THREE.Color,
    endColor: THREE.Color,
  ): void {
    if (this.lineCountW >= this.capacityW) {
      this.growW();
    }
    const i = this.lineCountW * 6;
    this.positionsW[i]     = start.x;
    this.positionsW[i + 1] = start.y;
    this.positionsW[i + 2] = start.z;
    this.positionsW[i + 3] = end.x;
    this.positionsW[i + 4] = end.y;
    this.positionsW[i + 5] = end.z;

    this.colorsW[i]     = startColor.r;
    this.colorsW[i + 1] = startColor.g;
    this.colorsW[i + 2] = startColor.b;
    this.colorsW[i + 3] = endColor.r;
    this.colorsW[i + 4] = endColor.g;
    this.colorsW[i + 5] = endColor.b;

    this.lineCountW++;
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

  /** Draw an XZ grid centered at origin with axis-colored center lines (depth tested). */
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
        this.drawLineColoredWorld(
          _v0.set(-half, 0, 0), _v1.set(0, 0, 0),
          centerColor, centerColor,
        );
        this.drawLineColoredWorld(
          _v0.set(0, 0, 0), _v1.set(half, 0, 0),
          _axisRed, _axisRed,
        );
        // Center Z axis line (blue on positive side, darker on negative)
        this.drawLineColoredWorld(
          _v0.set(0, 0, -half), _v1.set(0, 0, 0),
          centerColor, centerColor,
        );
        this.drawLineColoredWorld(
          _v0.set(0, 0, 0), _v1.set(0, 0, half),
          _axisBlue, _axisBlue,
        );
      } else {
        // Regular grid lines along X (varying Z)
        this.drawLineWorld(_v0.set(-half, 0, pos), _v1.set(half, 0, pos), lineColor);
        // Regular grid lines along Z (varying X)
        this.drawLineWorld(_v0.set(pos, 0, -half), _v1.set(pos, 0, half), lineColor);
      }
    }

    // Y axis stub (green, short upward line from origin)
    this.drawLineWorld(_v0.set(0, 0, 0), _v1.set(0, 3, 0), _axisGreen);
  }

  // ── Lifecycle ──

  /** Commit accumulated lines to the GPU and clear the buffer. Called by renderer each frame. */
  static flush(): void {
    // Overlay layer
    this.flushLayer(this.geometry, this.mesh, this.positions, this.colors, this.lineCount);
    this.lineCount = 0;

    // World layer
    this.flushLayer(this.geometryW, this.meshW, this.positionsW, this.colorsW, this.lineCountW);
    this.lineCountW = 0;
  }

  private static flushLayer(
    geom: THREE.BufferGeometry | null,
    mesh: THREE.LineSegments | null,
    positions: Float32Array,
    colors: Float32Array,
    count: number,
  ): void {
    if (!geom || !mesh) return;

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;

    if (posAttr.array.length < count * 6) {
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    } else {
      (posAttr.array as Float32Array).set(positions.subarray(0, count * 6));
      posAttr.needsUpdate = true;
      (colAttr.array as Float32Array).set(colors.subarray(0, count * 6));
      colAttr.needsUpdate = true;
    }

    geom.setDrawRange(0, count * 2);
    mesh.visible = count > 0;
  }

  /** Dispose all GPU resources. */
  static dispose(): void {
    if (this.mesh && this.scene) this.scene.remove(this.mesh);
    if (this.meshW && this.sceneW) this.sceneW.remove(this.meshW);
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometryW?.dispose();
    this.materialW?.dispose();
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.meshW = null;
    this.geometryW = null;
    this.materialW = null;
    this.scene = null;
    this.sceneW = null;
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

  private static growW(): void {
    this.capacityW *= 2;
    const newPos = new Float32Array(this.capacityW * 6);
    const newCol = new Float32Array(this.capacityW * 6);
    newPos.set(this.positionsW);
    newCol.set(this.colorsW);
    this.positionsW = newPos;
    this.colorsW = newCol;
  }

  // ── Console logging (delegates to DebugConsole) ──

  /**
   * Log an informational message to the editor console.
   * @example Debug.Log('Player spawned at', position);
   */
  static Log(...args: any[]): void { DebugConsole.Log(...args); }

  /**
   * Log a warning message to the editor console.
   * @example Debug.LogWarning('Texture missing, using fallback');
   */
  static LogWarning(...args: any[]): void { DebugConsole.LogWarning(...args); }

  /**
   * Log an error message to the editor console.
   * @example Debug.LogError('Failed to load asset: ' + path);
   */
  static LogError(...args: any[]): void { DebugConsole.LogError(...args); }
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
