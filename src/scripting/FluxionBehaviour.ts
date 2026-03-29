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
import { DebugConsole } from '../core/DebugConsole';

export { EntityId, ECSManager, Engine, InputManager };

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
        const c = getComp();
        if (!c) return;
        c.fuiPath = path;
        c._inlineDoc = undefined;
        markDirty(c);
      },
      create(doc: unknown): void {
        const c = getComp();
        if (!c) return;
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
