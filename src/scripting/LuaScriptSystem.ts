// ============================================================
// FluxionJS V3 — Lua Script System
// Loads and drives .lua user scripts via the wasmoon runtime.
// Adapters are stored in the same ScriptComponent._instances map
// as TS/JS scripts so the base ScriptSystem handles lifecycle
// calls (start / update / fixedUpdate / lateUpdate / onDestroy)
// transparently — LuaScriptSystem only handles async loading.
//
// Requires:  npm install wasmoon
// ============================================================

import * as THREE from 'three';
import type { System, ECSManager, EntityId } from '../core/ECS';
import type { Engine } from '../core/Engine';
import type { InputManager } from '../input/InputManager';
import type { FluxionRenderer } from '../renderer/Renderer';
import type { AudioSystem } from '../audio/AudioSystem';
import { ScriptComponent, ScriptEntry } from '../core/Components';
import { FluxionBehaviour } from './FluxionBehaviour';
import { AnimationRef } from './AnimationRef';
import { FontRef } from './FontRef';
import { DebugConsole } from '../core/DebugConsole';
import { projectManager } from '../project/ProjectManager';
import { getFileSystem } from '../filesystem';

// ── Mathf constants re-exported for Lua globals ───────────────

const LUA_MATHF = {
  PI: Math.PI, TAU: Math.PI * 2,
  Deg2Rad: Math.PI / 180, Rad2Deg: 180 / Math.PI,
  lerp:    (a: number, b: number, t: number) => a + (b - a) * t,
  clamp:   (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v)),
  clamp01: (v: number) => Math.max(0, Math.min(1, v)),
  smoothstep: (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  },
  approximately: (a: number, b: number) => Math.abs(a - b) < 1e-6,
  moveTowards: (cur: number, tgt: number, d: number) =>
    Math.abs(tgt - cur) <= d ? tgt : cur + Math.sign(tgt - cur) * d,
  abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
  sin: Math.sin, cos:  Math.cos,  atan2: Math.atan2, sqrt:  Math.sqrt,
  sign: Math.sign, pow: Math.pow, min:   Math.min,   max:   Math.max,
};

// ── LuaBehaviourAdapter ────────────────────────────────────────
// Extends FluxionBehaviour so it lives in comp._instances and
// ScriptSystem drives its lifecycle calls automatically.

class LuaBehaviourAdapter extends FluxionBehaviour {
  /** @internal */ _luaEngine: any;            // wasmoon LuaEngine
  private _has: Record<string, boolean> = {};  // cached function existence

  constructor(lua: any) {
    super();
    this._luaEngine = lua;
    for (const fn of ['start', 'update', 'fixedUpdate', 'lateUpdate', 'onDestroy']) {
      this._has[fn] = lua.global.get(fn) != null;
    }
  }

  private _luaCall(name: string, ...args: any[]): void {
    if (!this._has[name]) return;
    try {
      this._luaEngine.global.call(name, ...args);
    } catch (err) {
      DebugConsole.LogError(`[Lua:${name}] ${err}`);
    }
  }

  start()                { this._luaCall('start'); }
  update(dt: number)     { this._luaCall('update', dt); }
  fixedUpdate(dt: number){ this._luaCall('fixedUpdate', dt); }
  lateUpdate(dt: number) { this._luaCall('lateUpdate', dt); }
  onDestroy()            {
    this._luaCall('onDestroy');
    try { (this._luaEngine as any).global?.close?.(); } catch {}
  }
}

// ── LuaScriptSystem ────────────────────────────────────────────

export class LuaScriptSystem implements System {
  readonly name = 'LuaScriptSystem';
  readonly requiredComponents = ['Script'];
  /** Run before ScriptSystem (priority 100) so instances are ready on the same frame */
  priority = 99;
  enabled  = true;

  private engine:   Engine;
  private input:    InputManager;
  private renderer: FluxionRenderer | null;
  private audio:    AudioSystem    | null;
  /** Lazily initialised wasmoon LuaFactory (dynamic import on first use). */
  private _factory: any = null;

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

  /** Trigger async loading for any unloaded .lua script entries. */
  update(entities: Set<EntityId>, ecs: ECSManager, _dt: number): void {
    for (const entity of entities) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp || !comp.enabled) continue;
      for (const entry of comp.scripts) {
        if (!entry.enabled || !entry.path || !entry.path.endsWith('.lua')) continue;
        if (comp._instances.has(entry.path) || comp._loading.has(entry.path)) continue;
        // Allow loading even when paused — tool scripts (__tool = true) need to
        // start running in edit mode; non-tool scripts will simply have their
        // lifecycle skipped by ScriptSystem until play mode begins.

        const tok = Symbol();
        comp._loading.set(entry.path, tok);
        this._loadScript(entity, comp, entry, ecs, tok).catch((err) => {
          DebugConsole.LogError(`[LuaScriptSystem] Failed to load "${entry.path}": ${err}`);
          if (comp._loading.get(entry.path) === tok) comp._loading.delete(entry.path);
        });
      }
    }
  }

  fixedUpdate(_entities: Set<EntityId>, _ecs: ECSManager, _dt: number): void {}
  lateUpdate (_entities: Set<EntityId>, _ecs: ECSManager, _dt: number): void {}

  onSceneClear(): void {}

  /** Called when play mode stops — resets Lua script instances so onStart() re-arms next session. */
  onSimulationStop(): void {
    const ecs = this.engine.ecs;
    for (const entity of ecs.getAllEntities()) {
      const comp = ecs.getComponent<ScriptComponent>(entity, 'Script');
      if (!comp) continue;
      for (const [path, inst] of comp._instances) {
        if (!path.endsWith('.lua') || !inst) continue;
        if (Array.isArray(inst._cleanupFns)) {
          for (const fn of inst._cleanupFns) { try { fn(); } catch {} }
          inst._cleanupFns = [];
        }
        inst._coroutines?.clear();
        inst._started = false;
      }
    }
  }

  destroy(): void {}

  // ── Private ──────────────────────────────────────────────────

  private async _loadScript(
    entity: EntityId,
    comp:   ScriptComponent,
    entry:  ScriptEntry,
    ecs:    ECSManager,
    token:  symbol,
  ): Promise<void> {
    const fs = getFileSystem();
    let absPath: string;
    try {
      absPath = projectManager.resolvePath(entry.path);
    } catch {
      absPath = entry.path;
    }

    const source = await fs.readFile(absPath);
    if (!ecs.entityExists(entity)) return;
    if (comp._loading.get(entry.path) !== token) return; // stale load — a newer reload superseded this one

    // ── Lazy-init wasmoon LuaFactory ───────────────────────────
    if (!this._factory) {
      try {
        const { LuaFactory } = await import('wasmoon');
        this._factory = new LuaFactory();
      } catch {
        DebugConsole.LogError(
          '[LuaScriptSystem] wasmoon is not installed — run: npm install wasmoon',
        );
        if (comp._loading.get(entry.path) === token) comp._loading.delete(entry.path);
        return;
      }
    }

    let lua: any;
    try {
      lua = await this._factory.createEngine();
    } catch (err) {
      DebugConsole.LogError(`[LuaScriptSystem] Lua engine creation failed: ${err}`);
      if (comp._loading.get(entry.path) === token) comp._loading.delete(entry.path);
      return;
    }

    // ── Inject globals ─────────────────────────────────────────
    lua.global.set('Vec2',  (x: number, y: number) => new THREE.Vector2(x, y));
    lua.global.set('Vec3',  (x: number, y: number, z: number) => new THREE.Vector3(x, y, z));
    lua.global.set('Vec4',  (x: number, y: number, z: number, w: number) => new THREE.Vector4(x, y, z, w));
    lua.global.set('Quat',  () => new THREE.Quaternion());
    lua.global.set('Color', (r: number, g: number, b: number) => new THREE.Color(r, g, b));
    lua.global.set('Mathf', LUA_MATHF);

    // ── Typed ref constructors (mirrors JS/TS API) ──────────────
    // EntityRef(requireComponent?)      → {entity: null, requireComponent?}
    // AnimationRef(path?, clip?)        → AnimationRef instance
    // FuiRef/MaterialRef/TextureRef()   → default empty path string
    lua.global.set('EntityRef',   (req?: string) => ({ entity: null, requireComponent: req ?? undefined }));
    lua.global.set('AnimationRef', (path?: string, clip?: string) => new AnimationRef(path ?? '', clip ?? ''));
    lua.global.set('FontRef',     (path?: string, family?: string) => new FontRef(path ?? '', family ?? ''));
    lua.global.set('FuiRef',      () => '');
    lua.global.set('MaterialRef', () => '');
    lua.global.set('TextureRef',  () => '');

    // ── Create adapter first so 'self' is available during execution ──
    const adapter = new LuaBehaviourAdapter(lua);
    adapter.entity    = entity;
    adapter._ecs      = ecs;
    adapter._engine   = this.engine;
    adapter._input    = this.input;
    adapter._renderer = this.renderer as any;
    adapter._audio    = this.audio;
    adapter._cleanupFns = [];

    lua.global.set('self', adapter);

    // ── Apply inspector property overrides as Lua globals ──────
    // EntityRef overrides: { entity: number } → set as number (entity ID, -1 = unset)
    // FuiRef/MaterialRef/TextureRef overrides: { path: string } → set as string path
    // Primitives (number, string, boolean) → set directly
    for (const [key, val] of Object.entries(entry.properties ?? {})) {
      if (val !== null && typeof val === 'object' && 'entity' in val) {
        lua.global.set(key, typeof (val as any).entity === 'number' ? (val as any).entity : -1);
      } else if (val !== null && typeof val === 'object' && 'path' in val) {
        lua.global.set(key, typeof (val as any).path === 'string' ? (val as any).path : '');
      } else {
        lua.global.set(key, val);
      }
    }

    // ── Execute script source (defines start / update / etc.) ──
    try {
      await lua.doString(source);
    } catch (err) {
      DebugConsole.LogError(`[LuaScriptSystem] Script error in "${entry.path}": ${err}`);
      try { lua.global.close?.(); } catch {}
      if (comp._loading.get(entry.path) === token) comp._loading.delete(entry.path);
      return;
    }

    // Re-scan which lifecycle functions are defined (doString may have added them)
    for (const fn of ['start', 'update', 'fixedUpdate', 'lateUpdate', 'onDestroy']) {
      (adapter as any)._has[fn] = lua.global.get(fn) != null;
    }

    // Mark as tool script if __tool = true was declared at the top level
    adapter._isTool = lua.global.get('__tool') === true;

    if (comp._loading.get(entry.path) !== token) return; // stale — a newer reload superseded this one
    comp._instances.set(entry.path, adapter);
    comp._loading.delete(entry.path);
  }
}
