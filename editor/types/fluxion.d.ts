// ============================================================
// FluxionJS V3 — Script API Type Declarations
// Add this file to your tsconfig "typeRoots" or copy it into
// your project's scripts folder so VS Code provides full
// auto-complete and type-checking for script files.
//
// Usage:
//   export default class MyScript extends FluxionBehaviour { ... }
// ============================================================

import type * as _THREE from 'three';

// ─────────────────────────────────────────────────────────────
// THREE.js math helpers — injected directly into script scope
// ─────────────────────────────────────────────────────────────

declare const THREE: typeof _THREE;
declare const Vec2: typeof _THREE.Vector2;
declare const Vec3: typeof _THREE.Vector3;
declare const Vec4: typeof _THREE.Vector4;
declare const Quat: typeof _THREE.Quaternion;
declare const Color: typeof _THREE.Color;
declare const Euler: typeof _THREE.Euler;
declare const Mat4: typeof _THREE.Matrix4;
declare const Mat3: typeof _THREE.Matrix3;

// ─────────────────────────────────────────────────────────────
// Mathf — common math helpers injected into every script's scope
// ─────────────────────────────────────────────────────────────

declare const Mathf: {
  /** π */
  readonly PI: number;
  /** 2π */
  readonly TAU: number;
  /** Multiply degrees by this to convert to radians. */
  readonly Deg2Rad: number;
  /** Multiply radians by this to convert to degrees. */
  readonly Rad2Deg: number;
  /** Linear interpolation between `a` and `b` by factor `t`. */
  lerp(a: number, b: number, t: number): number;
  /** Clamps `v` between `min` and `max`. */
  clamp(v: number, min: number, max: number): number;
  /** Clamps `v` between 0 and 1. */
  clamp01(v: number): number;
  /** Smooth Hermite interpolation between 0 and 1. */
  smoothstep(edge0: number, edge1: number, x: number): number;
  /** Returns true if `|a - b| < 1e-6`. */
  approximately(a: number, b: number): boolean;
  /** Moves `current` towards `target` by at most `maxDelta`. */
  moveTowards(current: number, target: number, maxDelta: number): number;
  /** Loops `t` so it never exceeds `length`. */
  repeat(t: number, length: number): number;
  /** Shortest signed difference between two angles (degrees). */
  deltaAngle(a: number, b: number): number;
  /** Ping-pongs `t` between 0 and `length`. */
  pingPong(t: number, length: number): number;
};

// ─────────────────────────────────────────────────────────────
// Debug — immediate-mode debug drawing (DebugDraw static class)
// ─────────────────────────────────────────────────────────────

declare namespace Debug {
  // ── Console logging ──────────────────────────────────────────────────────────

  /**
   * Log an informational message to the editor console.
   * Accepts any number of arguments (converted to strings and joined with spaces).
   * @example Debug.Log('Player spawned', entity);
   */
  function Log(...args: any[]): void;

  /**
   * Log a warning to the editor console (shown in yellow).
   * @example Debug.LogWarning('Texture missing, using fallback');
   */
  function LogWarning(...args: any[]): void;

  /**
   * Log an error to the editor console (shown in red).
   * @example Debug.LogError('Failed to load asset: ' + path);
   */
  function LogError(...args: any[]): void;

  // ── Debug drawing (gizmos) ───────────────────────────────────────────────────

  /** Draw an overlay line (always on top, no depth test). */
  function drawLine(start: _THREE.Vector3, end: _THREE.Vector3, color?: _THREE.Color): void;
  /** Draw an overlay line with per-vertex colors. */
  function drawLineColored(start: _THREE.Vector3, end: _THREE.Vector3, startColor: _THREE.Color, endColor: _THREE.Color): void;
  /** Draw a batch of overlay lines. */
  function drawLines(lines: Array<{ start: _THREE.Vector3; end: _THREE.Vector3; color?: _THREE.Color }>): void;
  /** Draw a depth-tested world-space line (occluded by scene geometry). */
  function drawLineWorld(start: _THREE.Vector3, end: _THREE.Vector3, color?: _THREE.Color): void;
  /** Draw a cross (three short axis-aligned lines). */
  function drawCross(position: _THREE.Vector3, size: number, color?: _THREE.Color): void;
  /** Draw a wireframe AABB box. */
  function drawLineBox(min: _THREE.Vector3, max: _THREE.Vector3, color?: _THREE.Color): void;
  /** Draw a wireframe sphere approximation. */
  function drawLineSphere(center: _THREE.Vector3, radius: number, color?: _THREE.Color, segments?: number): void;
}

// ─────────────────────────────────────────────────────────────
// Component types
// ─────────────────────────────────────────────────────────────

interface TransformComponent {
  position: _THREE.Vector3;
  rotation: _THREE.Euler;
  scale: _THREE.Vector3;
  quaternion: _THREE.Quaternion;
  readonly localMatrix: _THREE.Matrix4;
  readonly worldMatrix: _THREE.Matrix4;
  lookAt(target: _THREE.Vector3): void;
}

interface MeshRendererComponent {
  mesh: _THREE.Mesh | _THREE.Group | null;
  castShadow: boolean;
  receiveShadow: boolean;
  layer: number;
  modelPath?: string;
  materialPath?: string;
  uvScale: { x: number; y: number };
  uvOffset: { x: number; y: number };
  uvRotation: number;
  enabled: boolean;
}

interface CameraComponent {
  fov: number;
  near: number;
  far: number;
  isOrthographic: boolean;
  orthoSize: number;
  clearColor: _THREE.Color;
  priority: number;
  isMain: boolean;
  camera: _THREE.PerspectiveCamera | _THREE.OrthographicCamera | null;
  enabled: boolean;
}

type LightType = 'directional' | 'point' | 'spot' | 'ambient';

interface LightComponent {
  lightType: LightType;
  color: _THREE.Color;
  intensity: number;
  castShadow: boolean;
  range: number;
  innerAngle: number;
  outerAngle: number;
  enabled: boolean;
}

interface RigidbodyComponent {
  bodyType: 'dynamic' | 'static' | 'kinematic';
  mass: number;
  linearDamping: number;
  angularDamping: number;
  gravityScale: number;
  friction: number;
  restitution: number;
  isContinuous: boolean;
  lockLinearX: boolean;
  lockLinearY: boolean;
  lockLinearZ: boolean;
  lockAngularX: boolean;
  lockAngularY: boolean;
  lockAngularZ: boolean;
  enabled: boolean;
}

interface ColliderComponent {
  shape: 'box' | 'sphere' | 'capsule' | 'cylinder' | 'cone' | 'mesh' | 'hull';
  size: _THREE.Vector3;
  radius: number;
  height: number;
  isTrigger: boolean;
  offset: _THREE.Vector3;
  enabled: boolean;
}

/** Character Controller component — kinematic capsule character with built-in
 *  slope/step handling, jumping, crouching, and air control. */
interface CharacterControllerComponent {
  // Shape
  radius: number;
  height: number;
  crouchHeight: number;
  centerOffsetY: number;
  // Speeds
  walkSpeed: number;
  runSpeed: number;
  crouchSpeed: number;
  airSpeed: number;
  // Jump
  jumpImpulse: number;
  maxJumps: number;
  // Ground
  maxSlopeAngle: number;
  maxStepHeight: number;
  stepDownHeight: number;
  // Physics
  gravityScale: number;
  airFriction: number;
  airControl: number;
  pushForce: number;
  mass: number;
  // Runtime state (read-only from scripts)
  readonly _isGrounded: boolean;
  readonly _isCrouching: boolean;
  readonly _isRunning: boolean;
  enabled: boolean;
}

interface AudioSourceComponent {
  clip: string;
  volume: number;
  pitch: number;
  loop: boolean;
  spatial: boolean;
  minDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  autoPlay: boolean;
  enabled: boolean;
}

interface ScriptComponent {
  scripts: Array<{ path: string; enabled: boolean; properties: Record<string, any> }>;
  enabled: boolean;
}

interface ParticleComponent {
  maxParticles: number;
  emissionRate: number;
  lifetime: number;
  startSpeed: number;
  startSize: number;
  loop: boolean;
  playing: boolean;
  enabled: boolean;
}

interface SpriteComponent {
  /** Project-relative path to the sprite texture (.png / .jpg / .svg …) */
  texturePath: string | null;
  color: _THREE.Color;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  pixelsPerUnit: number;
  sortingLayer: number;
  sortingOrder: number;
  /**
   * For SVG textures: rasterisation resolution in pixels (width = height).
   * Higher values give sharper results at the cost of VRAM.  Default: 512.
   */
  svgRenderSize: number;
  enabled: boolean;
}

// ── FUI (Fluxion UI) types ────────────────────────────────────

type FuiAlign = 'left' | 'center' | 'right';
type FuiMode = 'screen' | 'world';
type FuiNodeType = 'panel' | 'label' | 'button' | 'icon';

interface FuiRect {
  x: number; y: number; w: number; h: number;
}

interface FuiIconNodeStyle {
  /**
   * Flat tint colour applied to the SVG icon using `source-in` compositing.
   * Omit to render with the SVG's original colours.
   * @example '#ffffff'
   */
  color?: string;
  opacity?: number;
  /**
   * How the icon fills its rect. Default: `'contain'`.
   * - `'contain'` — uniform scale, letter-box.
   * - `'cover'`   — uniform scale, crop to fill.
   * - `'fill'`    — stretch to exact rect size.
   */
  fit?: 'contain' | 'cover' | 'fill';
}

/**
 * Fluent builder for creating FUI documents in code.
 *
 * @example
 * ```ts
 * const doc = new FuiBuilder(400, 120)
 *   .background('#1a1a2e80')
 *   .label('title', 10, 10, 380, 30, 'Hello World', { color: '#fff', fontSize: 20 })
 *   .icon('close_icon', 370, 6, 24, 24, 'Assets/UI/close.svg', { color: '#ffffff' })
 *   .button('play_btn', 100, 60, 200, 44, 'Play', { bg: '#3a86ff', radius: 8 })
 *   .build();
 * ```
 */
declare class FuiBuilder {
  constructor(width?: number, height?: number, mode?: FuiMode);

  /** Add a rectangular panel (container / background). */
  panel(
    id: string, x: number, y: number, w: number, h: number,
    opts?: {
      bg?: string; border?: string; borderWidth?: number;
      radius?: number; opacity?: number; parent?: string;
    },
  ): this;

  /** Add a text label. */
  label(
    id: string, x: number, y: number, w: number, h: number,
    text: string,
    opts?: {
      color?: string; fontSize?: number;
      align?: FuiAlign; opacity?: number; parent?: string;
    },
  ): this;

  /** Add a clickable button. */
  button(
    id: string, x: number, y: number, w: number, h: number,
    text: string,
    opts?: {
      bg?: string; border?: string; borderWidth?: number;
      textColor?: string; fontSize?: number; radius?: number;
      padding?: number; opacity?: number; parent?: string;
    },
  ): this;

  /**
   * Add an SVG icon node.
   *
   * The `src` is a project-relative path to an `.svg` file.  The image is
   * loaded asynchronously the first time; subsequent renders use a cache.
   *
   * @param src     Project-relative path, e.g. `'Assets/UI/arrow.svg'`.
   * @param opts    Optional styling (tint colour, opacity, fit mode).
   *
   * @example
   *   builder.icon('close_btn', 370, 6, 24, 24, 'Assets/UI/close.svg', { color: '#fff' })
   */
  icon(
    id: string, x: number, y: number, w: number, h: number,
    src: string,
    opts?: {
      /** Flat tint colour (original SVG colours if omitted). */
      color?: string;
      opacity?: number;
      /**
       * How the icon fills its rect.
       * - `'contain'` uniform scale, letter-box (default).
       * - `'cover'`   uniform scale, crop to fill.
       * - `'fill'`    stretch to exact size.
       */
      fit?: 'contain' | 'cover' | 'fill';
      parent?: string;
    },
  ): this;

  /** Shortcut: add a full-canvas background panel named `'bg'`. */
  background(color: string, opts?: { opacity?: number }): this;

  /** Compile all added nodes into a FuiDocument ready for FuiRuntimeSystem. */
  build(): FuiDocument;

  /** Serialize the document to a JSON string (for saving `.fui` files). */
  toJSON(): string;

  /** Generate a unique node ID safe for dynamic UIs. */
  static genId(prefix?: string): string;
}

/** Serialised FUI document — pass to `fui._inlineDoc` to render in-game. */
interface FuiDocument {
  version: number;
  mode: FuiMode;
  canvas: { width: number; height: number };
  root: Record<string, any>;
  animations?: any[];
}

// ─────────────────────────────────────────────────────────────
// Engine sub-systems exposed through FluxionBehaviour
// ─────────────────────────────────────────────────────────────

interface FluxionTime {
  /** Seconds since last frame (affected by timeScale). */
  readonly deltaTime: number;
  /** Seconds since last frame (unaffected by timeScale). */
  readonly unscaledDeltaTime: number;
  /** Fixed physics timestep in seconds (default 1/60). */
  readonly fixedDeltaTime: number;
  /** Time scale multiplier (1 = normal, 0.5 = slow-mo). */
  timeScale: number;
  /** Total elapsed time in seconds (scaled). */
  readonly elapsed: number;
  /** Total elapsed time in seconds (unscaled). */
  readonly unscaledElapsed: number;
  /** Current frame number since engine start. */
  readonly frameCount: number;
  /** Frames per second (updated every 0.5 s). */
  readonly fps: number;
  /** Smoothed FPS. */
  readonly smoothFps: number;
  /** Interpolation alpha for rendering between fixed steps (0–1). */
  readonly fixedAlpha: number;
}

interface FluxionInput {
  /** True while the key is held down. code = KeyboardEvent.code, e.g. 'KeyW', 'Space'. */
  isKeyDown(code: string): boolean;
  /** True on the first frame the key is pressed. */
  isKeyPressed(code: string): boolean;
  /** True on the first frame the key is released. */
  isKeyReleased(code: string): boolean;
  /** True while a mouse button is held. 0=left, 1=middle, 2=right. */
  isMouseDown(button?: number): boolean;
  /** True on the first frame a mouse button is pressed. */
  isMousePressed(button?: number): boolean;
  /** True on the first frame a mouse button is released. */
  isMouseReleased(button?: number): boolean;
  /** True if the pointer is currently locked. */
  isPointerLocked(): boolean;
  /** Request pointer lock on the canvas. */
  lockPointer(): void;
  /** Release pointer lock. */
  unlockPointer(): void;
  /** Returns -1, 0, or 1 based on which of the two keys is held. */
  getAxis(negative: string, positive: string): number;
  /** Gamepad axis value (-1 to 1) with optional dead zone. */
  getGamepadAxis(padIndex: number, axisIndex: number, deadzone?: number): number;
  /** True while a gamepad button is held. */
  isGamepadButtonDown(padIndex: number, buttonIndex: number): boolean;
  /** Mouse position in pixels (relative to canvas). */
  readonly mousePosition: { x: number; y: number };
  /** Mouse movement since last frame in pixels. */
  readonly mouseDelta: { x: number; y: number };
  /** Mouse wheel delta for this frame. */
  readonly mouseWheel: number;
  /** Shortcut: horizontal axis (D/ArrowRight = +1, A/ArrowLeft = -1). */
  readonly horizontal: number;
  /** Shortcut: vertical axis (W/ArrowUp = +1, S/ArrowDown = -1). */
  readonly vertical: number;
}

interface FluxionEvents {
  on<T = any>(event: string, callback: (data: T) => void, priority?: number): () => void;
  once<T = any>(event: string, callback: (data: T) => void, priority?: number): () => void;
  off<T = any>(event: string, callback: (data: T) => void): void;
  emit<T = any>(event: string, data?: T): void;
}

// ─────────────────────────────────────────────────────────────
// FluxionBehaviour base class
// ─────────────────────────────────────────────────────────────

declare class FluxionBehaviour {
  // ── Injected properties ──────────────────────────────────────

  /** The entity ID this script is attached to. */
  readonly entity: number;

  // ── Convenience getters ──────────────────────────────────────

  /** Engine time — deltaTime, elapsed, fps, timeScale, etc. */
  readonly time: FluxionTime;

  /** Input manager — keyboard, mouse, gamepad. */
  readonly input: FluxionInput;

  /** Global engine event bus. */
  readonly events: FluxionEvents;

  /** The Transform component of this entity (shortcut). */
  readonly transform: TransformComponent | null;

  // ── Component access ─────────────────────────────────────────

  /**
   * Get a component from this entity.
   *
   * Common component types:
   * - 'Transform'      → TransformComponent
   * - 'MeshRenderer'   → MeshRendererComponent
   * - 'Rigidbody'           → RigidbodyComponent
   * - 'Collider'            → ColliderComponent
   * - 'CharacterController' → CharacterControllerComponent
   * - 'Light'               → LightComponent
   * - 'AudioSource'         → AudioSourceComponent
   * - 'Camera'              → CameraComponent
   * - 'Script'              → ScriptComponent
   * - 'Particle'            → ParticleComponent
   *
   * @example
   * const rb = this.getComponent<RigidbodyComponent>('Rigidbody');
   */
  getComponent<T>(type: string): T | null;

  /** Get a component from any entity by ID. */
  getComponentOf<T>(entity: number, type: string): T | null;

  /** Check whether this entity has a component. */
  hasComponent(type: string): boolean;

  /** Add a component to this entity. Returns the added component. */
  addComponent<T>(component: T): T;

  /** Remove a component from this entity by type name. */
  removeComponent(type: string): void;

  // ── Scene queries ────────────────────────────────────────────

  /** Find the first entity whose name matches. */
  find(name: string): number | undefined;

  /** Find the first entity with a given tag. */
  findWithTag(tag: string): number | undefined;

  /** Find all entities with a given tag. */
  findAll(tag: string): number[];

  /** Query all entities that have all of the given component types. */
  query(...componentTypes: string[]): number[];

  // ── Entity hierarchy ─────────────────────────────────────────

  /** Get the parent entity, or undefined if root. Defaults to this entity. */
  getParent(entity?: number): number | undefined;

  /** Get all direct children. Defaults to this entity. */
  getChildren(entity?: number): ReadonlySet<number>;

  // ── Entity lifecycle ─────────────────────────────────────────

  /** Create a new entity. Optionally give it a name. */
  createEntity(name?: string): number;

  /**
   * Destroy an entity and all its children.
   * Defaults to this entity (destroys self).
   */
  destroy(entity?: number): void;

  /** Get the name of an entity. Defaults to this entity. */
  getName(entity?: number): string;

  /** Set the name of an entity. Defaults to this entity. */
  setName(name: string, entity?: number): void;

  // ── Tags ─────────────────────────────────────────────────────

  /** Add a tag to an entity. Defaults to this entity. */
  addTag(tag: string, entity?: number): void;

  /** Check whether an entity has a tag. Defaults to this entity. */
  hasTag(tag: string, entity?: number): boolean;

  // ── Physics ──────────────────────────────────────────────────

  /**
   * Physics world access. Methods are no-ops when the entity has no
   * matching component (e.g. CharacterController methods on a plain
   * Rigidbody entity are silently ignored).
   *
   * @example
   *   // Move a character controller
   *   this.physics.move(this.input.getAxis('Horizontal'), this.input.getAxis('Vertical'));
   *   if (this.input.getButtonDown('Jump')) this.physics.jump();
   *
   * @example
   *   // Listen for collisions
   *   this.on<{entity1: number; entity2: number}>('physics:collision-enter', (e) => {
   *     if (e.entity1 === this.entity || e.entity2 === this.entity) { ... }
   *   });
   */
  readonly physics: {
    /** Cast a ray and return the first hit, or null. */
    raycast(
      origin: _THREE.Vector3,
      direction: _THREE.Vector3,
      maxDistance?: number,
    ): { entity: number | null; point: _THREE.Vector3; normal: _THREE.Vector3; distance: number } | null;

    /** Change the world gravity vector. */
    setGravity(x: number, y: number, z: number): void;

    /** Apply a continuous force to this entity's Rigidbody (N). */
    applyForce(force: _THREE.Vector3): void;

    /** Apply an instant impulse to this entity's Rigidbody. */
    applyImpulse(impulse: _THREE.Vector3): void;

    /** Apply a torque to this entity's Rigidbody. */
    applyTorque(torque: _THREE.Vector3): void;

    /** Directly set the linear velocity of this entity's Rigidbody. */
    setVelocity(velocity: _THREE.Vector3): void;

    /** Get the current linear velocity of this entity's Rigidbody. */
    getVelocity(): _THREE.Vector3;

    /** Set horizontal movement input (call every frame). */
    move(x: number, z: number): void;

    /** Trigger a jump (respects maxJumps and grounded state). */
    jump(): void;

    /** Whether the character is currently grounded. */
    isGrounded(): boolean;

    /** Enable or disable crouching. */
    crouch(state: boolean): void;

    /** Whether the character is currently crouching. */
    isCrouching(): boolean;

    /** Enable or disable running (switches to runSpeed). */
    setRunning(state: boolean): void;
  };

  // ── Events ───────────────────────────────────────────────────

  /**
   * Subscribe to an engine event. Auto-unsubscribed when the script is destroyed.
   * @example this.on('player:died', () => { this.respawn(); });
   */
  on<T = any>(event: string, callback: (data: T) => void, priority?: number): void;

  /**
   * Subscribe to an engine event once. Auto-cleaned on destroy if not fired.
   */
  once<T = any>(event: string, callback: (data: T) => void, priority?: number): void;

  /**
   * Emit an engine event.
   * @example this.emit('player:scored', { points: 10 });
   */
  emit<T = any>(event: string, data?: T): void;

  // ── Audio ────────────────────────────────────────────────────

  /**
   * Play an AudioSource component.
   * @example
   *   const audio = this.getComponent<AudioSourceComponent>('AudioSource');
   *   if (audio) this.playSound(audio);
   */
  playSound(audioComp: AudioSourceComponent, position?: _THREE.Vector3): void;

  // ── Logging ──────────────────────────────────────────────────

  /** Log to console (tagged with class name). */
  log(...args: any[]): void;

  /** Warn to console (tagged with class name). */
  warn(...args: any[]): void;

  /** Error to console (tagged with class name). */
  error(...args: any[]): void;

  // ── Lifecycle hooks (override in subclass) ────────────────────

  /** Called once when the script first activates (scene start or hot reload). */
  start?(): void | Promise<void>;

  /**
   * Called every frame.
   * @param dt Frame delta time in seconds (same as this.time.deltaTime).
   */
  update?(dt: number): void;

  /**
   * Called at a fixed physics timestep (default 1/60 s).
   * Use for physics-related logic.
   * @param dt Fixed delta time in seconds.
   */
  fixedUpdate?(dt: number): void;

  /**
   * Called after all update() calls this frame.
   * @param dt Frame delta time in seconds.
   */
  lateUpdate?(dt: number): void;

  /** Called when the entity is destroyed or the scene is cleared. */
  onDestroy?(): void;

  /** Called when this script instance becomes enabled. */
  onEnable?(): void;

  /** Called when this script instance becomes disabled. */
  onDisable?(): void;
}

/** @deprecated Use FluxionBehaviour */
declare class FluxionScript extends FluxionBehaviour {}
