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
import { FuiRef } from './FuiRef';
import { MaterialRef } from './MaterialRef';
import { TextureRef } from './TextureRef';
import { SceneRef } from './SceneRef';
import { ColorRef } from './ColorRef';
import { EntityRef } from './EntityRef';
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
    lua.global.set('EntityRef',   (req?: string) => new EntityRef(req));
    lua.global.set('AnimationRef', (path?: string, clip?: string) => new AnimationRef(path ?? '', clip ?? ''));
    lua.global.set('FontRef',     (path?: string, family?: string) => new FontRef(path ?? '', family ?? ''));
    lua.global.set('FuiRef',      (path?: string) => new FuiRef(path ?? ''));
    lua.global.set('MaterialRef', (path?: string) => new MaterialRef(path ?? ''));
    lua.global.set('TextureRef',  (path?: string) => new TextureRef(path ?? ''));
    lua.global.set('SceneRef',    (path?: string) => new SceneRef(path ?? ''));
    lua.global.set('ColorRef',    (hex?: string)  => new ColorRef(hex ?? '#ffffff'));

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

    // ── Inject self.ui — mirrors this.ui from FluxionBehaviour ─
    const _engine = this.engine;
    const _fuiRT  = () => _engine.ecs.getSystem<any>('FuiRuntime');
    const _fui    = () => _engine.ecs.getComponent(entity, 'Fui') as any;
    const _luaUi = {
      /** Change the text of a label or button node. */
      setText(nodeId: string, text: string): void {
        _fuiRT()?.setNodeText?.(entity, nodeId, text);
      },
      /** Show or hide the border of a button node. */
      setBorder(nodeId: string, enabled: boolean): void {
        _fuiRT()?.setNodeBorder?.(entity, nodeId, enabled);
      },
      /** Enable or disable the glow effect on a label/textArea node. */
      setGlowEnabled(nodeId: string, enabled: boolean): void {
        _fuiRT()?.setNodeGlowEnabled?.(entity, nodeId, enabled);
      },
      /** Set the glow color on a label/textArea node. */
      setGlowColor(nodeId: string, color: string): void {
        _fuiRT()?.setNodeGlowColor?.(entity, nodeId, color);
      },
      /** Set the glow blur radius (1–40) on a label/textArea node. */
      setGlowStrength(nodeId: string, strength: number): void {
        _fuiRT()?.setNodeGlowStrength?.(entity, nodeId, strength);
      },
      /** Change the image source of an image or button node (project-relative path). */
      setImage(nodeId: string, src: string): void {
        _fuiRT()?.setNodeImage?.(entity, nodeId, src);
      },
      show():  void { const c = _fui(); if (c) c.enabled = true;  },
      hide():  void { const c = _fui(); if (c) c.enabled = false; },
      setVisible(v: boolean): void { const c = _fui(); if (c) c.enabled = v; },
      /** Register a click listener for the given button node ID. */
      onButtonClick(nodeId: string, cb: () => void): void {
        const unsub = _engine.events.on('ui:click', (d: any) => {
          if (d.entity === entity && d.elementId === nodeId) cb();
        });
        adapter._cleanupFns.push(unsub);
      },
    };
    // FluxionBehaviour defines `ui` as a getter-only on the prototype.
    // Use defineProperty to shadow it on this specific instance.
    Object.defineProperty(adapter, 'ui', {
      configurable: true,
      enumerable:   true,
      get: () => _luaUi,
    });

    // ── Apply inspector property overrides as Lua globals ──────
    // Dispatch by __type so all ref fields (clip, family, hex, etc.) are preserved.
    for (const [key, val] of Object.entries(entry.properties ?? {})) {
      if (val === null || val === undefined) { lua.global.set(key, val); continue; }
      const t = (val as any).__type as string | undefined;
      if (t === 'EntityRef') {
        const ref = new EntityRef((val as any).requireComponent);
        ref.entity = typeof (val as any).entity === 'number' ? (val as any).entity : null;
        lua.global.set(key, ref);
      } else if (t === 'AnimationRef') {
        lua.global.set(key, new AnimationRef(
          typeof (val as any).path   === 'string' ? (val as any).path   : '',
          typeof (val as any).clip   === 'string' ? (val as any).clip   : '',
        ));
      } else if (t === 'FontRef') {
        lua.global.set(key, new FontRef(
          typeof (val as any).path   === 'string' ? (val as any).path   : '',
          typeof (val as any).family === 'string' ? (val as any).family : '',
        ));
      } else if (t === 'FuiRef') {
        lua.global.set(key, new FuiRef(typeof (val as any).path === 'string' ? (val as any).path : ''));
      } else if (t === 'MaterialRef') {
        lua.global.set(key, new MaterialRef(typeof (val as any).path === 'string' ? (val as any).path : ''));
      } else if (t === 'TextureRef') {
        lua.global.set(key, new TextureRef(typeof (val as any).path === 'string' ? (val as any).path : ''));
      } else if (t === 'SceneRef') {
        lua.global.set(key, new SceneRef(typeof (val as any).path === 'string' ? (val as any).path : ''));
      } else if (t === 'ColorRef') {
        lua.global.set(key, new ColorRef(typeof (val as any).hex === 'string' ? (val as any).hex : '#ffffff'));
      } else if (typeof val === 'object' && 'entity' in (val as any)) {
        // Legacy EntityRef (pre-__type): inject as entity ID number
        lua.global.set(key, typeof (val as any).entity === 'number' ? (val as any).entity : -1);
      } else if (typeof val === 'object' && 'path' in (val as any) && 'clip' in (val as any)) {
        // Duck-type AnimationRef: { path, clip }
        lua.global.set(key, new AnimationRef(
          typeof (val as any).path === 'string' ? (val as any).path : '',
          typeof (val as any).clip === 'string' ? (val as any).clip : '',
        ));
      } else if (typeof val === 'object' && 'path' in (val as any) && 'family' in (val as any)) {
        // Duck-type FontRef: { path, family }
        lua.global.set(key, new FontRef(
          typeof (val as any).path   === 'string' ? (val as any).path   : '',
          typeof (val as any).family === 'string' ? (val as any).family : '',
        ));
      } else if (typeof val === 'object' && 'hex' in (val as any) && !('path' in (val as any))) {
        // Duck-type ColorRef: { hex }
        lua.global.set(key, new ColorRef(typeof (val as any).hex === 'string' ? (val as any).hex : '#ffffff'));
      } else if (typeof val === 'object' && 'path' in (val as any)) {
        // Generic path ref (FuiRef / MaterialRef / TextureRef / SceneRef) — inject path string
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
