// ============================================================
// FluxionJS V3 — Component Registry
// Single source of truth for all registered component classes.
//
// Features:
//   · O(1) lookup by typeId (Map-backed)
//   · Freeze after Engine.init() — no late registration
//   · Plugin support via registerExternal()
//   · FNV-32a hash collision detection (binary format safety)
//   · getAddableByCategory(), getHierarchyIconRules()
// ============================================================

import { BaseComponent } from './BaseComponent';
import { getComponentMeta, getFieldsForClass } from './ComponentDecorators';
import type { FieldMeta, ComponentMeta } from './ComponentDecorators';
import { fnv32a } from './BinaryUtils';

import {
  TransformComponent,
  MeshRendererComponent,
  CameraComponent,
  LightComponent,
  RigidbodyComponent,
  ColliderComponent,
  CharacterControllerComponent,
  ScriptComponent,
  ParticleEmitterComponent,
  AudioSourceComponent,
  SpriteComponent,
  TextRendererComponent,
  FuiComponent,
  AnimationComponent,
  EnvironmentComponent,
  CSGBrushComponent,
  FogVolumeComponent,
} from './Components';

// ── Public API types ──────────────────────────────────────────────────────────

export interface ComponentRegistration {
  meta: ComponentMeta;
  ctor: new () => BaseComponent;
  /** All @field metadata for this component class, frozen at registration. */
  fields: readonly FieldMeta[];
}

// ── Registry Implementation ───────────────────────────────────────────────────

class ComponentRegistryImpl {
  private map     = new Map<string, ComponentRegistration>(); // typeId → registration
  private hashes  = new Map<number, string>();               // hash → typeId (collision tracking)
  private _frozen = false;

  // ── Registration ────────────────────────────────────────────────────────────

  /** Register a built-in component class. */
  register(ctor: new () => BaseComponent): void {
    this._register(ctor);
  }

  /**
   * Register an external / plugin component class.
   * Same behaviour as register() — exists as a named entry point for plugins.
   * Throws if called after the registry has been frozen.
   */
  registerExternal(ctor: new () => BaseComponent): void {
    this._register(ctor);
  }

  private _register(ctor: new () => BaseComponent): void {
    if (this._frozen) {
      throw new Error(
        `[ComponentRegistry] Registry is frozen — cannot register "${(ctor as any).name}" after engine init.`
      );
    }
    const meta = getComponentMeta(ctor as unknown as Function);
    if (!meta) {
      throw new Error(
        `[ComponentRegistry] "${(ctor as any).name}" is missing the @component decorator.`
      );
    }
    if (this.map.has(meta.typeId)) {
      throw new Error(
        `[ComponentRegistry] Duplicate typeId "${meta.typeId}" — already registered by another class.`
      );
    }

    const fields = getFieldsForClass(ctor as unknown as Function);
    this.map.set(meta.typeId, { meta, ctor, fields });

    // Track FNV-32a hash for binary format safety
    const hash = fnv32a(meta.typeId);
    const existing = this.hashes.get(hash);
    if (existing !== undefined) {
      console.warn(
        `[ComponentRegistry] Hash collision: "${meta.typeId}" ↔ "${existing}" ` +
        `(hash 0x${hash.toString(16).padStart(8, '0')}). ` +
        `Binary format will use string fallback for both.`
      );
    } else {
      this.hashes.set(hash, meta.typeId);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /** Freeze the registry — called by Engine.init() after all components are registered. */
  freeze(): void {
    this._frozen = true;
  }

  get isFrozen(): boolean {
    return this._frozen;
  }

  // ── Lookup ───────────────────────────────────────────────────────────────────

  get(typeId: string): ComponentRegistration | undefined {
    return this.map.get(typeId);
  }

  has(typeId: string): boolean {
    return this.map.has(typeId);
  }

  getAll(): ComponentRegistration[] {
    return [...this.map.values()];
  }

  /** Components whose meta.showInAddMenu !== false. */
  getAddable(): ComponentRegistration[] {
    return this.getAll().filter(r => r.meta.showInAddMenu !== false);
  }

  /** Create a fresh default instance of the given typeId, or undefined if not found. */
  create(typeId: string): BaseComponent | undefined {
    const r = this.map.get(typeId);
    return r ? new r.ctor() : undefined;
  }

  // ── Editor helpers ───────────────────────────────────────────────────────────

  /**
   * Returns a map of category name → registrations for all addable components.
   * Components without a category fall under "General".
   * Computed on demand (call once and cache via useMemo in the UI).
   */
  getAddableByCategory(): Map<string, ComponentRegistration[]> {
    const result = new Map<string, ComponentRegistration[]>();
    for (const r of this.getAddable()) {
      const cat = r.meta.category ?? 'General';
      let arr = result.get(cat);
      if (!arr) { arr = []; result.set(cat, arr); }
      arr.push(r);
    }
    return result;
  }

  /**
   * Returns hierarchy icon rules sorted by priority descending.
   * Cache with useMemo in HierarchyPanel — never changes after freeze().
   */
  getHierarchyIconRules(): Array<{
    typeId: string;
    icon: string;
    color?: string;
    priority: number;
  }> {
    const rules: Array<{ typeId: string; icon: string; color?: string; priority: number }> = [];
    for (const r of this.map.values()) {
      if (r.meta.hierarchyIcon) {
        rules.push({
          typeId:   r.meta.typeId,
          icon:     r.meta.hierarchyIcon.icon,
          color:    r.meta.hierarchyIcon.color,
          priority: r.meta.hierarchyIconPriority ?? 0,
        });
      }
    }
    return rules.sort((a, b) => b.priority - a.priority);
  }

  // ── Binary format helpers ────────────────────────────────────────────────────

  /**
   * Resolve a typeId from its FNV-32a hash.
   * Returns null if the hash is unknown or if it is a colliding hash
   * (caller must fall back to the embedded string).
   */
  resolveHash(hash: number): string | null {
    if (this.isHashColliding(hash)) return null;
    return this.hashes.get(hash) ?? null;
  }

  /**
   * Returns true when more than one registered typeId produces the same FNV-32a hash.
   * In that case the binary format writes the typeId string verbatim instead.
   */
  isHashColliding(hash: number): boolean {
    const id = this.hashes.get(hash);
    if (id === undefined) return false;
    let count = 0;
    for (const k of this.map.keys()) {
      if (fnv32a(k) === hash) { count++; if (count > 1) return true; }
    }
    return false;
  }
}

export const ComponentRegistry = new ComponentRegistryImpl();

// ── Auto-register all built-in components ────────────────────────────────────

[
  TransformComponent,
  MeshRendererComponent,
  CameraComponent,
  LightComponent,
  RigidbodyComponent,
  ColliderComponent,
  CharacterControllerComponent,
  ScriptComponent,
  ParticleEmitterComponent,
  AudioSourceComponent,
  SpriteComponent,
  TextRendererComponent,
  FuiComponent,
  AnimationComponent,
  EnvironmentComponent,
  CSGBrushComponent,
  FogVolumeComponent,
].forEach(ctor => ComponentRegistry.register(ctor));
