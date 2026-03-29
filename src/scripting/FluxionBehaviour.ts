// ============================================================
// FluxionJS V3 — FluxionBehaviour Base Class
// Clean, Unity-style scripting API covering all engine systems.
// Injected into script execution scope by ScriptSystem.
//
// Lifecycle (override in subclass):
//   start()         → called once before the first update()
//   update(dt)      → called every frame
//   fixedUpdate(dt) → called at physics fixed timestep
//   lateUpdate(dt)  → called after all update() calls
//   onDestroy()     → called when entity/scene is destroyed
//   onEnable()      → called when script becomes enabled
//   onDisable()     → called when script becomes disabled
// ============================================================

import { getPlatformBridge } from '../platform/PlatformBridge';
import type { EntityId, ECSManager } from '../core/ECS';
import { markDirty } from '../core/ECS';
import type { Engine } from '../core/Engine';
import type { InputManager } from '../input/InputManager';
import type { FluxionRenderer } from '../renderer/Renderer';
import type { AudioSystem } from '../audio/AudioSystem';
import type { TransformComponent } from '../core/Components';
import { FuiComponent } from '../core/Components';
import { DebugConsole } from '../core/DebugConsole';
import { DebugDraw } from '../renderer/DebugDraw';

/** @internal — apply a loaded THREE.Texture to a material slot or visual material uniform. */
function _applyTexture(mat: any, slot: string, tex: any): void {
  if (!mat || !tex) return;
  const uniforms = mat._visualMatUniforms;
  if (uniforms?.[slot] !== undefined) {
    uniforms[slot].value = tex;
  } else {
    mat[slot] = tex;
    mat.needsUpdate = true;
  }
}

// Pre-bound DebugDraw references — created once at module load, not per getter call.
const _ddBindings = {
  drawLine:       DebugDraw.drawLine.bind(DebugDraw),
  drawLineWorld:  DebugDraw.drawLineWorld.bind(DebugDraw),
  drawLineSphere: DebugDraw.drawLineSphere.bind(DebugDraw),
  drawLineBox:    DebugDraw.drawLineBox.bind(DebugDraw),
  drawCross:      DebugDraw.drawCross.bind(DebugDraw),
  drawText:       DebugDraw.drawText.bind(DebugDraw),
};

export { EntityId, ECSManager, Engine, InputManager };
export { FuiRef } from './FuiRef';
export { MaterialRef } from './MaterialRef';
export { TextureRef } from './TextureRef';

export class FluxionBehaviour {
  // ── Injected by ScriptSystem (underscore prefix = hidden from Inspector) ──

  /** The entity ID this script is attached to. */
  entity!: EntityId;

  /** @internal */ _ecs!: ECSManager;
  /** @internal */ _engine!: Engine;
  /** @internal */ _input!: InputManager;
  /** @internal */ _renderer!: FluxionRenderer;
  /** @internal */ _audio!: AudioSystem | null;
  /** @internal */ _cleanupFns: (() => void)[] = [];
  /** @internal */ _coroutines: Map<symbol, { gen: Generator; waitUntil: number }> = new Map();
  /** @internal — false until start() has been called in this play session. */ _started = false;

  // ── Convenience getters ──────────────────────────────────────

  /** The engine time object — deltaTime, elapsed, fps, etc. */
  get Time() { return this._engine.time; }

  /** @deprecated Use Time (capital T) */
  get time() { return this._engine.time; }

  /** The global event bus. */
  get events() { return this._engine.events; }

  /** The input manager — keyboard, mouse, gamepad. */
  get Input() { return this._input; }

  /** The Transform component of this entity (shortcut). */
  get transform(): TransformComponent | null {
    return this._ecs.getComponent<TransformComponent>(this.entity, 'Transform') ?? null;
  }

  /** The entity ID this script is attached to (alias for readability). */
  get gameObject() {
    const ecs     = this._ecs;
    const engine  = this._engine;
    const entity  = this.entity;
    const self    = this;
    return {
      get id()      { return entity; },
      get name()    { return ecs.getEntityName(entity); },
      set name(v)   { ecs.setEntityName(entity, v); },
      get enabled() { return (ecs as any).isEntityEnabled?.(entity) ?? true; },
      set enabled(v){ (ecs as any).setEntityEnabled?.(entity, v); },
      get transform() {
        return ecs.getComponent<TransformComponent>(entity, 'Transform') ?? null;
      },
      getComponent: <T>(typeId: string): T | null =>
        (ecs.getComponent<any>(entity, typeId) as T) ?? null,
      hasComponent: (typeId: string): boolean =>
        ecs.hasComponent(entity, typeId),
      addComponent: <T>(comp: any): T =>
        ecs.addComponent(entity, comp),
      removeComponent: (typeId: string): void =>
        ecs.removeComponent(entity, typeId),
      get parent() {
        const pid = ecs.getParent(entity);
        return pid !== undefined ? pid : null;
      },
      get children() {
        return ecs.getChildren(entity);
      },
      addTag:    (tag: string) => ecs.addTag(entity, tag),
      hasTag:    (tag: string) => ecs.hasTag(entity, tag),
      find:      (name: string) => {
        for (const e of ecs.getAllEntities()) {
          if (ecs.getEntityName(e) === name) return e;
        }
        return undefined;
      },
      findAll:   (tag: string) => ecs.getEntitiesWithTag(tag),
      destroy:   () => ecs.destroyEntity(entity),
    };
  }

  /** Physics world access — raycast, forces, gravity, CharacterController. */
  get Physics() {
    const world = (this._engine as any).getSubsystem?.('physics') as any;
    const eid = this.entity;
    return {
      raycast: (origin: import('three').Vector3, direction: import('three').Vector3, maxDist = 100) =>
        world?.raycast(origin, direction, maxDist) ?? null,
      setGravity: (x: number, y: number, z: number) =>
        world?.setGravity(x, y, z),
      applyForce: (force: import('three').Vector3) =>
        world?.applyForce(eid, force),
      applyImpulse: (impulse: import('three').Vector3) =>
        world?.applyImpulse(eid, impulse),
      applyTorque: (torque: import('three').Vector3) =>
        world?.applyTorque(eid, torque),
      setVelocity: (velocity: import('three').Vector3) =>
        world?.setVelocity(eid, velocity),
      getVelocity: (): import('three').Vector3 =>
        world?.getVelocity(eid) ?? new (require('three').Vector3)(),
      // CharacterController helpers
      move: (x: number, z: number) =>
        world?.ccMove(eid, x, z),
      jump: () =>
        world?.ccJump(eid),
      isGrounded: (): boolean =>
        world?.ccIsGrounded(eid) ?? false,
      crouch: (state: boolean) =>
        world?.ccSetCrouch(eid, state),
      isCrouching: (): boolean =>
        world?.ccIsCrouching(eid) ?? false,
      setRunning: (state: boolean) =>
        world?.ccSetRunning(eid, state),
    };
  }

  /** Scene management — load scenes, get current name. */
  get Scene() {
    return {
      get name(): string { return (this as any)._engine?.currentSceneName ?? ''; },
      getName: (): string => (this._engine as any).currentSceneName ?? '',
      load: (path: string) => this._engine.events.emit('scene:load-request', path),
    };
  }

  /** Application info and control. */
  get Application() {
    const eng = this._engine as any;
    return {
      get fps()      { return eng?.time?.fps ?? 0; },
      get isEditor() { return getPlatformBridge()?.isEditor ?? false; },
      get platform() { return 'electron'; },
      quit:          () => { getPlatformBridge()?.close?.(); },
    };
  }

  // ── Component access ─────────────────────────────────────────

  getComponent<T>(type: string): T | null {
    return (this._ecs.getComponent<any>(this.entity, type) as T) ?? null;
  }

  getComponentOf<T>(entity: EntityId, type: string): T | null {
    return (this._ecs.getComponent<any>(entity, type) as T) ?? null;
  }

  hasComponent(type: string): boolean {
    return this._ecs.hasComponent(this.entity, type);
  }

  addComponent<T extends import('../core/ECS').Component>(component: T): T {
    return this._ecs.addComponent(this.entity, component);
  }

  removeComponent(type: string): void {
    this._ecs.removeComponent(this.entity, type);
  }

  // ── Scene queries ────────────────────────────────────────────

  find(name: string): EntityId | undefined {
    for (const e of this._ecs.getAllEntities()) {
      if (this._ecs.getEntityName(e) === name) return e;
    }
    return undefined;
  }

  findWithTag(tag: string): EntityId | undefined {
    return this._ecs.getEntitiesWithTag(tag)[0];
  }

  findAll(tag: string): EntityId[] {
    return this._ecs.getEntitiesWithTag(tag);
  }

  query(...componentTypes: string[]): EntityId[] {
    return this._ecs.query(...componentTypes);
  }

  // ── Entity hierarchy ─────────────────────────────────────────

  getParent(entity?: EntityId): EntityId | undefined {
    return this._ecs.getParent(entity ?? this.entity);
  }

  getChildren(entity?: EntityId): ReadonlySet<EntityId> {
    return this._ecs.getChildren(entity ?? this.entity);
  }

  // ── Entity lifecycle ─────────────────────────────────────────

  createEntity(name?: string): EntityId {
    return this._ecs.createEntity(name);
  }

  destroy(entity?: EntityId): void {
    this._ecs.destroyEntity(entity ?? this.entity);
  }

  getName(entity?: EntityId): string {
    return this._ecs.getEntityName(entity ?? this.entity);
  }

  setName(name: string, entity?: EntityId): void {
    this._ecs.setEntityName(entity ?? this.entity, name);
  }

  // ── Tags ─────────────────────────────────────────────────────

  addTag(tag: string, entity?: EntityId): void {
    this._ecs.addTag(entity ?? this.entity, tag);
  }

  hasTag(tag: string, entity?: EntityId): boolean {
    return this._ecs.hasTag(entity ?? this.entity, tag);
  }

  // ── Events ───────────────────────────────────────────────────

  on<T = any>(event: string, callback: (data: T) => void, priority = 0): void {
    const unsub = this._engine.events.on<T>(event, callback, priority);
    this._cleanupFns.push(unsub);
  }

  once<T = any>(event: string, callback: (data: T) => void, priority = 0): void {
    const unsub = this._engine.events.once<T>(event, callback, priority);
    this._cleanupFns.push(unsub);
  }

  emit<T = any>(event: string, data?: T): void {
    this._engine.events.emit<T>(event, data);
  }

  // ── Coroutines ───────────────────────────────────────────────

  startCoroutine(gen: Generator): symbol {
    const id = Symbol();
    this._coroutines.set(id, { gen, waitUntil: 0 });
    return id;
  }

  stopCoroutine(id: symbol): void {
    this._coroutines.delete(id);
  }

  // ── FUI (Fluxion UI) ─────────────────────────────────────────

  get ui() {
    const ecs      = this._ecs;
    const engine   = this._engine;
    const entity   = this.entity;
    const cleanups = this._cleanupFns;
    const getComp  = () => ecs.getComponent<any>(entity, 'Fui');
    const getRT    = () => ecs.getSystem<any>('FuiRuntime');

    return {
      load(path: string): void {
        let c = getComp();
        if (!c) c = ecs.addComponent(entity, new FuiComponent());
        c.fuiPath = path;
        c._inlineDoc = undefined;
        markDirty(c);
      },
      create(doc: unknown): void {
        let c = getComp();
        if (!c) c = ecs.addComponent(entity, new FuiComponent());
        c._inlineDoc = doc;
        c.fuiPath = '';
        markDirty(c);
      },
      setText(nodeId: string, text: string): void {
        getRT()?.setNodeText?.(entity, nodeId, text);
      },
      show(): void  { const c = getComp(); if (c) c.enabled = true; },
      hide(): void  { const c = getComp(); if (c) c.enabled = false; },
      setVisible(v: boolean): void { const c = getComp(); if (c) c.enabled = v; },
      playAnimation(id: string): void  { const c = getComp(); if (c) c.playAnimation = id; },
      stopAnimation(): void            { const c = getComp(); if (c) c.playAnimation = ''; },
      setScreenPosition(x: number, y: number): void {
        const c = getComp();
        if (c) { c.screenX = x; c.screenY = y; }
      },
      onButtonClick(elementId: string, cb: () => void): void {
        const unsub = engine.events.on<{ entity: number; elementId: string }>(
          'ui:click',
          (d) => { if (d.entity === entity && d.elementId === elementId) cb(); },
        );
        cleanups.push(unsub);
      },
      onAnyClick(cb: (elementId: string) => void): void {
        const unsub = engine.events.on<{ entity: number; elementId: string }>(
          'ui:click',
          (d) => { if (d.entity === entity) cb(d.elementId); },
        );
        cleanups.push(unsub);
      },
    };
  }

  // ── Materials ─────────────────────────────────────────────────

  get mat() {
    const ecs    = this._ecs;
    const engine = this._engine;
    const entity = this.entity;

    /** Resolve a MeshRenderer mesh's material at a given slot index. */
    function getMeshMaterial(targetEntity: EntityId, slotIndex = 0): any | null {
      const mr = ecs.getComponent<any>(targetEntity, 'MeshRenderer');
      if (!mr?.mesh) return null;
      const meshes: any[] = [];
      const mesh = mr.mesh;
      if (mesh.isMesh) {
        meshes.push(mesh);
      } else if (mesh.isGroup || mesh.isObject3D) {
        mesh.traverse((c: any) => { if (c.isMesh) meshes.push(c); });
      }
      const target = meshes[slotIndex] ?? meshes[0];
      if (!target) return null;
      return Array.isArray(target.material) ? target.material[0] : target.material;
    }

    return {
      /**
       * Get the live THREE.js material from this entity's MeshRenderer.
       * @param slotIndex  Sub-mesh index for multi-material models (default 0).
       */
      get(slotIndex = 0): any | null {
        return getMeshMaterial(entity, slotIndex);
      },

      /**
       * Get a material from any entity's MeshRenderer.
       */
      getFrom(targetEntity: EntityId, slotIndex = 0): any | null {
        return getMeshMaterial(targetEntity, slotIndex);
      },

      /**
       * Asynchronously load a material from a MaterialRef or path string.
       * Returns the THREE.js material instance.
       */
      async load(ref: import('./MaterialRef').MaterialRef | string): Promise<any | null> {
        const matPath = typeof ref === 'string' ? ref : ref.path;
        if (!matPath) return null;
        try {
          const { projectManager } = await import('../project/ProjectManager');
          const { getFileSystem: getFs } = await import('../filesystem');
          const assets   = engine.getSubsystem('assets') as any;
          const mats     = engine.getSubsystem('materials') as any;
          if (!assets || !mats) return null;
          const absPath = projectManager.resolvePath(matPath);
          const matDir  = absPath.substring(0, Math.max(absPath.lastIndexOf('/'), absPath.lastIndexOf('\\')));
          const loadTexture = async (relPath: string): Promise<any> => {
            let texAbs = (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://'))
              ? relPath : `${matDir}/${relPath}`;
            const url = texAbs.startsWith('file://') ? texAbs : `file:///${texAbs.replace(/\\/g, '/')}`;
            return assets.loadTexture(url);
          };
          if (matPath.endsWith('.fluxvismat')) {
            const data = await assets.loadAsset(absPath, 'visual_material');
            if (!data) return null;
            return mats.createFromVisualMat(data, loadTexture, matPath);
          } else {
            const data = await assets.loadAsset(absPath, 'material');
            if (!data) return null;
            return mats.createFromFluxMat(data, loadTexture, matPath);
          }
        } catch { return null; }
      },

      /**
       * Apply a loaded THREE.js material to a MeshRenderer entity.
       * @param targetEntity  The entity with a MeshRenderer component.
       * @param material      The THREE.js material to apply.
       * @param slotIndex     Sub-mesh slot for multi-material models (default: all meshes).
       */
      apply(targetEntity: EntityId, material: any, slotIndex?: number): void {
        const mr = ecs.getComponent<any>(targetEntity, 'MeshRenderer');
        if (!mr?.mesh) return;
        const meshes: any[] = [];
        const mesh = mr.mesh;
        if (mesh.isMesh) { meshes.push(mesh); }
        else { mesh.traverse((c: any) => { if (c.isMesh) meshes.push(c); }); }
        if (slotIndex !== undefined) {
          const m = meshes[slotIndex];
          if (m) m.material = material;
        } else {
          for (const m of meshes) m.material = material;
        }
      },

      // ── PBR property setters ───────────────────────────────

      /** Set the albedo/base color (r, g, b in 0–1 range or CSS hex string). */
      setColor(mat: any, r: number | string, g?: number, b?: number): void {
        if (!mat?.color) return;
        if (typeof r === 'string') { mat.color.set(r); }
        else { mat.color.setRGB(r, g ?? 0, b ?? 0); }
      },

      /** Set roughness (0 = mirror, 1 = fully rough). */
      setRoughness(mat: any, value: number): void {
        if (mat) mat.roughness = value;
      },

      /** Set metalness (0 = dielectric, 1 = metal). */
      setMetalness(mat: any, value: number): void {
        if (mat) mat.metalness = value;
      },

      /** Set opacity (also enables transparency when < 1). */
      setOpacity(mat: any, value: number): void {
        if (!mat) return;
        mat.opacity = value;
        mat.transparent = value < 1;
      },

      /** Set emissive color (r, g, b in 0–1 range or CSS hex). */
      setEmissive(mat: any, r: number | string, g?: number, b?: number): void {
        if (!mat?.emissive) return;
        if (typeof r === 'string') { mat.emissive.set(r); }
        else { mat.emissive.setRGB(r, g ?? 0, b ?? 0); }
      },

      /** Set emissive intensity multiplier. */
      setEmissiveIntensity(mat: any, value: number): void {
        if (mat) mat.emissiveIntensity = value;
      },

      /** Set wireframe mode. */
      setWireframe(mat: any, value: boolean): void {
        if (mat) mat.wireframe = value;
      },

      // ── Visual material uniform setters ───────────────────

      /** Set a float uniform on a visual (.fluxvismat) material. */
      setFloat(mat: any, name: string, value: number): void {
        const u = mat?._visualMatUniforms;
        if (u?.[name]) u[name].value = value;
      },

      /** Set a vec2 uniform on a visual material. */
      setVec2(mat: any, name: string, x: number, y: number): void {
        const u = mat?._visualMatUniforms;
        if (u?.[name]) { u[name].value.x = x; u[name].value.y = y; }
      },

      /** Set a vec3 uniform on a visual material. */
      setVec3(mat: any, name: string, x: number, y: number, z: number): void {
        const u = mat?._visualMatUniforms;
        if (u?.[name]) { u[name].value.x = x; u[name].value.y = y; u[name].value.z = z; }
      },

      /** Set a vec4 uniform on a visual material. */
      setVec4(mat: any, name: string, x: number, y: number, z: number, w: number): void {
        const u = mat?._visualMatUniforms;
        if (u?.[name]) { const v = u[name].value; v.x = x; v.y = y; v.z = z; v.w = w; }
      },

      /** Set a color (vec3) uniform on a visual material (r, g, b in 0–1). */
      setColorUniform(mat: any, name: string, r: number, g: number, b: number): void {
        const u = mat?._visualMatUniforms;
        if (u?.[name]) { u[name].value.x = r; u[name].value.y = g; u[name].value.z = b; }
      },

      /**
       * Load and assign a texture to a material map slot.
       *
       * For PBR materials (.fluxmat) use standard THREE slot names:
       *   'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'
       *
       * For visual materials (.fluxvismat) use the uniform name, e.g. 'u_albedo'.
       *
       * Also accepts a live THREE.Texture directly (skip loading when you already have one).
       */
      async setTexture(
        mat: any,
        slot: string,
        ref: import('./TextureRef').TextureRef | string | any,
      ): Promise<void> {
        if (!mat) return;
        // Accept a live THREE.Texture directly
        if (ref && typeof ref === 'object' && ref.isTexture) {
          _applyTexture(mat, slot, ref);
          return;
        }
        const texPath = typeof ref === 'string' ? ref : (ref as any).path;
        if (!texPath) return;
        try {
          const { projectManager: pm } = await import('../project/ProjectManager');
          const assets = engine.getSubsystem('assets') as any;
          if (!assets) return;
          const abs = pm.resolvePath(texPath);
          const url = abs.startsWith('file://') ? abs : `file:///${abs.replace(/\\/g, '/')}`;
          const tex = await assets.loadTexture(url);
          if (tex) _applyTexture(mat, slot, tex);
        } catch { /* texture not found — ignore */ }
      },
    };
  }

  // ── Camera ────────────────────────────────────────────────────

  get cam() {
    const ecs = this._ecs;

    return {
      /**
       * Enable render-to-texture on a camera entity.
       * After calling this, retrieve the texture with `getTexture(entity)`.
       * @param targetEntity  Entity with a CameraComponent.
       * @param width   Render target width in pixels (default 512).
       * @param height  Render target height in pixels (default 512).
       */
      enableRenderToTexture(targetEntity: EntityId, width = 512, height = 512): void {
        const c = ecs.getComponent<any>(targetEntity, 'Camera');
        if (!c) return;
        c.renderToTexture = true;
        c.rtWidth  = width;
        c.rtHeight = height;
      },

      /** Disable render-to-texture and free the render target. */
      disableRenderToTexture(targetEntity: EntityId): void {
        const c = ecs.getComponent<any>(targetEntity, 'Camera');
        if (!c) return;
        c.renderToTexture = false;
        if (c.renderTarget) {
          c.renderTarget.dispose();
          c.renderTarget = null;
        }
      },

      /**
       * Get the render texture produced by a camera that has render-to-texture enabled.
       * Returns null if the camera is not found or RTT is not enabled.
       */
      getTexture(targetEntity: EntityId): any | null {
        return ecs.getComponent<any>(targetEntity, 'Camera')?.renderTarget?.texture ?? null;
      },
    };
  }

  // ── Audio ────────────────────────────────────────────────────

  playSound(
    audioComp: import('../core/Components').AudioSourceComponent,
    position?: import('three').Vector3,
  ): void {
    if (!this._audio) return;
    this._audio.play(audioComp, position);
  }

  // ── Debug / Logging ──────────────────────────────────────────

  get Debug() {
    const name = this.constructor.name;
    return {
      log:   (...a: any[]) => DebugConsole.Log(`[${name}]`, ...a),
      warn:  (...a: any[]) => DebugConsole.LogWarning(`[${name}]`, ...a),
      error: (...a: any[]) => DebugConsole.LogError(`[${name}]`, ...a),
      Log:   (...a: any[]) => DebugConsole.Log(`[${name}]`, ...a),
      LogWarning: (...a: any[]) => DebugConsole.LogWarning(`[${name}]`, ...a),
      LogError:   (...a: any[]) => DebugConsole.LogError(`[${name}]`, ...a),
      ..._ddBindings,
    };
  }

  log(...args: any[]):   void { DebugConsole.Log(`[${this.constructor.name}]`, ...args); }
  warn(...args: any[]):  void { DebugConsole.LogWarning(`[${this.constructor.name}]`, ...args); }
  error(...args: any[]): void { DebugConsole.LogError(`[${this.constructor.name}]`, ...args); }

  // ── Lifecycle hooks (override in subclass) ────────────────────

  /** Called once when the script first activates (scene start or hot reload). */
  start?(): void | Promise<void>;

  /** Called every frame. dt is the frame delta time in seconds. */
  update?(dt: number): void;

  /** Called at a fixed timestep (physics rate). dt is fixedDeltaTime. */
  fixedUpdate?(dt: number): void;

  /** Called after all update() calls this frame. */
  lateUpdate?(dt: number): void;

  /** Called when the entity is destroyed or the scene is cleared. */
  onDestroy?(): void;

  /** Called when this script instance becomes enabled. */
  onEnable?(): void;

  /** Called when this script instance becomes disabled. */
  onDisable?(): void;
}
