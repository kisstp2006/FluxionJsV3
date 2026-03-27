import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { ECSManager, EntityId, System, clearDirty, isDirty } from '../core/ECS';
import { MouseButton, InputManager } from '../input/InputManager';
import { FluxionRenderer } from '../renderer/Renderer';
import { projectManager } from '../project/ProjectManager';
import { getFileSystem } from '../filesystem';
import { FuiComponent } from '../core/Components';
import { compileFui, hitTestFuiButtons, renderCompiledFuiToCanvas } from './FuiRenderer';
import type { FuiCompiled, FuiCompiledNode } from './FuiRenderer';
import { parseFuiJson } from './FuiParser';

type PendingClick = {
  entity: EntityId;
  elementId: string;
};

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

  private parentEl: HTMLElement | null = null;

  constructor(
    private engine: Engine,
    private renderer: FluxionRenderer,
    private input: InputManager,
  ) {}

  onSceneClear(): void {
    this.pendingClick = null;

    for (const [, entry] of this.entries) {
      if (entry.mode === 'screen') {
        entry.screen.overlayCanvas.remove();
      } else {
        entry.world.texture.dispose();
        if (entry.world.mesh.parent) entry.world.mesh.parent.remove(entry.world.mesh);
      }
    }

    this.entries.clear();
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

  private ensureScreenEntry(entity: EntityId, comp: FuiComponent, compiled: FuiCompiled): ScreenEntry {
    const entry = this.entries.get(entity);
    if (entry && entry.mode === 'screen') return entry.screen;

    const parent = this.ensureParentEl();
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.left = `${comp.screenX}px`;
    overlayCanvas.style.top = `${comp.screenY}px`;
    overlayCanvas.style.width = `${comp.screenWidth}px`;
    overlayCanvas.style.height = `${comp.screenHeight}px`;
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.zIndex = '50';

    parent.appendChild(overlayCanvas);
    const overlayCtx = overlayCanvas.getContext('2d')!;

    // We render into an offscreen buffer in document pixels, then scale to overlay.
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = compiled.doc.canvas.width;
    offscreenCanvas.height = compiled.doc.canvas.height;
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

    this.renderer.addObject(entity, mesh);

    const worldEntry: WorldEntry = { offscreenCanvas, offscreenCtx, texture, mesh, compiled };
    this.entries.set(entity, { mode: 'world', world: worldEntry });
    return worldEntry;
  }

  private renderScreen(entry: ScreenEntry, comp: FuiComponent): void {
    const { compiled } = entry;
    const { doc } = compiled;

    const w = Math.max(1, comp.screenWidth);
    const h = Math.max(1, comp.screenHeight);

    // Resize overlay when needed (avoid clearing/alloc every frame if sizes are stable)
    if (entry.overlayCanvas.width !== Math.floor(w) || entry.overlayCanvas.height !== Math.floor(h)) {
      entry.overlayCanvas.width = Math.floor(w);
      entry.overlayCanvas.height = Math.floor(h);
    }

    const scaleX = w / doc.canvas.width;
    const scaleY = h / doc.canvas.height;

    // Draw to offscreen first in doc pixels (so hit-testing stays stable),
    // then scale to overlay canvas.
    renderCompiledFuiToCanvas(entry.compiled, entry.offscreenCtx, { scaleX: 1, scaleY: 1 });

    entry.overlayCtx.clearRect(0, 0, entry.overlayCanvas.width, entry.overlayCanvas.height);
    entry.overlayCtx.drawImage(entry.offscreenCanvas, 0, 0, entry.overlayCanvas.width, entry.overlayCanvas.height);

    // Optional: for debugging we'd render outlines. MVP keeps it simple.
  }

  private renderWorld(entry: WorldEntry, comp: FuiComponent): void {
    const { compiled } = entry;
    renderCompiledFuiToCanvas(compiled, entry.offscreenCtx, { scaleX: 1, scaleY: 1 });
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
    const parent = this.ensureParentEl();
    const parentRect = parent.getBoundingClientRect();

    const px = this.input.mousePosition.x - parentRect.left - comp.screenX;
    const py = this.input.mousePosition.y - parentRect.top - comp.screenY;

    if (px < 0 || py < 0 || px > comp.screenWidth || py > comp.screenHeight) return null;

    const docX = px * compiled.doc.canvas.width / Math.max(1, comp.screenWidth);
    const docY = py * compiled.doc.canvas.height / Math.max(1, comp.screenHeight);

    return hitTestFuiButtons(compiled, docX, docY);
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
    // We run asynchronous document loads only when components are dirty.
    for (const entity of entities) {
      const comp = ecs.getComponent<FuiComponent>(entity, 'Fui');
      if (!comp || !comp.enabled) continue;
      const dirty = isDirty(comp);

      // Document is loaded lazily (and reloaded on property dirty).
      const existing = this.entries.get(entity);

      if (!existing || dirty) {
        // Fire-and-forget: load document and rebuild entry on resolve.
        const fuiPath = comp.fuiPath;
        if (!fuiPath) continue;

        void this.loadDocument(fuiPath).then(({ compiled }) => {
          if (!ecs.entityExists(entity)) return;

          if (compiled.doc.mode === 'screen') {
            const screen = this.ensureScreenEntry(entity, comp, compiled);
            screen.compiled = compiled;
            screen.offscreenCanvas.width = compiled.doc.canvas.width;
            screen.offscreenCanvas.height = compiled.doc.canvas.height;
            this.renderScreen(screen, comp);
          } else {
            const world = this.ensureWorldEntry(entity, comp, compiled);
            world.compiled = compiled;

            // Update plane geometry to match configured world size.
            world.mesh.geometry.dispose();
            world.mesh.geometry = new THREE.PlaneGeometry(comp.worldWidth, comp.worldHeight);

            // Update offscreen canvas size to match the document.
            world.offscreenCanvas.width = compiled.doc.canvas.width;
            world.offscreenCanvas.height = compiled.doc.canvas.height;

            this.renderWorld(world, comp);
          }
          clearDirty(comp);
        }).catch(() => {
          // Ignore; will stay uninitialized.
        });
      } else if (existing.mode === 'screen') {
        const screen = existing.screen;
        // Reposition + redraw only when size changed.
        const overlay = screen.overlayCanvas;
        const w = Math.max(1, comp.screenWidth);
        const h = Math.max(1, comp.screenHeight);
        if (
          overlay.style.left !== `${comp.screenX}px` ||
          overlay.style.top !== `${comp.screenY}px` ||
          overlay.style.width !== `${comp.screenWidth}px` ||
          overlay.style.height !== `${comp.screenHeight}px`
        ) {
          overlay.style.left = `${comp.screenX}px`;
          overlay.style.top = `${comp.screenY}px`;
          overlay.style.width = `${comp.screenWidth}px`;
          overlay.style.height = `${comp.screenHeight}px`;
        }
        if (overlay.width !== Math.floor(w) || overlay.height !== Math.floor(h)) {
          this.renderScreen(screen, comp);
        }
      } else if (existing.mode === 'world') {
        const world = existing.world;
        // Billboard update
        const cam = this.renderer.getActiveCamera();
        if (comp.billboard && cam) world.mesh.quaternion.copy(cam.quaternion);
      }
    }

    // ── Interaction (simple click handling) ──
    const clicked = this.input.isMousePressed(MouseButton.Left);
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
        if (entry.mode === 'screen') {
          const hit = this.hitTestScreen(entry.screen.compiled, comp);
          if (hit?.type === 'button') {
            this.pendingClick = { entity, elementId: hit.id };
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
      this.pendingClick = null;
    }
  }
}

