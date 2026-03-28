// ============================================================
// FluxionJS V3 — Shared Transform Buffer
// Zero-copy transform exchange between main thread and workers
// via SharedArrayBuffer + Float32Array.
//
// Layout per entity slot (10 × float32 = 40 bytes):
//   [px, py, pz, qx, qy, qz, qw, sx, sy, sz]
//
// Requires COOP/COEP headers for SharedArrayBuffer availability.
// Engine.init() feature-detects this and falls back gracefully.
// ============================================================

import * as THREE from 'three';
import type { TransformComponent } from './Components';

export class SharedTransformBuffer {
  static readonly FLOATS_PER_SLOT = 10;

  readonly buffer: SharedArrayBuffer;
  readonly view:   Float32Array;
  readonly maxSlots: number;

  constructor(maxSlots: number) {
    this.maxSlots = maxSlots;
    this.buffer   = new SharedArrayBuffer(maxSlots * SharedTransformBuffer.FLOATS_PER_SLOT * 4);
    this.view     = new Float32Array(this.buffer);
  }

  /** Write world transform from a TransformComponent into slot `slot`. */
  write(slot: number, t: TransformComponent): void {
    const base = slot * SharedTransformBuffer.FLOATS_PER_SLOT;
    const p = t.worldPosition;
    const q = t.worldRotation;
    const s = t.scale;
    this.view[base]     = p.x;
    this.view[base + 1] = p.y;
    this.view[base + 2] = p.z;
    this.view[base + 3] = q.x;
    this.view[base + 4] = q.y;
    this.view[base + 5] = q.z;
    this.view[base + 6] = q.w;
    this.view[base + 7] = s.x;
    this.view[base + 8] = s.y;
    this.view[base + 9] = s.z;
  }

  /** Read world position from slot into `out`. */
  readPosition(slot: number, out: THREE.Vector3): void {
    const base = slot * SharedTransformBuffer.FLOATS_PER_SLOT;
    out.set(this.view[base], this.view[base + 1], this.view[base + 2]);
  }

  /** Read world rotation from slot into `out`. */
  readQuaternion(slot: number, out: THREE.Quaternion): void {
    const base = slot * SharedTransformBuffer.FLOATS_PER_SLOT;
    out.set(
      this.view[base + 3], this.view[base + 4],
      this.view[base + 5], this.view[base + 6],
    );
  }

  /** Read scale from slot into `out`. */
  readScale(slot: number, out: THREE.Vector3): void {
    const base = slot * SharedTransformBuffer.FLOATS_PER_SLOT;
    out.set(this.view[base + 7], this.view[base + 8], this.view[base + 9]);
  }

  /** Returns true if SharedArrayBuffer is available in the current context. */
  static isSupported(): boolean {
    try {
      return typeof SharedArrayBuffer !== 'undefined' &&
        new SharedArrayBuffer(4).byteLength === 4;
    } catch {
      return false;
    }
  }
}
