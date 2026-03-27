// ============================================================
// FluxionJS V3 — FluxionScript Base Class
// Full Stride-inspired scripting API covering all engine systems.
// Injected into script execution scope by ScriptSystem.
// ============================================================

import type { EntityId, ECSManager } from './ECS';
import type { Engine } from './Engine';
import type { InputManager } from '../input/InputManager';
import type { FluxionRenderer } from '../renderer/Renderer';
import type { AudioSystem } from '../audio/AudioSystem';
import type { TransformComponent } from './Components';

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

  /** Physics world access — raycast, gravity. */
  get physics() {
    const world = (this._engine as any).getSubsystem?.('physics') as any;
    return {
      raycast: (origin: import('three').Vector3, direction: import('three').Vector3, maxDist = 100) =>
        world?.raycast(origin, direction, maxDist) ?? null,
      setGravity: (x: number, y: number, z: number) =>
        world?.setGravity(x, y, z),
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

  /** Log to browser console (tagged with script name). */
  log(...args: any[]): void { console.log(`[${this.constructor.name}]`, ...args); }

  /** Warn to browser console. */
  warn(...args: any[]): void { console.warn(`[${this.constructor.name}]`, ...args); }

  /** Error to browser console. */
  error(...args: any[]): void { console.error(`[${this.constructor.name}]`, ...args); }

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
