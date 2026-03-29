import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { ECSManager, EntityId, System, clearDirty, isDirty, markDirty } from '../core/ECS';
import { TransformComponent } from '../core/Components';
import { MouseButton, InputManager } from '../input/InputManager';
import { FluxionRenderer } from '../renderer/Renderer';
import { projectManager } from '../project/ProjectManager';
import { getFileSystem } from '../filesystem';
import { FuiComponent } from '../core/Components';
import { compileFui, hitTestFuiButtons, preloadFuiImages, renderCompiledFuiToCanvas } from './FuiRenderer';
import type { FuiCompiled, FuiCompiledNode, FuiNodeRenderState } from './FuiRenderer';
import { parseFuiJson } from './FuiParser';
import { applyAnimation } from './FuiAnimator';
import type { FuiDocument, FuiNode, FuiPanelNode } from './FuiTypes';

type PendingClick = {
  entity: EntityId;
  elementId: string;
};

interface ButtonInteractState {
  hoveredId: string | null;
  pressedId: string | null;
  nodeStates: Map<string, FuiNodeRenderState>;
}

// ── Singleton tooltip element (shared across all FUI entities) ──
let _tooltipEl: HTMLDivElement | null = null;

function getTooltipEl(): HTMLDivElement {
  if (!_tooltipEl) {
    _tooltipEl = document.createElement('div');
    Object.assign(_tooltipEl.style, {
      position: 'fixed',
      pointerEvents: 'none',
      background: 'rgba(10,14,26,0.92)',
      color: '#e6edf3',
      border: '1px solid #30363d',
      borderRadius: '4px',
      padding: '4px 8px',
      fontSize: '11px',
      fontFamily: 'var(--font-sans, sans-serif)',
      lineHeight: '1.4',
      zIndex: '9999',
      display: 'none',
      maxWidth: '220px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    });
    document.body.appendChild(_tooltipEl);
  }
  return _tooltipEl;
}

function showTooltip(text: string, mx: number, my: number): void {
  const el = getTooltipEl();
  el.textContent = text;
  el.style.display = 'block';
  // Offset from cursor; clamp inside viewport
  const offX = 14, offY = 20;
  let lx = mx + offX;
  let ly = my + offY;
  const vw = window.innerWidth, vh = window.innerHeight;
  if (lx + 220 > vw) lx = mx - 220 - offX;
  if (ly + 40  > vh) ly = my - 40;
  el.style.left = `${Math.max(0, lx)}px`;
  el.style.top  = `${Math.max(0, ly)}px`;
}

function hideTooltip(): void {
  if (_tooltipEl) _tooltipEl.style.display = 'none';
}

interface ScreenEntry {
  overlayCanvas: HTMLCanvasElement;
  overlayCtx: CanvasRenderingContext2D;
  offscreenCanvas: HTMLCanvasElement;
  offscreenCtx: CanvasRenderingContext2D;
  compiled: FuiCompiled;
}

interface WorldEntry {
  offscreenCanvas: HTMLCanvasElement;
  offscreenCtx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  compiled: FuiCompiled;
}

type Entry = { mode: 'screen'; screen: ScreenEntry } | { mode: 'world'; world: WorldEntry };

function getCanvasRect(canvas: HTMLCanvasElement): DOMRect {
  return canvas.getBoundingClientRect();
}

function resolveFuiPath(filePathOrRel: string): string {
  // Allow absolute paths in editor/scene, but prefer project-relative when possible.
  try {
    return projectManager.resolvePath(filePathOrRel);
  } catch {
    return filePathOrRel;
  }
}

export class FuiRuntimeSystem implements System {
  readonly name = 'FuiRuntime';
  readonly requiredComponents = ['Fui'];
  // Run after TransformSync so we can safely billboard/face camera for world-space UI.
  priority = -50;
  enabled = true;

  private entries: Map<EntityId, Entry> = new Map();
  private pendingClick: PendingClick | null = null;
  private animStates: Map<EntityId, { animId: string; time: number }> = new Map();
  /** Tracks the fuiPath that was successfully loaded per entity — used to detect path changes without dirty flag */
  private loadedPaths: Map<EntityId, string> = new Map();
  /** Tracks the _inlineDoc reference that was compiled per entity — detect reference changes */
  private loadedInlineDocs: Map<EntityId, unknown> = new Map();
  /** Per-entity hover/active button state for interactive rendering. */
  private interactStates: Map<EntityId, ButtonInteractState> = new Map();
  /** Last known cursor set on the engine canvas — avoid redundant style writes. */
  private _lastCursor = '';

  private parentEl: HTMLElement | null = null;

  constructor(
    private engine: Engine,
    private renderer: FluxionRenderer,
    private input: InputManager,
  ) {}

  onSceneClear(): void {
    this.pendingClick = null;
    for (const [entity] of this.entries) this.disposeEntry(entity);
    this.entries.clear();
    this.animStates.clear();
    this.loadedPaths.clear();
    this.loadedInlineDocs.clear();
    this.interactStates.clear();
    hideTooltip();
    this._setCursor('');
  }

  private disposeEntry(entity: EntityId): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    if (entry.mode === 'screen') {
      entry.screen.overlayCanvas.remove();
    } else {
      this.renderer.scene.remove(entry.world.mesh);
      entry.world.texture.dispose();
      entry.world.mesh.geometry.dispose();
      (entry.world.mesh.material as THREE.Material).dispose();
    }
    this.loadedPaths.delete(entity);
  }

  private ensureParentEl(): HTMLElement {
    if (this.parentEl) return this.parentEl;
    const parent = this.engine.config.canvas.parentElement;
    this.parentEl = parent ?? document.body;
    return this.parentEl;
  }

  async loadDocument(fuiPath: string): Promise<{ compiled: FuiCompiled }> {
    const fs = getFileSystem();
    const abs = resolveFuiPath(fuiPath);
    const text = await fs.readFile(abs);
    const doc = parseFuiJson(text);
    const compiled = compileFui(doc);
    return { compiled };
  }

  /**
   * Start pre-loading any SVG icon images referenced by `compiled`.
   * When an image finishes loading, the FUI component is marked dirty so
   * FuiRuntimeSystem triggers a re-render on the next frame.
   */
  private startIconPreload(compiled: FuiCompiled, comp: FuiComponent): void {
    preloadFuiImages(
      compiled,
      (src) => resolveFuiPath(src),
      () => { markDirty(comp); },
    );
  }

  private ensureScreenEntry(entity: EntityId, comp: FuiComponent, compiled: FuiCompiled): ScreenEntry {
    const entry = this.entries.get(entity);
    if (entry && entry.mode === 'screen') return entry.screen;

    const parent = this.ensureParentEl();

    // position:fixed makes the overlay relative to the viewport, not to any
    // ancestor element — so it aligns correctly regardless of how the canvas
    // container is laid out in the editor or in the game.
    const canvasRect = getCanvasRect(this.engine.config.canvas);
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'fixed';
    overlayCanvas.style.left = `${canvasRect.left + comp.screenX}px`;
    overlayCanvas.style.top  = `${canvasRect.top  + comp.screenY}px`;
    overlayCanvas.style.width  = `${compiled.doc.canvas.width}px`;
    overlayCanvas.style.height = `${compiled.doc.canvas.height}px`;
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.zIndex = '50';

    parent.appendChild(overlayCanvas);
    const overlayCtx = overlayCanvas.getContext('2d')!;

    // Offscreen buffer rendered at device-pixel resolution; blit to overlay.
    const dpr = window.devicePixelRatio || 1;
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width  = Math.round(compiled.doc.canvas.width  * dpr);
    offscreenCanvas.height = Math.round(compiled.doc.canvas.height * dpr);
    const offscreenCtx = offscreenCanvas.getContext('2d')!;

    const screenEntry: ScreenEntry = { overlayCanvas, overlayCtx, offscreenCanvas, offscreenCtx, compiled };
    this.entries.set(entity, { mode: 'screen', screen: screenEntry });
    return screenEntry;
  }

  private ensureWorldEntry(entity: EntityId, comp: FuiComponent, compiled: FuiCompiled): WorldEntry {
    const entry = this.entries.get(entity);
    if (entry && entry.mode === 'world') return entry.world;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = compiled.doc.canvas.width;
    offscreenCanvas.height = compiled.doc.canvas.height;
    const offscreenCtx = offscreenCanvas.getContext('2d')!;

    const texture = new THREE.CanvasTexture(offscreenCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const geom = new THREE.PlaneGeometry(comp.worldWidth, comp.worldHeight);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 1000;

    // Add directly to scene — NOT via renderer.addObject() which would
    // replace the entity's existing mesh (MeshRenderer, etc.)
    this.renderer.scene.add(mesh);

    const worldEntry: WorldEntry = { offscreenCanvas, offscreenCtx, texture, mesh, compiled };
    this.entries.set(entity, { mode: 'world', world: worldEntry });
    return worldEntry;
  }

  private _getInteractState(entity: EntityId): ButtonInteractState {
    let s = this.interactStates.get(entity);
    if (!s) { s = { hoveredId: null, pressedId: null, nodeStates: new Map() }; this.interactStates.set(entity, s); }
    return s;
  }

  private _setCursor(cursor: string): void {
    if (cursor === this._lastCursor) return;
    this._lastCursor = cursor;
    this.engine.config.canvas.style.cursor = cursor || '';
  }

  private renderScreen(entry: ScreenEntry, comp: FuiComponent, nodeStates?: Map<string, FuiNodeRenderState>): void {
    const { compiled } = entry;
    const { doc } = compiled;
    const dpr = window.devicePixelRatio || 1;

    const cssW = Math.max(1, doc.canvas.width);
    const cssH = Math.max(1, doc.canvas.height);
    const pixW = Math.round(cssW * dpr);
    const pixH = Math.round(cssH * dpr);

    // Keep overlay CSS size in logical pixels; physical pixel count = dpr multiple.
    entry.overlayCanvas.style.width  = `${cssW}px`;
    entry.overlayCanvas.style.height = `${cssH}px`;
    if (entry.overlayCanvas.width !== pixW || entry.overlayCanvas.height !== pixH) {
      entry.overlayCanvas.width  = pixW;
      entry.overlayCanvas.height = pixH;
    }

    // Offscreen buffer at device-pixel resolution for crisp text/edges.
    if (entry.offscreenCanvas.width !== pixW || entry.offscreenCanvas.height !== pixH) {
      entry.offscreenCanvas.width  = pixW;
      entry.offscreenCanvas.height = pixH;
    }

    renderCompiledFuiToCanvas(entry.compiled, entry.offscreenCtx, { scaleX: dpr, scaleY: dpr, nodeStates });

    entry.overlayCtx.clearRect(0, 0, pixW, pixH);
    entry.overlayCtx.drawImage(entry.offscreenCanvas, 0, 0, pixW, pixH);
  }

  private renderWorld(entry: WorldEntry, comp: FuiComponent, nodeStates?: Map<string, FuiNodeRenderState>): void {
    const { compiled } = entry;
    renderCompiledFuiToCanvas(compiled, entry.offscreenCtx, { scaleX: 1, scaleY: 1, nodeStates });
    entry.texture.needsUpdate = true;
  }

  private getPointerNDC(): THREE.Vector2 {
    const canvas = this.engine.config.canvas;
    const rect = getCanvasRect(canvas);
    const mx = this.input.mousePosition.x;
    const my = this.input.mousePosition.y;
    const nx = ((mx - rect.left) / rect.width) * 2 - 1;
    const ny = -(((my - rect.top) / rect.height) * 2 - 1);
    return new THREE.Vector2(nx, ny);
  }

  private hitTestScreen(
    compiled: FuiCompiled,
    comp: FuiComponent,
  ): FuiCompiledNode | null {
    // Mouse position is in client (viewport) coords. The overlay is also
    // positioned in client coords (position:fixed), so subtract canvasRect
    // origin + screenX/Y to arrive at FUI document space.
    const canvasRect = getCanvasRect(this.engine.config.canvas);

    const px = this.input.mousePosition.x - canvasRect.left - comp.screenX;
    const py = this.input.mousePosition.y - canvasRect.top  - comp.screenY;

    const canvasW = compiled.doc.canvas.width;
    const canvasH = compiled.doc.canvas.height;
    if (px < 0 || py < 0 || px > canvasW || py > canvasH) return null;

    return hitTestFuiButtons(compiled, px, py);
  }

  private hitTestWorld(compiled: FuiCompiled, entry: WorldEntry, ray: THREE.Ray): FuiCompiledNode | null {
    const raycaster = new THREE.Raycaster(ray.origin, ray.direction);
    const hits = raycaster.intersectObject(entry.mesh, true);
    if (!hits.length) return null;
    const hit = hits[0];

    // Convert intersection point into mesh local space (plane is in XY).
    const local = entry.mesh.worldToLocal(hit.point.clone());

    const w = entry.mesh.geometry instanceof THREE.PlaneGeometry ? entry.mesh.geometry.parameters.width : this.engine.config.width;
    const h = entry.mesh.geometry instanceof THREE.PlaneGeometry ? entry.mesh.geometry.parameters.height : this.engine.config.height;
    const docX = (local.x + w / 2) / w * compiled.doc.canvas.width;
    const docY = (h / 2 - local.y) / h * compiled.doc.canvas.height;

    return hitTestFuiButtons(compiled, docX, docY);
  }

  update(entities: Set<EntityId>, ecs: ECSManager, _dt: number): void {
    // Clean up entries whose entity was deleted or whose FUI component was removed.
    for (const eid of [...this.entries.keys()]) {
      if (!entities.has(eid)) {
        this.disposeEntry(eid);
        this.entries.delete(eid);
        this.animStates.delete(eid);
      }
    }

    // We run asynchronous document loads only when components are dirty or the path changed.
    for (const entity of entities) {
      const comp = ecs.getComponent<FuiComponent>(entity, 'Fui');
      if (!comp || !comp.enabled) continue;
      const dirty = isDirty(comp);

      // Document is loaded lazily (and reloaded on property dirty or fuiPath change).
      const existing = this.entries.get(entity);
      const pathChanged = existing != null && this.loadedPaths.get(entity) !== comp.fuiPath;
      const inlineDocChanged = comp._inlineDoc !== undefined &&
        this.loadedInlineDocs.get(entity) !== comp._inlineDoc;

      if (!existing || dirty || pathChanged || inlineDocChanged) {
        // ── Inline document (synchronous — built via FuiBuilder) ──
        if (comp._inlineDoc !== undefined) {
          const doc = comp._inlineDoc as FuiDocument;
          const compiled = compileFui(doc);
          this.startIconPreload(compiled, comp);
          const prev = this.entries.get(entity);
          if (prev && prev.mode !== comp.mode) {
            this.disposeEntry(entity);
            this.entries.delete(entity);
          }
          if (comp.mode === 'screen') {
            const screen = this.ensureScreenEntry(entity, comp, compiled);
            screen.compiled = compiled;
            screen.offscreenCanvas.width = compiled.doc.canvas.width;
            screen.offscreenCanvas.height = compiled.doc.canvas.height;
            this.renderScreen(screen, comp, this._getInteractState(entity).nodeStates);
          } else {
            const world = this.ensureWorldEntry(entity, comp, compiled);
            world.compiled = compiled;
            world.mesh.geometry.dispose();
            world.mesh.geometry = new THREE.PlaneGeometry(comp.worldWidth, comp.worldHeight);
            world.offscreenCanvas.width = compiled.doc.canvas.width;
            world.offscreenCanvas.height = compiled.doc.canvas.height;
            this.renderWorld(world, comp, this._getInteractState(entity).nodeStates);
          }
          this.loadedInlineDocs.set(entity, comp._inlineDoc);
          clearDirty(comp);
          continue;
        }

        // ── File-based document (async) ──
        const fuiPath = comp.fuiPath;
        if (!fuiPath) continue;

        void this.loadDocument(fuiPath).then(({ compiled }) => {
          if (!ecs.entityExists(entity)) return;
          // Discard stale result if path changed again while we were loading.
          if (comp.fuiPath !== fuiPath) return;

          this.startIconPreload(compiled, comp);

          // Clean up old entry if mode changed (screen↔world switch)
          const prev = this.entries.get(entity);
          if (prev && prev.mode !== comp.mode) {
            this.disposeEntry(entity);
            this.entries.delete(entity);
          }

          if (comp.mode === 'screen') {
            const screen = this.ensureScreenEntry(entity, comp, compiled);
            screen.compiled = compiled;
            screen.offscreenCanvas.width = compiled.doc.canvas.width;
            screen.offscreenCanvas.height = compiled.doc.canvas.height;
            this.renderScreen(screen, comp, this._getInteractState(entity).nodeStates);
          } else {
            const world = this.ensureWorldEntry(entity, comp, compiled);
            world.compiled = compiled;

            // Update plane geometry to match configured world size.
            world.mesh.geometry.dispose();
            world.mesh.geometry = new THREE.PlaneGeometry(comp.worldWidth, comp.worldHeight);

            // Update offscreen canvas size to match the document.
            world.offscreenCanvas.width = compiled.doc.canvas.width;
            world.offscreenCanvas.height = compiled.doc.canvas.height;

            // Sync position to entity transform immediately after load.
            const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
            if (transform) {
              world.mesh.position.copy(transform.position);
              world.mesh.scale.copy(transform.scale);
              world.mesh.quaternion.copy(transform.quaternion);
            }

            this.renderWorld(world, comp, this._getInteractState(entity).nodeStates);
          }
          clearDirty(comp);
          this.loadedPaths.set(entity, fuiPath);
        }).catch(() => {
          // Ignore; will stay uninitialized.
        });
      } else if (existing.mode === 'screen') {
        const screen = existing.screen;
        const overlay = screen.overlayCanvas;
        const docW = screen.compiled.doc.canvas.width;
        const docH = screen.compiled.doc.canvas.height;
        const ist  = this._getInteractState(entity);

        // Recompute position every frame from the canvas's live bounding rect so
        // the overlay stays aligned even when the window is resized or the editor
        // panel is moved/resized.
        const canvasRect = getCanvasRect(this.engine.config.canvas);
        const expectedLeft   = `${canvasRect.left + comp.screenX}px`;
        const expectedTop    = `${canvasRect.top  + comp.screenY}px`;
        const expectedWidth  = `${docW}px`;
        const expectedHeight = `${docH}px`;
        if (
          overlay.style.left   !== expectedLeft  ||
          overlay.style.top    !== expectedTop   ||
          overlay.style.width  !== expectedWidth ||
          overlay.style.height !== expectedHeight
        ) {
          overlay.style.left   = expectedLeft;
          overlay.style.top    = expectedTop;
          overlay.style.width  = expectedWidth;
          overlay.style.height = expectedHeight;
        }

        // ── Hover detection (screen-space) ──
        {
          const hovered = this.hitTestScreen(screen.compiled, comp)  // non-disabled first
            ?? hitTestFuiButtons(
                screen.compiled,
                this.input.mousePosition.x - canvasRect.left - comp.screenX,
                this.input.mousePosition.y - canvasRect.top  - comp.screenY,
                { includeDisabled: true },
              ); // also check disabled buttons for cursor/tooltip
          const newHoverId = hovered?.id ?? null;
          const pressed = ist.pressedId;

          if (newHoverId !== ist.hoveredId || pressed !== ist.pressedId) {
            ist.hoveredId = newHoverId;
            ist.nodeStates.clear();
            if (newHoverId) {
              ist.nodeStates.set(newHoverId, {
                hover: !hovered?.disabled,
                active: pressed === newHoverId,
              });
            }
            if (pressed && pressed !== newHoverId) {
              ist.nodeStates.set(pressed, { active: true });
            }
            this.renderScreen(screen, comp, ist.nodeStates);
          }

          // Cursor
          if (newHoverId && hovered) {
            const cur = hovered.disabled ? 'not-allowed' : (hovered.cursor ?? 'pointer');
            this._setCursor(cur);
          } else {
            this._setCursor('');
          }

          // Tooltip
          if (newHoverId && hovered?.tooltip && !hovered.disabled) {
            showTooltip(hovered.tooltip, this.input.mousePosition.x, this.input.mousePosition.y);
          } else {
            hideTooltip();
          }
        }

        // Redraw when device-pixel canvas size changed (e.g. DPR change or doc resize).
        const dpr = window.devicePixelRatio || 1;
        if (overlay.width !== Math.round(docW * dpr) || overlay.height !== Math.round(docH * dpr)) {
          this.renderScreen(screen, comp, ist.nodeStates);
        }

        // ── Animation ──
        if (comp.playAnimation) {
          const anim = screen.compiled.doc.animations?.find(a => a.id === comp.playAnimation);
          if (anim) {
            const state = this.animStates.get(entity) ?? { animId: comp.playAnimation, time: 0 };
            if (state.animId !== comp.playAnimation) { state.animId = comp.playAnimation; state.time = 0; }
            state.time += _dt * (comp.animationSpeed || 1);
            if (anim.loop) state.time = ((state.time % anim.duration) + anim.duration) % anim.duration;
            else state.time = Math.min(state.time, anim.duration);
            this.animStates.set(entity, state);
            const animDoc = applyAnimation(screen.compiled.doc, anim, state.time);
            const animCompiled = compileFui(animDoc);
            this.renderScreen({ ...screen, compiled: animCompiled }, comp, ist.nodeStates);
          }
        }
      } else if (existing.mode === 'world') {
        const world = existing.world;
        // Sync position and scale from entity transform every frame
        const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
        if (transform) {
          world.mesh.position.copy(transform.position);
          world.mesh.scale.copy(transform.scale);
          if (!comp.billboard) world.mesh.quaternion.copy(transform.quaternion);
        }
        // Billboard: override rotation to face active camera
        const cam = this.renderer.getActiveCamera();
        if (comp.billboard && cam) world.mesh.quaternion.copy(cam.quaternion);

        // ── Animation ──
        if (comp.playAnimation) {
          const anim = world.compiled.doc.animations?.find(a => a.id === comp.playAnimation);
          if (anim) {
            const state = this.animStates.get(entity) ?? { animId: comp.playAnimation, time: 0 };
            if (state.animId !== comp.playAnimation) { state.animId = comp.playAnimation; state.time = 0; }
            state.time += _dt * (comp.animationSpeed || 1);
            if (anim.loop) state.time = ((state.time % anim.duration) + anim.duration) % anim.duration;
            else state.time = Math.min(state.time, anim.duration);
            this.animStates.set(entity, state);
            const animDoc = applyAnimation(world.compiled.doc, anim, state.time);
            const animCompiled = compileFui(animDoc);
            this.renderWorld({ ...world, compiled: animCompiled }, comp, this._getInteractState(entity).nodeStates);
          }
        }
      }
    }

    // ── Interaction (click + active-state tracking) ──
    const clicked  = this.input.isMousePressed(MouseButton.Left);
    const released = this.input.isMouseReleased(MouseButton.Left);
    const ray = new THREE.Ray();

    if (clicked) {
      this.pendingClick = null;

      // We'll test in deterministic order: last entity that hits wins.
      for (const entity of entities) {
        const comp = ecs.getComponent<FuiComponent>(entity, 'Fui');
        if (!comp || !comp.enabled) continue;
        const entry = this.entries.get(entity);
        if (!entry) continue;
        const ist = this._getInteractState(entity);
        if (entry.mode === 'screen') {
          const hit = this.hitTestScreen(entry.screen.compiled, comp);
          if (hit?.type === 'button') {
            this.pendingClick = { entity, elementId: hit.id };
            // Set active state
            ist.pressedId = hit.id;
            ist.nodeStates.set(hit.id, { hover: ist.hoveredId === hit.id, active: true });
            this.renderScreen(entry.screen, comp, ist.nodeStates);
          }
        } else {
          const cam = this.renderer.getActiveCamera();
          if (!cam) continue;
          const ndc = this.getPointerNDC();
          ray.origin.copy(this.renderer.getActiveCamera().position);
          ray.direction.copy(new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize());
          const hit = this.hitTestWorld(entry.world.compiled, entry.world, ray);
          if (hit?.type === 'button') {
            this.pendingClick = { entity, elementId: hit.id };
            ist.pressedId = hit.id;
            ist.nodeStates.set(hit.id, { hover: false, active: true });
            this.renderWorld(entry.world, comp, ist.nodeStates);
          }
        }
      }
    }

    if (released && this.pendingClick) {
      const target = this.pendingClick;
      const comp = ecs.getComponent<FuiComponent>(target.entity, 'Fui');
      const entry = this.entries.get(target.entity);

      if (comp && entry) {
        if (entry.mode === 'screen') {
          const hit = this.hitTestScreen(entry.screen.compiled, comp);
          if (hit?.id === target.elementId) {
            this.engine.events.emit('ui:click', { entity: target.entity, elementId: target.elementId, mode: entry.mode });
          }
        } else {
          const cam = this.renderer.getActiveCamera();
          if (cam) {
            const ndc = this.getPointerNDC();
            ray.origin.copy(cam.position);
            ray.direction.copy(new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize());
            const hit = this.hitTestWorld(entry.world.compiled, entry.world, ray);
            if (hit?.id === target.elementId) {
              this.engine.events.emit('ui:click', { entity: target.entity, elementId: target.elementId, mode: entry.mode });
            }
          }
        }
      }
      // Clear active state regardless of whether click confirmed
      const ist = this.interactStates.get(target.entity);
      if (ist && ist.pressedId) {
        const prevPressed = ist.pressedId;
        ist.pressedId = null;
        ist.nodeStates.set(prevPressed, { hover: ist.hoveredId === prevPressed, active: false });
        if (comp && entry) {
          if (entry.mode === 'screen') this.renderScreen(entry.screen, comp, ist.nodeStates);
          else this.renderWorld(entry.world, comp, ist.nodeStates);
        }
      }
      this.pendingClick = null;
    } else if (released) {
      // Released without a pending click — still clear any stuck active state
      for (const entity of entities) {
        const ist = this.interactStates.get(entity);
        if (!ist || !ist.pressedId) continue;
        const prevPressed = ist.pressedId;
        ist.pressedId = null;
        ist.nodeStates.set(prevPressed, { hover: ist.hoveredId === prevPressed, active: false });
        const comp = ecs.getComponent<FuiComponent>(entity, 'Fui');
        const entry = this.entries.get(entity);
        if (comp && entry) {
          if (entry.mode === 'screen') this.renderScreen(entry.screen, comp, ist.nodeStates);
          else this.renderWorld(entry.world, comp, ist.nodeStates);
        }
      }
    }
  }

  /**
   * Mutate the text of a label or button node and immediately re-render.
   * Called from scripts via `this.ui.setText(nodeId, value)`.
   */
  setNodeText(entity: EntityId, nodeId: string, text: string): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    const compiled = entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
    const node = compiled.nodeById.get(nodeId);
    if (!node) return;
    node.text = text;
    // Also patch the source document so animation recompilation doesn't overwrite.
    const comp = this.engine.ecs.getComponent<FuiComponent>(entity, 'Fui');
    if (!comp) return;
    if (comp._inlineDoc) this._patchDocNodeText(comp._inlineDoc as FuiDocument, nodeId, text);
    const ns = this.interactStates.get(entity)?.nodeStates;
    if (entry.mode === 'screen') this.renderScreen(entry.screen, comp, ns);
    else this.renderWorld(entry.world, comp, ns);
  }

  private _patchDocNodeText(doc: FuiDocument, nodeId: string, text: string): void {
    const walk = (node: FuiNode): boolean => {
      if (node.id === nodeId) {
        (node as FuiPanelNode & { text?: string }).text = text;
        return true;
      }
      if (node.type === 'panel') {
        for (const child of (node as FuiPanelNode).children ?? []) {
          if (walk(child)) return true;
        }
      }
      return false;
    };
    walk(doc.root);
  }
}

