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
import { projectManager } from '../project/ProjectManager';
import { getFileSystem } from '../filesystem';

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
              console.error(`[ScriptSystem] Failed to load "${entry.path}":`, err);
              comp._loading.delete(entry.path);
            });
          }
          continue;
        }

        const inst = comp._instances.get(entry.path);
        if (!inst) continue;
        try {
          inst.onUpdate?.(dt);
        } catch (err) {
          console.error(`[ScriptSystem] onUpdate error in "${entry.path}":`, err);
        }
      }
    }
  }

  fixedUpdate(entities: Set<EntityId>, ecs: ECSManager, dt: number): void {
    for (const entity of entities) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp || !comp.enabled) continue;
      for (const entry of comp.scripts) {
        if (!entry.enabled) continue;
        const inst = comp._instances.get(entry.path);
        if (!inst) continue;
        try {
          inst.onFixedUpdate?.(dt);
        } catch (err) {
          console.error(`[ScriptSystem] onFixedUpdate error in "${entry.path}":`, err);
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
      console.error(`[ScriptSystem] Compile error in "${entry.path}":`, err);
      comp._loading.delete(entry.path);
      return;
    }

    let ScriptClass: any;
    try {
      ScriptClass = loadScriptClass(compiled, FluxionScript);
    } catch (err) {
      console.error(`[ScriptSystem] Runtime load error in "${entry.path}":`, err);
      comp._loading.delete(entry.path);
      return;
    }

    if (!ScriptClass) {
      console.warn(`[ScriptSystem] "${entry.path}" has no default export.`);
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
      (instance as any)[key] = val;
    }

    // Store before calling onStart so onStart can access the instance
    comp._instances.set(entry.path, instance);
    comp._loading.delete(entry.path);

    try {
      instance.onStart?.();
    } catch (err) {
      console.error(`[ScriptSystem] onStart error in "${entry.path}":`, err);
    }
  }

  private destroyAll(comp: ScriptComponent): void {
    for (const [path, inst] of comp._instances) {
      try {
        inst?.onDestroy?.();
      } catch (err) {
        console.error(`[ScriptSystem] onDestroy error in "${path}":`, err);
      }
      // Run auto-cleanup listeners registered via this.on()
      if (Array.isArray(inst?._cleanupFns)) {
        for (const fn of inst._cleanupFns) {
          try { fn(); } catch {}
        }
      }
    }
    comp._instances.clear();
    comp._loading.clear();
  }
}
