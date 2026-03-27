// ============================================================
// FluxionJS V3 — Script API Type Declarations
// Add this file to your tsconfig "typeRoots" or copy it into
// your project's scripts folder so VS Code provides full
// auto-complete and type-checking for script files.
//
// Usage:
//   export default class MyScript extends FluxionScript { ... }
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
  isSensor: boolean;
  enabled: boolean;
}

interface ColliderComponent {
  shape: 'box' | 'sphere' | 'capsule' | 'cylinder' | 'cone' | 'mesh' | 'hull';
  size: _THREE.Vector3;
  radius: number;
  height: number;
  isTrigger: boolean;
  friction: number;
  restitution: number;
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

// ─────────────────────────────────────────────────────────────
// Engine sub-systems exposed through FluxionScript
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
// FluxionScript base class
// ─────────────────────────────────────────────────────────────

declare class FluxionScript {
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
   * - 'Rigidbody'      → RigidbodyComponent
   * - 'Collider'       → ColliderComponent
   * - 'Light'          → LightComponent
   * - 'AudioSource'    → AudioSourceComponent
   * - 'Camera'         → CameraComponent
   * - 'Script'         → ScriptComponent
   * - 'Particle'       → ParticleComponent
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
  onStart?(): void;

  /**
   * Called every frame.
   * @param dt Frame delta time in seconds (same as this.time.deltaTime).
   */
  onUpdate?(dt: number): void;

  /**
   * Called at a fixed physics timestep (default 1/60 s).
   * Use for physics-related logic.
   * @param dt Fixed delta time in seconds.
   */
  onFixedUpdate?(dt: number): void;

  /** Called when the entity is destroyed or the scene is cleared. */
  onDestroy?(): void;
}
