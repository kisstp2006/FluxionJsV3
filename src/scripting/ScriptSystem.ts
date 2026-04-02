// ============================================================
// FluxionJS V3 — Script System
// Loads, compiles, instantiates and drives user scripts.
// Supports hot-reload: when _instances is cleared for an entry
// the system re-loads the script on the next frame automatically.
// ============================================================

import * as THREE from 'three';
import type { System, ECSManager, EntityId } from '../core/ECS';
import type { Engine } from '../core/Engine';
import type { InputManager } from '../input/InputManager';
import type { FluxionRenderer } from '../renderer/Renderer';
import type { AudioSystem } from '../audio/AudioSystem';
import { ScriptComponent, ScriptEntry } from '../core/Components';
import { FluxionBehaviour } from './FluxionBehaviour';
import { compileScript } from './ScriptCompiler';
import { DebugDraw } from '../renderer/DebugDraw';
import { DebugConsole } from '../core/DebugConsole';
import { projectManager } from '../project/ProjectManager';
import { getFileSystem } from '../filesystem';
import { FuiBuilder } from '../ui/FuiBuilder';
import { EntityRef } from './EntityRef';
import { FuiRef } from './FuiRef';
import { MaterialRef } from './MaterialRef';
import { TextureRef } from './TextureRef';
import { AnimationRef } from './AnimationRef';
import { FontRef } from './FontRef';
import { SceneRef } from './SceneRef';
import { ColorRef } from './ColorRef';

// ── THREE math shortcuts injected into every script's scope ──

const MATH_SHORTCUTS = {
  Vec2: THREE.Vector2,
  Vec3: THREE.Vector3,
  Vec4: THREE.Vector4,
  Quat: THREE.Quaternion,
  Color: THREE.Color,
  Euler: THREE.Euler,
  Mat4: THREE.Matrix4,
  Mat3: THREE.Matrix3,
};

const Mathf = {
  PI:         Math.PI,
  TAU:        Math.PI * 2,
  Deg2Rad:    Math.PI / 180,
  Rad2Deg:    180 / Math.PI,
  lerp:       (a: number, b: number, t: number) => a + (b - a) * t,
  clamp:      (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
  clamp01:    (v: number) => Math.max(0, Math.min(1, v)),
  smoothstep: (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  },
  approximately: (a: number, b: number) => Math.abs(a - b) < 1e-6,
  moveTowards:   (cur: number, tgt: number, d: number) =>
    Math.abs(tgt - cur) <= d ? tgt : cur + Math.sign(tgt - cur) * d,
  repeat:        (t: number, len: number) => t - Math.floor(t / len) * len,
  deltaAngle:    (a: number, b: number) => {
    const d = (b - a) % 360;
    return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
  },
  pingPong: (t: number, len: number) => {
    const r = (t % (len * 2) + len * 2) % (len * 2);
    return len - Math.abs(r - len);
  },
  abs:   Math.abs,  ceil:  Math.ceil,  floor: Math.floor, round: Math.round,
  sin:   Math.sin,  cos:   Math.cos,   atan2: Math.atan2, sqrt:  Math.sqrt,
  sign:  Math.sign, pow:   Math.pow,   log:   Math.log,   exp:   Math.exp,
  min:   Math.min,  max:   Math.max,
};

// ── Error Tracker ─────────────────────────────────────────────

class ErrorTracker {
  private errors = new Map<string, { timestamp: number; count: number }>();
  private readonly cooldownMs = 5000; // 5 seconds default cooldown

  get cooldownDuration(): number {
    return this.cooldownMs;
  }

  shouldLogError(signature: string, cooldownMs?: number): boolean {
    const now = performance.now();
    const cooldown = cooldownMs ?? this.cooldownMs;
    const existing = this.errors.get(signature);

    if (!existing) {
      this.errors.set(signature, { timestamp: now, count: 1 });
      return true; // First occurrence, should log
    }

    if (now - existing.timestamp > cooldown) {
      // Cooldown expired, reset and log again
      this.errors.set(signature, { timestamp: now, count: 1 });
      return true;
    }

    // Still in cooldown, increment count but don't log
    existing.count++;
    return false;
  }

  clearErrors(path: string): void {
    const keysToDelete: string[] = [];
    for (const signature of this.errors.keys()) {
      if (signature.startsWith(path)) {
        keysToDelete.push(signature);
      }
    }
    for (const key of keysToDelete) {
      this.errors.delete(key);
    }
  }

  generateSignature(path: string, errorType: string, error: any): string {
    const message = error?.message?.toString() ?? error?.toString() ?? 'unknown';
    const hash = this.simpleHash(message);
    return `${path}:${errorType}:${hash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// ── Script loader ─────────────────────────────────────────────

function loadScriptClass(
  compiledJs: string,
  BehaviourBase: typeof FluxionBehaviour,
): any {
  const mod: { default: any } = { default: null };
  // eslint-disable-next-line no-new-func
  new Function(
    'exports',
    'FluxionBehaviour',
    'FluxionScript',   // backward-compat alias
    'THREE',
    'Debug',
    'Vec2', 'Vec3', 'Vec4', 'Quat', 'Color', 'Euler', 'Mat4', 'Mat3',
    'Mathf',
    'FuiBuilder',
    'EntityRef',
    'FuiRef',
    'MaterialRef',
    'TextureRef',
    'AnimationRef',
    'FontRef',
    'SceneRef',
    'ColorRef',
    'console',
    compiledJs,
  )(
    mod,
    BehaviourBase,
    BehaviourBase,     // FluxionScript alias → same class
    THREE,
    DebugDraw,
    MATH_SHORTCUTS.Vec2,
    MATH_SHORTCUTS.Vec3,
    MATH_SHORTCUTS.Vec4,
    MATH_SHORTCUTS.Quat,
    MATH_SHORTCUTS.Color,
    MATH_SHORTCUTS.Euler,
    MATH_SHORTCUTS.Mat4,
    MATH_SHORTCUTS.Mat3,
    Mathf,
    FuiBuilder,
    EntityRef,
    FuiRef,
    MaterialRef,
    TextureRef,
    AnimationRef,
    FontRef,
    SceneRef,
    ColorRef,
    console,
  );
  return mod.default;
}

// ── ScriptSystem ──────────────────────────────────────────────

export class ScriptSystem implements System {
  readonly name = 'ScriptSystem';
  readonly requiredComponents = ['Script'];
  priority = 100;
  enabled = true;

  /** Max ms allowed per update() call (0 = disabled). Set from project settings. */
  updateTimeout = 0;

  /**
   * Pre-bundled script registry injected by the game player build.
   * Keys are project-relative paths (e.g. "Assets/Scripts/Foo.ts"),
   * values are the module namespace objects (import * as Mod from '...').
   * When set, _loadScript checks here before hitting the filesystem.
   */
  private _bundledRegistry: Record<string, any> = {};

  private engine:   Engine;
  private input:    InputManager;
  private renderer: FluxionRenderer | null;
  private audio:    AudioSystem | null;
  private errorTracker = new ErrorTracker();

  constructor(
    engine:   Engine,
    input:    InputManager,
    renderer: FluxionRenderer | null = null,
    audio:    AudioSystem    | null = null,
  ) {
    this.engine   = engine;
    this.input    = input;
    this.renderer = renderer;
    this.audio    = audio;
  }

  init(): void {}

  /** Register the auto-generated script map from the game build. */
  setBundledRegistry(registry: Record<string, any>): void {
    this._bundledRegistry = registry ?? {};
  }

  update(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
    const nowSec = performance.now() / 1000;
    for (const entity of entities) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp || !comp.enabled) continue;

      for (const entry of comp.scripts) {
        if (!entry.enabled || !entry.path) continue;

        if (!comp._instances.has(entry.path)) {
          // Check if script is in failed cooldown state
          const failedTime = comp._failed.get(entry.path);
          if (failedTime) {
            const cooldownMs = this.errorTracker.cooldownDuration;
            if (performance.now() - failedTime < cooldownMs) {
              continue; // Still in cooldown, skip loading
            } else {
              // Cooldown expired, clear failed state and retry
              comp._failed.delete(entry.path);
              this.errorTracker.clearErrors(entry.path);
            }
          }

          if (!comp._loading.has(entry.path)) {
            const tok = Symbol();
            comp._loading.set(entry.path, tok);
            this._loadScript(entity, comp, entry, ecs, tok).catch((err) => {
              const signature = this.errorTracker.generateSignature(entry.path, 'load', err);
              if (this.errorTracker.shouldLogError(signature)) {
                DebugConsole.LogError(`[ScriptSystem] Failed to load "${entry.path}": ${err}`);
              }
              if (comp._loading.get(entry.path) === tok) comp._loading.delete(entry.path);
            });
          }
          continue;
        }

        const inst = comp._instances.get(entry.path);
        if (!inst) continue;

        if (this.engine.simulationPaused && !inst._isTool) continue;

        // Call start() before the very first update() — mirrors Unity behaviour
        if (!inst._started) {
          inst._started = true;
          try {
            const result = inst.start?.();
            if (result instanceof Promise) {
              result.catch((err: unknown) => {
                const signature = this.errorTracker.generateSignature(entry.path, 'start', err);
                if (this.errorTracker.shouldLogError(signature)) {
                  DebugConsole.LogError(`[ScriptSystem] start() async error in "${entry.path}": ${err}`);
                }
              });
            }
          } catch (err) {
            const signature = this.errorTracker.generateSignature(entry.path, 'start', err);
            if (this.errorTracker.shouldLogError(signature)) {
              DebugConsole.LogError(`[ScriptSystem] start() error in "${entry.path}": ${err}`);
            }
          }
        }

        try {
          if (this.updateTimeout > 0) {
            const t0 = performance.now();
            inst.update?.(dt);
            const elapsed = performance.now() - t0;
            if (elapsed > this.updateTimeout) {
              DebugConsole.LogWarning(
                `[ScriptSystem] "${entry.path}" exceeded ${this.updateTimeout}ms in update() (${elapsed.toFixed(1)}ms)`,
              );
            }
          } else {
            inst.update?.(dt);
          }
          this._tickCoroutines(inst, dt, nowSec);
        } catch (err) {
          const signature = this.errorTracker.generateSignature(entry.path, 'update', err);
          if (this.errorTracker.shouldLogError(signature)) {
            DebugConsole.LogError(`[ScriptSystem] update() error in "${entry.path}": ${err}`);
          }
        }
      }
    }
  }

  fixedUpdate(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
    const nowSec = performance.now() / 1000;
    for (const entity of entities) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp || !comp.enabled) continue;
      for (const entry of comp.scripts) {
        if (!entry.enabled) continue;
        const inst = comp._instances.get(entry.path);
        if (!inst) continue;
        try {
          inst.fixedUpdate?.(dt);
          this._tickCoroutines(inst, dt, nowSec);
        } catch (err) {
          const signature = this.errorTracker.generateSignature(entry.path, 'fixedUpdate', err);
          if (this.errorTracker.shouldLogError(signature)) {
            DebugConsole.LogError(`[ScriptSystem] fixedUpdate() error in "${entry.path}": ${err}`);
          }
        }
      }
    }
  }

  lateUpdate(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
    for (const entity of entities) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp || !comp.enabled) continue;
      for (const entry of comp.scripts) {
        if (!entry.enabled) continue;
        const inst = comp._instances.get(entry.path);
        if (!inst) continue;
        try {
          inst.lateUpdate?.(dt);
        } catch (err) {
          const signature = this.errorTracker.generateSignature(entry.path, 'lateUpdate', err);
          if (this.errorTracker.shouldLogError(signature)) {
            DebugConsole.LogError(`[ScriptSystem] lateUpdate() error in "${entry.path}": ${err}`);
          }
        }
      }
    }
  }

  onSceneClear(): void {
    const ecs = this.engine.ecs;
    for (const entity of ecs.getAllEntities()) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp) continue;
      this._destroyAll(comp);
    }
  }

  destroy(): void {
    this.onSceneClear();
  }

  // ── Internal ──────────────────────────────────────────────────

  private async _loadScript(
    entity:  EntityId,
    comp:    ScriptComponent,
    entry:   ScriptEntry,
    ecs:     ECSManager,
    token:   symbol,
  ): Promise<void> {
    const fs = getFileSystem();
    let absPath: string;
    try {
      absPath = projectManager.resolvePath(entry.path);
    } catch {
      absPath = entry.path;
    }

    // ── Bundled registry (game build) — skip filesystem + eval ──
    const normalizedAbs = absPath.replace(/\\/g, '/');
    const registryKey = Object.keys(this._bundledRegistry).find(
      k => normalizedAbs.endsWith(k.replace(/\\/g, '/')) || entry.path === k,
    );
    let ScriptClass: any;
    if (registryKey) {
      const mod = this._bundledRegistry[registryKey];
      ScriptClass = mod?.default ?? Object.values(mod ?? {}).find((v: any) => typeof v === 'function');
      if (!ScriptClass) {
        DebugConsole.LogWarning(`[ScriptSystem] Bundled registry entry "${registryKey}" has no default export.`);
        comp._loading.delete(entry.path);
        return;
      }
    } else {
      // ── Filesystem load (editor / dev mode) ──────────────────────
      const source = await fs.readFile(absPath);

      if (!ecs.entityExists(entity)) return;
      if (comp._loading.get(entry.path) !== token) return; // stale load

      let compiled: string;
      try {
        compiled = compileScript(source, absPath);
      } catch (err) {
        const signature = this.errorTracker.generateSignature(entry.path, 'compile', err);
        if (this.errorTracker.shouldLogError(signature)) {
          DebugConsole.LogError(`[ScriptSystem] Compile error in "${entry.path}": ${err}`);
        }
        comp._loading.delete(entry.path);
        // Add to failed state with cooldown
        comp._failed.set(entry.path, performance.now());
        return;
      }

      try {
        ScriptClass = loadScriptClass(compiled, FluxionBehaviour);
      } catch (err) {
        const signature = this.errorTracker.generateSignature(entry.path, 'runtime', err);
        if (this.errorTracker.shouldLogError(signature)) {
          DebugConsole.LogError(`[ScriptSystem] Runtime load error in "${entry.path}": ${err}`);
        }
        comp._loading.delete(entry.path);
        // Add to failed state with cooldown
        comp._failed.set(entry.path, performance.now());
        return;
      }

      if (!ScriptClass) {
        DebugConsole.LogWarning(`[ScriptSystem] "${entry.path}" has no default export.`);
        comp._loading.delete(entry.path);
        // Add to failed state with cooldown
        comp._failed.set(entry.path, performance.now());
        return;
      }
    }

    if (!ecs.entityExists(entity)) return;
    if (comp._loading.get(entry.path) !== token) return;

    const instance = new ScriptClass() as FluxionBehaviour;
    instance.entity    = entity;
    instance._ecs      = ecs;
    instance._engine   = this.engine;
    instance._input    = this.input;
    instance._renderer = this.renderer as any;
    instance._audio    = this.audio;
    instance._cleanupFns = [];

    // Apply inspector property overrides
    for (const [key, val] of Object.entries(entry.properties)) {
      const current = (instance as any)[key];
      if (current instanceof EntityRef && val && typeof val === 'object') {
        current.entity = typeof (val as any).entity === 'number' ? (val as any).entity : null;
      } else if (current instanceof FuiRef && val && typeof val === 'object') {
        current.path = typeof (val as any).path === 'string' ? (val as any).path : '';
      } else if (current instanceof MaterialRef && val && typeof val === 'object') {
        current.path = typeof (val as any).path === 'string' ? (val as any).path : '';
      } else if (current instanceof TextureRef && val && typeof val === 'object') {
        current.path = typeof (val as any).path === 'string' ? (val as any).path : '';
      } else if (current instanceof AnimationRef && val && typeof val === 'object') {
        current.path = typeof (val as any).path === 'string' ? (val as any).path : '';
        current.clip = typeof (val as any).clip === 'string' ? (val as any).clip : '';
      } else if (current instanceof FontRef && val && typeof val === 'object') {
        current.path   = typeof (val as any).path   === 'string' ? (val as any).path   : '';
        current.family = typeof (val as any).family === 'string' ? (val as any).family : '';
      } else if (current instanceof SceneRef && val && typeof val === 'object') {
        current.path = typeof (val as any).path === 'string' ? (val as any).path : '';
      } else if (current instanceof ColorRef && val && typeof val === 'object') {
        current.hex = typeof (val as any).hex === 'string' ? (val as any).hex : '#ffffff';
      } else {
        (instance as any)[key] = val;
      }
    }

    instance._started = false;
    instance._isTool   = !!(ScriptClass as any).__tool;
    // Final staleness check before committing the instance
    if (comp._loading.get(entry.path) !== token) return;
    comp._instances.set(entry.path, instance);
    comp._loading.delete(entry.path);
    // Clear any previous error history for this script
    this.errorTracker.clearErrors(entry.path);
    comp._failed.delete(entry.path);
  }

  /** Called when play mode stops — clears coroutines, runs cleanup listeners. */
  onSimulationStop(): void {
    const ecs = this.engine.ecs;
    for (const entity of ecs.getAllEntities()) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp) continue;
      for (const inst of comp._instances.values()) {
        if (!inst) continue;
        if (Array.isArray(inst._cleanupFns)) {
          for (const fn of inst._cleanupFns) { try { fn(); } catch {} }
          inst._cleanupFns = [];
        }
        inst._coroutines?.clear();
        inst._started = false;
      }
    }
  }

  private _tickCoroutines(inst: FluxionBehaviour, _dt: number, now: number): void {
    if (!inst._coroutines.size) return;
    for (const [id, state] of inst._coroutines) {
      if (now < state.waitUntil) continue;
      let result: IteratorResult<any>;
      try {
        result = state.gen.next();
      } catch (err) {
        const signature = this.errorTracker.generateSignature('coroutine', 'runtime', err);
        if (this.errorTracker.shouldLogError(signature)) {
          DebugConsole.LogError(`[ScriptSystem] Coroutine error: ${err}`);
        }
        inst._coroutines.delete(id);
        continue;
      }
      if (result.done) {
        inst._coroutines.delete(id);
        continue;
      }
      const yv = result.value;
      if (yv?.seconds) {
        state.waitUntil = now + (yv.seconds as number);
      } else if (yv?.frames) {
        state.waitUntil = now + (yv.frames as number) / 60;
      }
    }
  }

  private _destroyAll(comp: ScriptComponent): void {
    for (const [path, inst] of comp._instances) {
      try { inst?.onDestroy?.(); } catch (err) {
        const signature = this.errorTracker.generateSignature(path, 'onDestroy', err);
        if (this.errorTracker.shouldLogError(signature)) {
          DebugConsole.LogError(`[ScriptSystem] onDestroy() error in "${path}": ${err}`);
        }
      }
      if (Array.isArray(inst?._cleanupFns)) {
        for (const fn of inst._cleanupFns) { try { fn(); } catch {} }
      }
      inst?._coroutines?.clear();
    }
    comp._instances.clear();
    comp._loading.clear();
    comp._failed.clear(); // Clear failed state on destroy
  }
}
