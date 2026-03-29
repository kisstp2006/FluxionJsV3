// ============================================================
// FluxionJS V3 — FUI Engine Renderer
// Renders screen-space FUI via a THREE.js OrthographicCamera
// overlay pass instead of HTML DOM canvas elements.
// World-space FUI (CanvasTexture on PlaneGeometry) stays in
// FuiRuntimeSystem unchanged.
// ============================================================

import * as THREE from 'three';
import type { EntityId } from '../core/ECS';
import type { FuiCompiled, FuiNodeRenderState } from './FuiRenderer';
import { renderCompiledFuiToCanvas } from './FuiRenderer';

// ── Tooltip state passed in from FuiRuntimeSystem ─────────────

export interface FuiTooltipState {
  text: string;
  /** X in FUI canvas CSS-pixel space (relative to the FUI entity's top-left). */
  x: number;
  /** Y in FUI canvas CSS-pixel space. */
  y: number;
}

// ── Per-entity screen quad entry ──────────────────────────────

interface ScreenQuadEntry {
  offscreenCanvas: HTMLCanvasElement;
  offscreenCtx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  docW: number;
  docH: number;
  screenX: number;
  screenY: number;
  /** Uniform scale applied to the quad and rendered content (from canvas scaleMode). Default: 1. */
  contentScale: number;
}

// ── Internal helpers ──────────────────────────────────────────

function _roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y,     x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x,     y + h, radius);
  ctx.arcTo(x,     y + h, x,     y,     radius);
  ctx.arcTo(x,     y,     x + w, y,     radius);
  ctx.closePath();
}

function _drawTooltip(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  text: string,
  dpr: number,
): void {
  const padding    = 6  * dpr;
  const fontSize   = 11 * dpr;
  const radius     = 4  * dpr;
  const offX       = 14 * dpr;
  const offY       = 4  * dpr;

  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  const textW = ctx.measureText(text).width;
  const boxW  = textW + padding * 2;
  const boxH  = fontSize * 1.4 + padding * 2;

  let bx = tipX + offX;
  let by = tipY + offY;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  if (bx + boxW > cw) bx = tipX - boxW - offX;
  if (by + boxH > ch) by = tipY - boxH;
  bx = Math.max(0, bx);
  by = Math.max(0, by);

  // Background
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(10,14,26,0.92)';
  _roundedRect(ctx, bx, by, boxW, boxH, radius);
  ctx.fill();

  // Border
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth   = dpr;
  _roundedRect(ctx, bx, by, boxW, boxH, radius);
  ctx.stroke();

  // Text
  ctx.fillStyle    = '#e6edf3';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + padding, by + boxH / 2);
  ctx.restore();
}

// ── FuiEngineRenderer ─────────────────────────────────────────

/**
 * Manages a THREE.js overlay pass for screen-space FUI rendering.
 *
 * - Uses `OrthographicCamera(0, W, H, 0, -1, 1)` — Y-up, pixel coords.
 * - Each screen-mode FUI entity gets an offscreen canvas → CanvasTexture → PlaneGeometry quad.
 * - `renderFrame()` renders the compiled FUI (and optional tooltip) to the
 *   offscreen canvas and marks the texture dirty.
 * - `renderOverlay(renderer)` composites the UI layer onto the main canvas
 *   with `autoClear = false` immediately after the main 3D frame.
 */
export class FuiEngineRenderer {
  private readonly uiScene:  THREE.Scene;
  private readonly uiCamera: THREE.OrthographicCamera;
  private readonly entries:  Map<EntityId, ScreenQuadEntry> = new Map();
  private screenW: number;
  private screenH: number;

  constructor(screenW: number, screenH: number) {
    this.screenW = screenW;
    this.screenH = screenH;

    this.uiScene  = new THREE.Scene();
    // OrthographicCamera(left, right, top, bottom, near, far)
    // top=H, bottom=0 → Y increases upward; y=H maps to top of viewport
    this.uiCamera = new THREE.OrthographicCamera(0, screenW, screenH, 0, -1, 1);
    this.uiCamera.position.z = 1;
  }

  // ── Resize ─────────────────────────────────────────────────

  resize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
    this.uiCamera.right  = w;
    this.uiCamera.top    = h;
    this.uiCamera.updateProjectionMatrix();
    for (const entry of this.entries.values()) {
      this._positionMesh(entry);
    }
  }

  // ── Frame update ───────────────────────────────────────────

  /**
   * Render a single screen-space FUI entity to its offscreen canvas and
   * mark the THREE.CanvasTexture dirty.  Creates / resizes the entry as needed.
   */
  renderFrame(
    entity: EntityId,
    docW: number,
    docH: number,
    screenX: number,
    screenY: number,
    compiled: FuiCompiled,
    nodeStates: Map<string, FuiNodeRenderState> | undefined,
    tooltip?: FuiTooltipState,
    /** Override pixel scale (defaults to `window.devicePixelRatio`). Pass `zoom * dpr` for editor previews. */
    pixelScale?: number,
    /** Uniform content scale from canvas scaleMode (default: 1). The quad and canvas are enlarged/shrunk by this factor. */
    contentScale?: number,
  ): void {
    const cs    = contentScale ?? 1;
    const dpr   = pixelScale ?? (window.devicePixelRatio || 1);
    const entry = this._getOrCreate(entity, docW, docH, screenX, screenY, dpr, cs);

    // Resize offscreen canvas if DPR/contentScale/doc size changed
    const targetW = Math.round(docW * cs * dpr);
    const targetH = Math.round(docH * cs * dpr);
    if (entry.offscreenCanvas.width !== targetW || entry.offscreenCanvas.height !== targetH) {
      entry.offscreenCanvas.width  = targetW;
      entry.offscreenCanvas.height = targetH;
    }

    // Update screen position if changed
    if (entry.screenX !== screenX || entry.screenY !== screenY) {
      entry.screenX = screenX;
      entry.screenY = screenY;
      this._positionMesh(entry);
    }

    renderCompiledFuiToCanvas(compiled, entry.offscreenCtx, {
      scaleX: dpr * cs,
      scaleY: dpr * cs,
      nodeStates,
    });

    if (tooltip) {
      _drawTooltip(entry.offscreenCtx, tooltip.x * cs * dpr, tooltip.y * cs * dpr, tooltip.text, dpr * cs);
    }

    entry.texture.needsUpdate = true;
  }

  // ── Overlay pass ───────────────────────────────────────────

  /**
   * Composite all screen-space FUI quads onto the WebGL canvas.
   * Must be called AFTER the main scene render (sets autoClear = false).
   */
  renderOverlay(renderer: THREE.WebGLRenderer): void {
    if (this.entries.size === 0) return;
    const prev = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.uiScene, this.uiCamera);
    renderer.autoClear = prev;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  removeEntity(entity: EntityId): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    this.uiScene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.material.dispose();
    entry.texture.dispose();
    this.entries.delete(entity);
  }

  dispose(): void {
    for (const [entity] of [...this.entries]) {
      this.removeEntity(entity);
    }
  }

  // ── Private ────────────────────────────────────────────────

  private _positionMesh(entry: ScreenQuadEntry): void {
    const scaledW = entry.docW * entry.contentScale;
    const scaledH = entry.docH * entry.contentScale;
    entry.mesh.position.set(
      entry.screenX + scaledW / 2,
      this.screenH - entry.screenY - scaledH / 2,
      0,
    );
  }

  private _getOrCreate(
    entity: EntityId,
    docW: number,
    docH: number,
    screenX: number,
    screenY: number,
    dpr: number,
    contentScale: number,
  ): ScreenQuadEntry {
    let entry = this.entries.get(entity);

    if (!entry || entry.docW !== docW || entry.docH !== docH || entry.contentScale !== contentScale) {
      // Dispose old entry if doc canvas size or content scale changed
      if (entry) this.removeEntity(entity);

      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width  = Math.round(docW * contentScale * dpr);
      offscreenCanvas.height = Math.round(docH * contentScale * dpr);
      const offscreenCtx = offscreenCanvas.getContext('2d')!;

      const texture = new THREE.CanvasTexture(offscreenCanvas);
      texture.colorSpace    = THREE.SRGBColorSpace;
      texture.minFilter     = THREE.LinearFilter;
      texture.magFilter     = THREE.LinearFilter;
      texture.generateMipmaps = false;

      const geom = new THREE.PlaneGeometry(docW * contentScale, docH * contentScale);
      const mat  = new THREE.MeshBasicMaterial({
        map:        texture,
        transparent: true,
        depthTest:   false,
        depthWrite:  false,
        side:        THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 9999;
      this.uiScene.add(mesh);

      entry = {
        offscreenCanvas, offscreenCtx,
        texture, material: mat, mesh,
        docW, docH, screenX, screenY, contentScale,
      };
      this.entries.set(entity, entry);
      this._positionMesh(entry);
    }

    return entry;
  }
}
