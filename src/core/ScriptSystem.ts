// ============================================================
// FluxionJS V3 — Script System
// Loads, compiles, instantiates and drives user scripts.
// Supports hot-reload: when _instances is cleared for an entry
// the system re-loads the script on the next frame automatically.
// ============================================================

import * as THREE from 'three';
import type { System, ECSManager, EntityId } from './ECS';
import type { Engine } from './Engine';
import type { InputManager } from '../input/InputManager';
import type { FluxionRenderer } from '../renderer/Renderer';
import type { AudioSystem } from '../audio/AudioSystem';
import { ScriptComponent, ScriptEntry } from './Components';
import { FluxionScript } from './FluxionScript';
import { compileScript } from './ScriptCompiler';
import { DebugDraw } from '../renderer/DebugDraw';
import { DebugConsole } from './DebugConsole';
import { projectManager } from '../project/ProjectManager';
import { getFileSystem } from '../filesystem';
import { FuiBuilder } from '../ui/FuiBuilder';
import { EntityRef } from './EntityRef';

// ── Script execution scope extras ────────────────────────────

/** THREE math shortcuts injected into every script's scope. */
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

/** Mathf — common math helpers injected into every script's scope. */
const Mathf = {
  PI: Math.PI,
  TAU: Math.PI * 2,
  Deg2Rad: Math.PI / 180,
  Rad2Deg: 180 / Math.PI,
  lerp:         (a: number, b: number, t: number) => a + (b - a) * t,
  clamp:        (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
  clamp01:      (v: number) => Math.max(0, Math.min(1, v)),
  smoothstep:   (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  },
  approximately: (a: number, b: number) => Math.abs(a - b) < 1e-6,
  moveTowards:  (cur: number, tgt: number, d: number) =>
    Math.abs(tgt - cur) <= d ? tgt : cur + Math.sign(tgt - cur) * d,
  repeat:       (t: number, len: number) => t - Math.floor(t / len) * len,
  deltaAngle:   (a: number, b: number) => {
    const d = (b - a) % 360;
    return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
  },
  pingPong:     (t: number, len: number) => {
    const r = (t % (len * 2) + len * 2) % (len * 2);
    return len - Math.abs(r - len);
  },
  abs:   Math.abs,  ceil:  Math.ceil,  floor: Math.floor, round: Math.round,
  sin:   Math.sin,  cos:   Math.cos,   atan2: Math.atan2,  sqrt:  Math.sqrt,
  sign:  Math.sign, pow:   Math.pow,   log:   Math.log,    exp:   Math.exp,
  min:   Math.min,  max:   Math.max,
};

// ── Helpers ──────────────────────────────────────────────────

/**
 * Execute compiled CommonJS JS in an isolated scope and return
 * whatever was set on `exports.default`.
 *
 * Scope injections available inside every script:
 *   - FluxionScript  — base class
 *   - THREE          — full three.js namespace
 *   - Debug          — DebugDraw (static draw helpers)
 *   - Vec2/Vec3/Vec4/Quat/Color/Euler/Mat4/Mat3 — THREE shortcuts
 *   - console        — standard console
 */
function loadScriptClass(
  compiledJs: string,
  FluxionScriptBase: typeof FluxionScript,
): any {
  const mod: { default: any } = { default: null };
  // eslint-disable-next-line no-new-func
  new Function(
    'exports',
    'FluxionScript',
    'THREE',
    'Debug',
    'Vec2', 'Vec3', 'Vec4', 'Quat', 'Color', 'Euler', 'Mat4', 'Mat3',
    'Mathf',
    'FuiBuilder',
    'EntityRef',
    'console',
    compiledJs,
  )(
    mod,
    FluxionScriptBase,
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
    console,
  );
  return mod.default;
}

// ── ScriptSystem ─────────────────────────────────────────────

export class ScriptSystem implements System {
  readonly name = 'ScriptSystem';
  readonly requiredComponents = ['Script'];
  priority = 100;
  enabled = true;

  /** Max ms allowed per onUpdate call (0 = disabled). Set from project settings. */
  updateTimeout = 0;

  private engine: Engine;
  private input: InputManager;
  private renderer: FluxionRenderer | null;
  private audio: AudioSystem | null;

  constructor(
    engine: Engine,
    input: InputManager,
    renderer: FluxionRenderer | null = null,
    audio: AudioSystem | null = null,
  ) {
    this.engine = engine;
    this.input = input;
    this.renderer = renderer;
    this.audio = audio;
  }

  // ── Lifecycle ────────────────────────────────────────────

  init(): void {}

  update(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
    const nowSec = performance.now() / 1000;
    for (const entity of entities) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp || !comp.enabled) continue;

      for (const entry of comp.scripts) {
        if (!entry.enabled || !entry.path) continue;

        if (!comp._instances.has(entry.path)) {
          // Not yet loaded — kick off async load (guards against double-load)
          if (!comp._loading.has(entry.path)) {
            comp._loading.add(entry.path);
            this.loadScript(entity, comp, entry, ecs).catch((err) => {
              DebugConsole.LogError(`[ScriptSystem] Failed to load "${entry.path}": ${err}`);
              comp._loading.delete(entry.path);
            });
          }
          continue;
        }

        const inst = comp._instances.get(entry.path);
        if (!inst) continue;

        // Scripts only run in play mode
        if (this.engine.simulationPaused) continue;

        // Call onStart() before the very first onUpdate() — mirrors Unity behaviour
        if (!inst._started) {
          inst._started = true;
          try {
            inst.onStart?.();
          } catch (err) {
            DebugConsole.LogError(`[ScriptSystem] onStart error in "${entry.path}": ${err}`);
          }
        }

        try {
          if (this.updateTimeout > 0) {
            const t0 = performance.now();
            inst.onUpdate?.(dt);
            const elapsed = performance.now() - t0;
            if (elapsed > this.updateTimeout) {
              DebugConsole.LogWarning(`[ScriptSystem] "${entry.path}" exceeded ${this.updateTimeout}ms in onUpdate (${elapsed.toFixed(1)}ms)`);
            }
          } else {
            inst.onUpdate?.(dt);
          }
          this.tickCoroutines(inst, dt, nowSec);
        } catch (err) {
          DebugConsole.LogError(`[ScriptSystem] onUpdate error in "${entry.path}": ${err}`);
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
          inst.onFixedUpdate?.(dt);
          this.tickCoroutines(inst, dt, nowSec);
        } catch (err) {
          DebugConsole.LogError(`[ScriptSystem] onFixedUpdate error in "${entry.path}": ${err}`);
        }
      }
    }
  }

  onSceneClear(): void {
    const ecs = this.engine.ecs;
    for (const entity of ecs.getAllEntities()) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp) continue;
      this.destroyAll(comp);
    }
  }

  destroy(): void {
    this.onSceneClear();
  }

  // ── Internal ─────────────────────────────────────────────

  private async loadScript(
    entity: EntityId,
    comp: ScriptComponent,
    entry: ScriptEntry,
    ecs: ECSManager,
  ): Promise<void> {
    const fs = getFileSystem();
    let absPath: string;
    try {
      absPath = projectManager.resolvePath(entry.path);
    } catch {
      absPath = entry.path;
    }

    const source = await fs.readFile(absPath);

    // Guard: entity or component might have been removed while loading
    if (!ecs.entityExists(entity)) return;
    if (!comp._loading.has(entry.path)) return; // invalidated (hot reload)

    let compiled: string;
    try {
      compiled = compileScript(source, absPath);
    } catch (err) {
      DebugConsole.LogError(`[ScriptSystem] Compile error in "${entry.path}": ${err}`);
      comp._loading.delete(entry.path);
      return;
    }

    let ScriptClass: any;
    try {
      ScriptClass = loadScriptClass(compiled, FluxionScript);
    } catch (err) {
      DebugConsole.LogError(`[ScriptSystem] Runtime load error in "${entry.path}": ${err}`);
      comp._loading.delete(entry.path);
      return;
    }

    if (!ScriptClass) {
      DebugConsole.LogWarning(`[ScriptSystem] "${entry.path}" has no default export.`);
      comp._loading.delete(entry.path);
      return;
    }

    // Instantiate and inject context using underscore-prefixed internals
    const instance = new ScriptClass() as FluxionScript;
    instance.entity = entity;
    instance._ecs = ecs;
    instance._engine = this.engine;
    instance._input = this.input;
    instance._renderer = this.renderer as any;
    instance._audio = this.audio;
    instance._cleanupFns = [];

    // Apply inspector property overrides
    for (const [key, val] of Object.entries(entry.properties)) {
      const current = (instance as any)[key];
      if (current instanceof EntityRef && val && typeof val === 'object') {
        // Restore EntityRef — copy entityId, keep the requireComponent constraint.
        current.entity = typeof val.entity === 'number' ? val.entity : null;
      } else {
        (instance as any)[key] = val;
      }
    }

    // Store instance — onStart() is deferred until the first update() tick in play mode
    instance._started = false;
    comp._instances.set(entry.path, instance);
    comp._loading.delete(entry.path);
  }

  /** Called when play mode stops — clears coroutines, runs cleanup listeners, and resets start flags on all instances. */
  onSimulationStop(): void {
    const ecs = this.engine.ecs;
    for (const entity of ecs.getAllEntities()) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp) continue;
      for (const inst of comp._instances.values()) {
        if (!inst) continue;
        if (Array.isArray(inst._cleanupFns)) {
          for (const fn of inst._cleanupFns) {
            try { fn(); } catch {}
          }
          inst._cleanupFns = [];
        }
        inst._coroutines?.clear();
        inst._started = false;
      }
    }
  }

  private tickCoroutines(inst: FluxionScript, _dt: number, now: number): void {
    if (!inst._coroutines.size) return;
    for (const [id, state] of inst._coroutines) {
      if (now < state.waitUntil) continue;
      let result: IteratorResult<any>;
      try {
        result = state.gen.next();
      } catch (err) {
        DebugConsole.LogError(`[ScriptSystem] Coroutine error: ${err}`);
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
      // plain yield → resume next frame (waitUntil stays at 0)
    }
  }

  private destroyAll(comp: ScriptComponent): void {
    for (const [path, inst] of comp._instances) {
      try {
        inst?.onDestroy?.();
      } catch (err) {
        DebugConsole.LogError(`[ScriptSystem] onDestroy error in "${path}": ${err}`);
      }
      // Run auto-cleanup listeners registered via this.on()
      if (Array.isArray(inst?._cleanupFns)) {
        for (const fn of inst._cleanupFns) {
          try { fn(); } catch {}
        }
      }
      // Clear any running coroutines
      inst?._coroutines?.clear();
    }
    comp._instances.clear();
    comp._loading.clear();
  }
}
