// ============================================================
// FluxionJS V3 — FluxionScript Base Class
// Full Stride-inspired scripting API covering all engine systems.
// Injected into script execution scope by ScriptSystem.
// ============================================================

import type { EntityId, ECSManager } from './ECS';
import { markDirty } from './ECS';
import type { Engine } from './Engine';
import type { InputManager } from '../input/InputManager';
import type { FluxionRenderer } from '../renderer/Renderer';
import type { AudioSystem } from '../audio/AudioSystem';
import type { TransformComponent } from './Components';
import { DebugConsole } from './DebugConsole';

export { EntityId, ECSManager, Engine, InputManager };

/**
 * Base class for all FluxionJS scripts.
 *
 * Usage:
 *   export default class MyScript extends FluxionScript {
 *     speed = 5.0;
 *     onUpdate(dt: number) { ... }
 *   }
 *
 * All _-prefixed properties are injected by ScriptSystem at runtime and
 * are intentionally excluded from the Inspector property probe.
 */
export class FluxionScript {
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
  /** @internal — false until onStart() has been called in this play session. */ _started = false;

  // ── Convenience getters ──────────────────────────────────────

  /** The engine time object — deltaTime, elapsed, fps, etc. */
  get time() { return this._engine.time; }

  /** The global event bus. */
  get events() { return this._engine.events; }

  /** The input manager — keyboard, mouse, gamepad. */
  get input() { return this._input; }

  /** The Transform component of this entity (shortcut). */
  get transform(): TransformComponent | null {
    return this._ecs.getComponent<TransformComponent>(this.entity, 'Transform') ?? null;
  }

  /** Physics world access — raycast, forces, gravity, CharacterController. */
  get physics() {
    const world = (this._engine as any).getSubsystem?.('physics') as any;
    const eid = this.entity;
    return {
      /** Cast a ray and return the first hit. */
      raycast: (origin: import('three').Vector3, direction: import('three').Vector3, maxDist = 100) =>
        world?.raycast(origin, direction, maxDist) ?? null,

      /** Set world gravity. */
      setGravity: (x: number, y: number, z: number) =>
        world?.setGravity(x, y, z),

      /** Apply a continuous force to this entity's rigidbody (Newtons). */
      applyForce: (force: import('three').Vector3) =>
        world?.applyForce(eid, force),

      /** Apply an instant impulse to this entity's rigidbody. */
      applyImpulse: (impulse: import('three').Vector3) =>
        world?.applyImpulse(eid, impulse),

      /** Apply a torque to this entity's rigidbody. */
      applyTorque: (torque: import('three').Vector3) =>
        world?.applyTorque(eid, torque),

      /** Directly set the linear velocity of this entity's rigidbody. */
      setVelocity: (velocity: import('three').Vector3) =>
        world?.setVelocity(eid, velocity),

      /** Get the current linear velocity of this entity's rigidbody. */
      getVelocity: (): import('three').Vector3 =>
        world?.getVelocity(eid) ?? new (require('three').Vector3)(),

      // ── CharacterController helpers ───────────────────────────────────────
      // These are no-ops if the entity has no CharacterController component.

      /** Set horizontal movement input (world-space X/Z) for this frame. Call every frame. */
      move: (x: number, z: number) =>
        world?.ccMove(eid, x, z),

      /** Trigger a jump. Only takes effect when grounded (or within maxJumps). */
      jump: () =>
        world?.ccJump(eid),

      /** Whether the character is currently standing on solid ground. */
      isGrounded: (): boolean =>
        world?.ccIsGrounded(eid) ?? false,

      /** Enable or disable crouching. */
      crouch: (state: boolean) =>
        world?.ccSetCrouch(eid, state),

      /** Whether the character is currently crouching. */
      isCrouching: (): boolean =>
        world?.ccIsCrouching(eid) ?? false,

      /** Enable or disable running (uses runSpeed instead of walkSpeed). */
      setRunning: (state: boolean) =>
        world?.ccSetRunning(eid, state),
    };
  }

  /** Scene management — load scenes, get current name. */
  get scene() {
    return {
      getName: (): string => (this._engine as any).currentSceneName ?? '',
      load: (path: string) => this._engine.events.emit('scene:load-request', path),
    };
  }

  /** Application info and control. */
  get application() {
    const eng = this._engine as any;
    return {
      get fps()      { return eng?.time?.fps ?? 0; },
      get isEditor() { return true; },
      get platform() { return 'electron'; },
      quit:          () => { (window as any).fluxionAPI?.close?.(); },
    };
  }

  // ── Component access ─────────────────────────────────────────

  /**
   * Get a component from this entity.
   * @example const rb = this.getComponent<RigidbodyComponent>('Rigidbody');
   */
  getComponent<T>(type: string): T | null {
    return (this._ecs.getComponent<any>(this.entity, type) as T) ?? null;
  }

  /**
   * Get a component from any entity.
   * @example const tf = this.getComponentOf<TransformComponent>(otherId, 'Transform');
   */
  getComponentOf<T>(entity: EntityId, type: string): T | null {
    return (this._ecs.getComponent<any>(entity, type) as T) ?? null;
  }

  /** Check whether this entity has a component. */
  hasComponent(type: string): boolean {
    return this._ecs.hasComponent(this.entity, type);
  }

  /** Add a component to this entity. */
  addComponent<T extends import('./ECS').Component>(component: T): T {
    return this._ecs.addComponent(this.entity, component);
  }

  /** Remove a component from this entity by type name. */
  removeComponent(type: string): void {
    this._ecs.removeComponent(this.entity, type);
  }

  // ── Scene queries ────────────────────────────────────────────

  /**
   * Find the first entity with a given name. Returns undefined if not found.
   * @example const enemy = this.find('Enemy_01');
   */
  find(name: string): EntityId | undefined {
    for (const e of this._ecs.getAllEntities()) {
      if (this._ecs.getEntityName(e) === name) return e;
    }
    return undefined;
  }

  /**
   * Find the first entity with a given tag. Returns undefined if not found.
   * @example const player = this.findWithTag('Player');
   */
  findWithTag(tag: string): EntityId | undefined {
    return this._ecs.getEntitiesWithTag(tag)[0];
  }

  /**
   * Find all entities with a given tag.
   * @example const enemies = this.findAll('Enemy');
   */
  findAll(tag: string): EntityId[] {
    return this._ecs.getEntitiesWithTag(tag);
  }

  /** Query all entities that have all of the given component types. */
  query(...componentTypes: string[]): EntityId[] {
    return this._ecs.query(...componentTypes);
  }

  // ── Entity hierarchy ─────────────────────────────────────────

  /** Get the parent entity, or undefined if root. */
  getParent(entity?: EntityId): EntityId | undefined {
    return this._ecs.getParent(entity ?? this.entity);
  }

  /** Get all direct children of an entity (defaults to this entity). */
  getChildren(entity?: EntityId): ReadonlySet<EntityId> {
    return this._ecs.getChildren(entity ?? this.entity);
  }

  // ── Entity lifecycle ─────────────────────────────────────────

  /**
   * Create a new entity in the scene.
   * @example const e = this.createEntity('Bullet');
   */
  createEntity(name?: string): EntityId {
    return this._ecs.createEntity(name);
  }

  /**
   * Destroy an entity (and all its children). Defaults to this entity.
   * @example this.destroy(); // destroys self
   */
  destroy(entity?: EntityId): void {
    this._ecs.destroyEntity(entity ?? this.entity);
  }

  /** Get or set the name of an entity (defaults to this entity). */
  getName(entity?: EntityId): string {
    return this._ecs.getEntityName(entity ?? this.entity);
  }

  setName(name: string, entity?: EntityId): void {
    this._ecs.setEntityName(entity ?? this.entity, name);
  }

  // ── Tags ─────────────────────────────────────────────────────

  /** Add a tag to this entity. */
  addTag(tag: string, entity?: EntityId): void {
    this._ecs.addTag(entity ?? this.entity, tag);
  }

  /** Check whether this entity has a tag. */
  hasTag(tag: string, entity?: EntityId): boolean {
    return this._ecs.hasTag(entity ?? this.entity, tag);
  }

  // ── Events ───────────────────────────────────────────────────

  /**
   * Subscribe to an engine event. The listener is auto-unsubscribed on destroy.
   * @example this.on('player:died', (data) => { ... });
   */
  on<T = any>(event: string, callback: (data: T) => void, priority = 0): void {
    const unsub = this._engine.events.on<T>(event, callback, priority);
    this._cleanupFns.push(unsub);
  }

  /**
   * Subscribe to an engine event once. Auto-cleaned on destroy if not fired.
   */
  once<T = any>(event: string, callback: (data: T) => void, priority = 0): void {
    const unsub = this._engine.events.once<T>(event, callback, priority);
    this._cleanupFns.push(unsub);
  }

  /**
   * Emit an engine event.
   * @example this.emit('player:scored', { points: 100 });
   */
  emit<T = any>(event: string, data?: T): void {
    this._engine.events.emit<T>(event, data);
  }

  // ── Coroutines ───────────────────────────────────────────────

  /**
   * Start a generator-based coroutine.
   * Supported yield values:
   *   yield;                // resume next frame
   *   yield { seconds: 2 }; // wait 2 real seconds
   *   yield { frames: 10 }; // wait N frames
   * @returns A symbol handle that can be passed to stopCoroutine().
   */
  startCoroutine(gen: Generator): symbol {
    const id = Symbol();
    this._coroutines.set(id, { gen, waitUntil: 0 });
    return id;
  }

  /** Stop a coroutine by the handle returned from startCoroutine(). */
  stopCoroutine(id: symbol): void {
    this._coroutines.delete(id);
  }

  // ── FUI (Fluxion UI) ─────────────────────────────────────────

  /**
   * Fluent API for the FuiComponent on this entity.
   * The entity must have a FuiComponent added in the editor (or via addComponent).
   *
   * @example
   *   // Load a .fui file
   *   this.ui.load('UI/HUD.fui');
   *
   *   // Update a label
   *   this.ui.setText('score_label', `Score: ${this.score}`);
   *
   *   // React to button clicks
   *   this.ui.onButtonClick('play_btn', () => this.startGame());
   */
  get ui() {
    const ecs = this._ecs;
    const engine = this._engine;
    const entity = this.entity;

    const cleanupFns = this._cleanupFns;
    const getComp   = () => ecs.getComponent<any>(entity, 'Fui');
    const getRuntime = () => ecs.getSystem<any>('FuiRuntime');

    return {
      /** Load a .fui file. Replaces any inline document. */
      load(path: string): void {
        const comp = getComp();
        if (!comp) return;
        comp.fuiPath = path;
        comp._inlineDoc = undefined;
        markDirty(comp);
      },

      /**
       * Attach a FuiDocument built with FuiBuilder (inline, no file needed).
       * @example
       *   const doc = new FuiBuilder(400, 200)
       *     .label('hp', 10, 10, 200, 30, 'HP: 100')
       *     .build();
       *   this.ui.create(doc);
       */
      create(doc: unknown): void {
        const comp = getComp();
        if (!comp) return;
        comp._inlineDoc = doc;
        comp.fuiPath = '';
        markDirty(comp);
      },

      /** Update the text of a label or button node by ID. Re-renders immediately. */
      setText(nodeId: string, text: string): void {
        getRuntime()?.setNodeText?.(entity, nodeId, text);
      },

      /** Show the FUI (set comp.enabled = true). */
      show(): void {
        const comp = getComp();
        if (comp) comp.enabled = true;
      },

      /** Hide the FUI (set comp.enabled = false). */
      hide(): void {
        const comp = getComp();
        if (comp) comp.enabled = false;
      },

      /** Toggle FUI visibility. */
      setVisible(visible: boolean): void {
        const comp = getComp();
        if (comp) comp.enabled = visible;
      },

      /** Start a named animation defined in the FUI document. */
      playAnimation(id: string): void {
        const comp = getComp();
        if (comp) comp.playAnimation = id;
      },

      /** Stop the currently playing animation. */
      stopAnimation(): void {
        const comp = getComp();
        if (comp) comp.playAnimation = '';
      },

      /** Move a screen-space FUI to the given pixel position. */
      setScreenPosition(x: number, y: number): void {
        const comp = getComp();
        if (comp) { comp.screenX = x; comp.screenY = y; }
      },

      /**
       * Subscribe to a specific button click by element ID.
       * The listener is auto-cleaned up when the script is destroyed.
       * @example this.ui.onButtonClick('play_btn', () => this.startGame());
       */
      onButtonClick(elementId: string, callback: () => void): void {
        const unsub = engine.events.on<{ entity: number; elementId: string }>(
          'ui:click',
          (data) => { if (data.entity === entity && data.elementId === elementId) callback(); },
        );
        cleanupFns.push(unsub);
      },

      /**
       * Subscribe to any button click on this entity's FUI.
       * @example this.ui.onAnyClick((id) => console.log('clicked', id));
       */
      onAnyClick(callback: (elementId: string) => void): void {
        const unsub = engine.events.on<{ entity: number; elementId: string }>(
          'ui:click',
          (data) => { if (data.entity === entity) callback(data.elementId); },
        );
        cleanupFns.push(unsub);
      },
    };
  }

  // ── Audio ────────────────────────────────────────────────────

  /**
   * Play an AudioSource component.
   * @example
   *   const audio = this.getComponent<AudioSourceComponent>('AudioSource');
   *   if (audio) this.playSound(audio);
   */
  playSound(audioComp: import('./Components').AudioSourceComponent, position?: import('three').Vector3): void {
    if (!this._audio) return;
    this._audio.play(audioComp, position);
  }

  // ── Debug / Logging ──────────────────────────────────────────

  /** Log an info message to the editor console (tagged with script name). */
  log(...args: any[]): void { DebugConsole.Log(`[${this.constructor.name}]`, ...args); }

  /** Log a warning to the editor console (tagged with script name). */
  warn(...args: any[]): void { DebugConsole.LogWarning(`[${this.constructor.name}]`, ...args); }

  /** Log an error to the editor console (tagged with script name). */
  error(...args: any[]): void { DebugConsole.LogError(`[${this.constructor.name}]`, ...args); }

  // ── Lifecycle hooks (override in subclass) ────────────────────

  /** Called once when the script first activates (scene start or hot reload). */
  onStart?(): void;

  /** Called every frame. dt is the frame delta time in seconds. */
  onUpdate?(dt: number): void;

  /** Called at a fixed timestep (physics rate). dt is fixedDeltaTime. */
  onFixedUpdate?(dt: number): void;

  /** Called when the entity is destroyed or the scene is cleared. */
  onDestroy?(): void;
}
