import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { ECSManager, EntityId, System, clearDirty, isDirty, markDirty } from '../core/ECS';
import { TransformComponent } from '../core/Components';
import { MouseButton, InputManager } from '../input/InputManager';
import { FluxionRenderer } from '../renderer/Renderer';
import { EngineEvents } from '../core/EventSystem';
import { projectManager } from '../project/ProjectManager';
import { getFileSystem } from '../filesystem';
import { FuiComponent } from '../core/Components';
import { compileFui, hitTestFuiButtons, hitTestInteractable, loadFuiFonts, preloadFuiImages, renderCompiledFuiToCanvas } from './FuiRenderer';
import type { FuiCompiled, FuiCompiledNode, FuiNodeRenderState } from './FuiRenderer';
import { parseFuiJson } from './FuiParser';
import { applyAnimation } from './FuiAnimator';
import { FuiEngineRenderer } from './FuiEngineRenderer';
import type { FuiTooltipState } from './FuiEngineRenderer';
import type { FuiDocument, FuiNode, FuiPanelNode, FuiScaleMode } from './FuiTypes';

type PendingClick = {
  entity: EntityId;
  elementId: string;
};

interface SliderDragState {
  entity: EntityId;
  nodeId: string;
  startMouseX: number;
  startMouseY: number;
  startValue: number;
  min: number;
  max: number;
  direction: 'horizontal' | 'vertical';
  rectX: number;
  rectY: number;
  rectW: number;
  rectH: number;
  contentScale: number;
}

interface ButtonInteractState {
  hoveredId: string | null;
  pressedId: string | null;
  nodeStates: Map<string, FuiNodeRenderState>;
}

// Screen-space FUI — only compiled doc needed; canvas+texture managed by FuiEngineRenderer
interface ScreenEntry {
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
  /** Active tooltip state per entity — passed to FuiEngineRenderer each frame. */
  private _activeTooltips: Map<EntityId, FuiTooltipState | null> = new Map();
  /** Active slider drag in progress. */
  private _sliderDrag: SliderDragState | null = null;

  private fuiEngineRenderer: FuiEngineRenderer;
  private screenW: number;
  private screenH: number;

  constructor(
    private engine: Engine,
    private renderer: FluxionRenderer,
    private input: InputManager,
  ) {
    this.screenW = engine.config.width;
    this.screenH = engine.config.height;
    this.fuiEngineRenderer = new FuiEngineRenderer(engine.config.width, engine.config.height);
    renderer.registerUIOverlay(() => this.fuiEngineRenderer.renderOverlay(renderer.renderer));
    engine.events.on(EngineEvents.RESIZE, (data: { width: number; height: number }) => {
      this.fuiEngineRenderer.resize(data.width, data.height);
      this.screenW = data.width;
      this.screenH = data.height;
    });
  }

  onSceneClear(): void {
    this.pendingClick = null;
    this._sliderDrag = null;
    for (const [entity] of this.entries) this.disposeEntry(entity);
    this.entries.clear();
    this.animStates.clear();
    this.loadedPaths.clear();
    this.loadedInlineDocs.clear();
    this.interactStates.clear();
    this._activeTooltips.clear();
    this._setCursor('');
  }

  private disposeEntry(entity: EntityId): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    if (entry.mode === 'screen') {
      this.fuiEngineRenderer.removeEntity(entity);
      this._activeTooltips.delete(entity);
    } else {
      this.renderer.scene.remove(entry.world.mesh);
      entry.world.texture.dispose();
      entry.world.mesh.geometry.dispose();
      (entry.world.mesh.material as THREE.Material).dispose();
    }
    this.loadedPaths.delete(entity);
  }

  async loadDocument(fuiPath: string): Promise<{ compiled: FuiCompiled }> {
    const fs = getFileSystem();
    const abs = resolveFuiPath(fuiPath);
    const text = await fs.readFile(abs);
    const doc = parseFuiJson(text);
    if (doc.fonts?.length) {
      await loadFuiFonts(doc.fonts, (rel) => {
        const resolved = resolveFuiPath(rel);
        return resolved.startsWith('file://') ? resolved : `file:///${resolved.replace(/\\/g, '/')}`;
      });
    }
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

  /** Compute uniform content scale factor from the document's scaleMode settings. */
  private _computeContentScale(doc: FuiDocument): number {
    const { scaleMode, referenceWidth, referenceHeight, matchWidthOrHeight, width, height } = doc.canvas;
    if (!scaleMode || scaleMode === 'constantPixelSize') return 1;
    const refW  = referenceWidth  ?? width;
    const refH  = referenceHeight ?? height;
    const match = matchWidthOrHeight ?? 0.5;
    const scaleW = this.screenW / refW;
    const scaleH = this.screenH / refH;
    // Log-space blend (matches Unity Canvas Scaler behaviour)
    return Math.exp(Math.log(scaleW) * (1 - match) + Math.log(scaleH) * match);
  }

  /** Render a screen-space FUI entity via FuiEngineRenderer (THREE.js overlay pass). */
  private _renderScreenFrame(
    entity: EntityId,
    screen: ScreenEntry,
    comp: FuiComponent,
    nodeStates?: Map<string, FuiNodeRenderState>,
    tooltip?: FuiTooltipState | null,
  ): void {
    const docW = screen.compiled.doc.canvas.width;
    const docH = screen.compiled.doc.canvas.height;
    const cs   = this._computeContentScale(screen.compiled.doc);
    this.fuiEngineRenderer.renderFrame(
      entity, docW, docH, comp.screenX, comp.screenY,
      screen.compiled, nodeStates,
      tooltip ?? undefined,
      undefined, // pixelScale — use default DPR
      cs,
    );
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
    const cs = this._computeContentScale(compiled.doc);

    const px = (this.input.mousePosition.x - canvasRect.left - comp.screenX) / cs;
    const py = (this.input.mousePosition.y - canvasRect.top  - comp.screenY) / cs;

    const canvasW = compiled.doc.canvas.width;
    const canvasH = compiled.doc.canvas.height;
    if (px < 0 || py < 0 || px > canvasW || py > canvasH) return null;

    return hitTestInteractable(compiled, px, py);
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

    return hitTestInteractable(compiled, docX, docY);
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
            const screen: ScreenEntry = { compiled };
            this.entries.set(entity, { mode: 'screen', screen });
            this._renderScreenFrame(entity, screen, comp, this._getInteractState(entity).nodeStates);
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
            const screen: ScreenEntry = { compiled };
            this.entries.set(entity, { mode: 'screen', screen });
            this._renderScreenFrame(entity, screen, comp, this._getInteractState(entity).nodeStates);
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
        const screen      = existing.screen;
        const ist         = this._getInteractState(entity);
        const canvasRect  = getCanvasRect(this.engine.config.canvas);

        // ── Hover detection (screen-space) ──
        const _cs  = this._computeContentScale(screen.compiled.doc);
        const _docX = (this.input.mousePosition.x - canvasRect.left - comp.screenX) / _cs;
        const _docY = (this.input.mousePosition.y - canvasRect.top  - comp.screenY) / _cs;
        const hovered = this.hitTestScreen(screen.compiled, comp)
          ?? hitTestInteractable(
              screen.compiled,
              _docX,
              _docY,
              { includeDisabled: true },
            );
        const newHoverId = hovered?.id ?? null;
        const pressed    = ist.pressedId;

        // Tooltip state in FUI canvas space
        let tooltipState: FuiTooltipState | null = null;
        if (newHoverId && hovered?.tooltip && !hovered.disabled) {
          tooltipState = { text: hovered.tooltip, x: _docX, y: _docY };
        }

        const hoverChanged = newHoverId !== ist.hoveredId;
        if (hoverChanged && !this.engine.simulationPaused) {
          if (ist.hoveredId) this.engine.events.emit('ui:mouseexit',  { entity, elementId: ist.hoveredId });
          if (newHoverId)    this.engine.events.emit('ui:mouseenter', { entity, elementId: newHoverId });
        }
        const stateChanged = hoverChanged || pressed !== ist.pressedId;
        if (stateChanged) {
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
        }

        // Re-render on state change or every frame tooltip is visible (position tracks cursor)
        if (stateChanged || tooltipState != null) {
          this._activeTooltips.set(entity, tooltipState);
          this._renderScreenFrame(entity, screen, comp, ist.nodeStates, tooltipState);
        }

        // Cursor
        if (newHoverId && hovered) {
          this._setCursor(hovered.disabled ? 'not-allowed' : (hovered.cursor ?? 'pointer'));
        } else {
          this._setCursor('');
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
            const animDoc      = applyAnimation(screen.compiled.doc, anim, state.time);
            const animCompiled = compileFui(animDoc);
            this._renderScreenFrame(entity, { ...screen, compiled: animCompiled }, comp, ist.nodeStates, this._activeTooltips.get(entity) ?? undefined);
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

        // ── World-space hover ──
        if (cam) {
          const ndc = this.getPointerNDC();
          const wDir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
          const worldHit = this.hitTestWorld(world.compiled, world, new THREE.Ray(cam.position.clone(), wDir));
          const newWorldHoverId = worldHit?.id ?? null;
          const wIst = this._getInteractState(entity);
          if (newWorldHoverId !== wIst.hoveredId) {
            if (!this.engine.simulationPaused) {
              if (wIst.hoveredId) this.engine.events.emit('ui:mouseexit',  { entity, elementId: wIst.hoveredId });
              if (newWorldHoverId) this.engine.events.emit('ui:mouseenter', { entity, elementId: newWorldHoverId });
            }
            wIst.hoveredId = newWorldHoverId;
            wIst.nodeStates.clear();
            if (newWorldHoverId) wIst.nodeStates.set(newWorldHoverId, { hover: !worldHit?.disabled, active: false });
            this.renderWorld(world, comp, wIst.nodeStates);
          }
        }

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
    // Gate on simulationPaused: editor clicks (panel interactions, camera orbit, etc.)
    // must not bleed into FUI event emission.
    const _simRunning = !this.engine.simulationPaused;
    const clicked  = _simRunning && this.input.isMousePressed(MouseButton.Left);
    const released = _simRunning && this.input.isMouseReleased(MouseButton.Left);
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
          if (hit) this._handleInteractablePress(entity, hit, entry, comp, ist, 'screen');
        } else {
          const cam = this.renderer.getActiveCamera();
          if (!cam) continue;
          const ndc = this.getPointerNDC();
          ray.origin.copy(this.renderer.getActiveCamera().position);
          ray.direction.copy(new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize());
          const hit = this.hitTestWorld(entry.world.compiled, entry.world, ray);
          if (hit) this._handleInteractablePress(entity, hit, entry, comp, ist, 'world');
        }
      }
    }

    // ── Slider drag processing ──
    if (this._sliderDrag && this.input.isMouseDown(MouseButton.Left)) {
      const drag = this._sliderDrag;
      const entry = this.entries.get(drag.entity);
      const comp  = ecs.getComponent<FuiComponent>(drag.entity, 'Fui');
      if (entry && comp) {
        const compiled = entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
        const node = compiled.nodeById.get(drag.nodeId);
        if (node) {
          const canvasRect = getCanvasRect(this.engine.config.canvas);
          const mx = this.input.mousePosition.x - canvasRect.left;
          const my = this.input.mousePosition.y - canvasRect.top;
          const cs = drag.contentScale;
          let newVal: number;
          if (drag.direction === 'vertical') {
            const delta = (drag.startMouseY - my) / Math.max(1, drag.rectH * cs);
            newVal = drag.startValue + delta * (drag.max - drag.min);
          } else {
            const delta = (mx - drag.startMouseX) / Math.max(1, drag.rectW * cs);
            newVal = drag.startValue + delta * (drag.max - drag.min);
          }
          newVal = Math.max(drag.min, Math.min(drag.max, newVal));
          if (node.value !== newVal) {
            node.value = newVal;
            const ist = this._getInteractState(drag.entity);
            if (entry.mode === 'screen') this._renderScreenFrame(drag.entity, entry.screen, comp, ist.nodeStates, this._activeTooltips.get(drag.entity) ?? undefined);
            else this.renderWorld(entry.world, comp, ist.nodeStates);
          }
        }
      }
    }

    if (released && this._sliderDrag) {
      const drag = this._sliderDrag;
      const entry = this.entries.get(drag.entity);
      const comp  = ecs.getComponent<FuiComponent>(drag.entity, 'Fui');
      if (entry && comp) {
        const compiled = entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
        const node = compiled.nodeById.get(drag.nodeId);
        if (node != null) {
          this.engine.events.emit('ui:slider-change', { entity: drag.entity, elementId: drag.nodeId, value: node.value });
        }
      }
      this._sliderDrag = null;
    }

    if (released && this.pendingClick) {
      const target = this.pendingClick;
      const comp = ecs.getComponent<FuiComponent>(target.entity, 'Fui');
      const entry = this.entries.get(target.entity);

      if (comp && entry) {
        if (entry.mode === 'screen') {
          const hit = this.hitTestScreen(entry.screen.compiled, comp);
          if (hit?.id === target.elementId) {
            if (hit.type === 'toggle') {
              // Flip value in compiled doc
              hit.value = !hit.value;
              this._patchDocNodeValue(comp, hit.id, hit.value);
              const ist = this._getInteractState(target.entity);
              this._renderScreenFrame(target.entity, entry.screen, comp, ist.nodeStates, this._activeTooltips.get(target.entity) ?? undefined);
              this.engine.events.emit('ui:toggle', { entity: target.entity, elementId: target.elementId, value: hit.value });
            } else {
              this.engine.events.emit('ui:click', { entity: target.entity, elementId: target.elementId, mode: entry.mode });
            }
          }
        } else {
          const cam = this.renderer.getActiveCamera();
          if (cam) {
            const ndc = this.getPointerNDC();
            ray.origin.copy(cam.position);
            ray.direction.copy(new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize());
            const hit = this.hitTestWorld(entry.world.compiled, entry.world, ray);
            if (hit?.id === target.elementId) {
              if (hit.type === 'toggle') {
                hit.value = !hit.value;
                this._patchDocNodeValue(comp, hit.id, hit.value);
                const ist = this._getInteractState(target.entity);
                this.renderWorld(entry.world, comp, ist.nodeStates);
                this.engine.events.emit('ui:toggle', { entity: target.entity, elementId: target.elementId, value: hit.value });
              } else {
                this.engine.events.emit('ui:click', { entity: target.entity, elementId: target.elementId, mode: entry.mode });
              }
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
          if (entry.mode === 'screen') this._renderScreenFrame(target.entity, entry.screen, comp, ist.nodeStates, this._activeTooltips.get(target.entity) ?? undefined);
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
          if (entry.mode === 'screen') this._renderScreenFrame(entity, entry.screen, comp, ist.nodeStates, this._activeTooltips.get(entity) ?? undefined);
          else this.renderWorld(entry.world, comp, ist.nodeStates);
        }
      }
    }
  }

  /** Return the compiled FUI document for an entity, or null if not loaded. */
  getCompiled(entity: EntityId): FuiCompiled | null {
    const entry = this.entries.get(entity);
    if (!entry) return null;
    return entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
  }

  /** Return whether a specific FUI node is currently hovered by the mouse. */
  isNodeHovered(entity: EntityId, nodeId: string): boolean {
    return this.interactStates.get(entity)?.hoveredId === nodeId;
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
    if (entry.mode === 'screen') this._renderScreenFrame(entity, entry.screen, comp, ns, this._activeTooltips.get(entity) ?? undefined);
    else this.renderWorld(entry.world, comp, ns);
  }

  /**
   * Toggle the border of a button node and immediately re-render.
   * Called from scripts via `this.ui.setBorder(nodeId, enabled)`.
   */
  setNodeBorder(entity: EntityId, nodeId: string, enabled: boolean): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    const compiled = entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
    const node = compiled.nodeById.get(nodeId);
    if (!node) return;
    if (!node.style) (node as any).style = {};
    (node.style as any).showBorder = enabled;
    const comp = this.engine.ecs.getComponent<FuiComponent>(entity, 'Fui');
    if (!comp) return;
    if (comp._inlineDoc) this._patchDocNodeStyleProp(comp._inlineDoc as FuiDocument, nodeId, 'showBorder', enabled);
    const ns = this.interactStates.get(entity)?.nodeStates;
    if (entry.mode === 'screen') this._renderScreenFrame(entity, entry.screen, comp, ns, this._activeTooltips.get(entity) ?? undefined);
    else this.renderWorld(entry.world, comp, ns);
  }

  /**
   * Toggle glow on any text-bearing node (label, textArea, button, toggle, inputField) and immediately re-render.
   * Called from scripts via `this.ui.setGlowEnabled(nodeId, enabled)`.
   */
  setNodeGlowEnabled(entity: EntityId, nodeId: string, enabled: boolean): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    const compiled = entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
    const node = compiled.nodeById.get(nodeId);
    if (!node) return;
    if (!node.style) (node as any).style = {};
    (node.style as any).glowEnabled = enabled;
    const comp = this.engine.ecs.getComponent<FuiComponent>(entity, 'Fui');
    if (!comp) return;
    if (comp._inlineDoc) this._patchDocNodeStyleProp(comp._inlineDoc as FuiDocument, nodeId, 'glowEnabled', enabled);
    const ns = this.interactStates.get(entity)?.nodeStates;
    if (entry.mode === 'screen') this._renderScreenFrame(entity, entry.screen, comp, ns, this._activeTooltips.get(entity) ?? undefined);
    else this.renderWorld(entry.world, comp, ns);
  }

  /**
   * Set glow color on any text-bearing node (label, textArea, button, toggle, inputField) and immediately re-render.
   * Called from scripts via `this.ui.setGlowColor(nodeId, color)`.
   */
  setNodeGlowColor(entity: EntityId, nodeId: string, color: string): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    const compiled = entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
    const node = compiled.nodeById.get(nodeId);
    if (!node) return;
    if (!node.style) (node as any).style = {};
    (node.style as any).glowColor = color;
    const comp = this.engine.ecs.getComponent<FuiComponent>(entity, 'Fui');
    if (!comp) return;
    if (comp._inlineDoc) this._patchDocNodeStyleProp(comp._inlineDoc as FuiDocument, nodeId, 'glowColor', color);
    const ns = this.interactStates.get(entity)?.nodeStates;
    if (entry.mode === 'screen') this._renderScreenFrame(entity, entry.screen, comp, ns, this._activeTooltips.get(entity) ?? undefined);
    else this.renderWorld(entry.world, comp, ns);
  }

  /**
   * Set glow strength (blur radius) on any text-bearing node (label, textArea, button, toggle, inputField) and immediately re-render.
   * Called from scripts via `this.ui.setGlowStrength(nodeId, strength)`.
   */
  setNodeGlowStrength(entity: EntityId, nodeId: string, strength: number): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    const compiled = entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
    const node = compiled.nodeById.get(nodeId);
    if (!node) return;
    if (!node.style) (node as any).style = {};
    (node.style as any).glowStrength = strength;
    const comp = this.engine.ecs.getComponent<FuiComponent>(entity, 'Fui');
    if (!comp) return;
    if (comp._inlineDoc) this._patchDocNodeStyleProp(comp._inlineDoc as FuiDocument, nodeId, 'glowStrength', strength);
    const ns = this.interactStates.get(entity)?.nodeStates;
    if (entry.mode === 'screen') this._renderScreenFrame(entity, entry.screen, comp, ns, this._activeTooltips.get(entity) ?? undefined);
    else this.renderWorld(entry.world, comp, ns);
  }

  /** Handle mousedown on any interactable node. */
  private _handleInteractablePress(
    entity: EntityId,
    hit: FuiCompiledNode,
    entry: Entry,
    comp: FuiComponent,
    ist: ButtonInteractState,
    mode: 'screen' | 'world',
  ): void {
    ist.pressedId = hit.id;
    ist.nodeStates.set(hit.id, { hover: ist.hoveredId === hit.id, active: true });
    if (hit.type === 'slider') {
      // Start slider drag
      const canvasRect = getCanvasRect(this.engine.config.canvas);
      const compiled = mode === 'screen' ? (entry as any).screen?.compiled : (entry as any).world?.compiled;
      const _sliderCs = compiled ? this._computeContentScale(compiled.doc) : 1;
      this._sliderDrag = {
        entity,
        nodeId: hit.id,
        startMouseX: this.input.mousePosition.x - canvasRect.left,
        startMouseY: this.input.mousePosition.y - canvasRect.top,
        startValue:  typeof hit.value === 'number' ? hit.value : 0,
        min:         typeof hit.min   === 'number' ? hit.min   : 0,
        max:         typeof hit.max   === 'number' ? hit.max   : 1,
        direction:   (hit.direction as 'horizontal' | 'vertical') ?? 'horizontal',
        rectX: hit.rect.x, rectY: hit.rect.y,
        rectW: hit.rect.w, rectH: hit.rect.h,
        contentScale: _sliderCs,
      };
      // inputField and slider do NOT queue pendingClick (no confirm-on-release needed)
    } else if (hit.type === 'inputField') {
      // Emit click immediately — script handles focus
      this.engine.events.emit('ui:click', { entity, elementId: hit.id, mode });
    } else {
      // button / toggle → confirm on release
      this.pendingClick = { entity, elementId: hit.id };
    }
    if (mode === 'screen') this._renderScreenFrame(entity, (entry as any).screen, comp, ist.nodeStates, this._activeTooltips.get(entity) ?? undefined);
    else this.renderWorld((entry as any).world, comp, ist.nodeStates);
  }

  /** Patch a boolean `value` field on a node inside the inline/source document. */
  private _patchDocNodeValue(comp: FuiComponent, nodeId: string, value: boolean): void {
    if (comp._inlineDoc) this._walkPatchValue(comp._inlineDoc as FuiDocument, nodeId, value);
  }

  private _walkPatchValue(doc: FuiDocument, nodeId: string, value: boolean): void {
    const walk = (node: any): boolean => {
      if (node.id === nodeId) { node.value = value; return true; }
      for (const child of node.children ?? []) { if (walk(child)) return true; }
      return false;
    };
    walk(doc.root);
  }

  private _patchDocNodeStyleProp(doc: FuiDocument, nodeId: string, key: string, value: unknown): void {
    const walk = (node: FuiNode): boolean => {
      if (node.id === nodeId) {
        const n = node as any;
        n.style = n.style ?? {};
        n.style[key] = value;
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

  /** Patch any top-level property on a node inside the inline/source document. */
  private _patchDocNodeProp(doc: FuiDocument, nodeId: string, key: string, value: unknown): void {
    const walk = (node: FuiNode): boolean => {
      if (node.id === nodeId) {
        (node as any)[key] = value;
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

  /**
   * Change the image source of an image or button node and immediately re-render.
   * For image nodes sets `src`; for button nodes sets `image`.
   * Called from scripts via `this.ui.setImage(nodeId, path)`.
   */
  setNodeImage(entity: EntityId, nodeId: string, src: string): void {
    const entry = this.entries.get(entity);
    if (!entry) return;
    const compiled = entry.mode === 'screen' ? entry.screen.compiled : entry.world.compiled;
    const node = compiled.nodeById.get(nodeId);
    if (!node) return;
    const prop = node.type === 'button' ? 'image' : 'src';
    (node as any)[prop] = src || undefined;
    const comp = this.engine.ecs.getComponent<FuiComponent>(entity, 'Fui');
    if (!comp) return;
    if (comp._inlineDoc) this._patchDocNodeProp(comp._inlineDoc as FuiDocument, nodeId, prop, src || undefined);
    // Preload the new image before re-rendering
    if (src) {
      preloadFuiImages(compiled, (s) => resolveFuiPath(s), () => {
        const ns2 = this.interactStates.get(entity)?.nodeStates;
        const comp2 = this.engine.ecs.getComponent<FuiComponent>(entity, 'Fui');
        if (!comp2) return;
        const entry2 = this.entries.get(entity);
        if (!entry2) return;
        if (entry2.mode === 'screen') this._renderScreenFrame(entity, entry2.screen, comp2, ns2, this._activeTooltips.get(entity) ?? undefined);
        else this.renderWorld(entry2.world, comp2, ns2);
      });
    }
    const ns = this.interactStates.get(entity)?.nodeStates;
    if (entry.mode === 'screen') this._renderScreenFrame(entity, entry.screen, comp, ns, this._activeTooltips.get(entity) ?? undefined);
    else this.renderWorld(entry.world, comp, ns);
  }
}

