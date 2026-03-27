// ============================================================
// FluxionJS V3 — BaseComponent
// Abstract base class for all engine components.
//
// Provides:
//   · `type` getter aliasing `typeId` (ECS interface compatibility)
//   · Lifecycle hooks: onCreate, onDestroy, onEnable, onDisable
//   · Auto serialize/deserialize from @field metadata
//   · Component-level version migration via migrateFrom()
// ============================================================

import type { EntityId } from './ECS';
import type { DeserializationContext } from './SerializationContext';
import { getFields, getComponentMeta } from './ComponentDecorators';
import * as THREE from 'three';

export abstract class BaseComponent {
  /**
   * Unique string identifier. Set as a readonly literal on each subclass.
   *   readonly typeId = 'Transform';
   */
  abstract readonly typeId: string;

  /**
   * Alias for `typeId` — satisfies the existing ECS `Component` interface
   * (`readonly type: string`) without any changes to ECS.ts.
   * Lives on the prototype, so `Object.keys(instance)` won't include it.
   */
  get type(): string { return this.typeId; }

  entityId: EntityId = 0;
  enabled = true;
  __dirty?: boolean;
  __dirtyProps?: Set<string>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  // Execution contract (enforced by ECSManager):
  //
  //  addComponent(entity, comp):
  //    comp.entityId = entity
  //    comp.onCreate?.()
  //    if comp.enabled → comp.onEnable?.()
  //
  //  removeComponent(entity, type):
  //    if comp.enabled → comp.onDisable?.()
  //    comp.onDestroy?.()
  //    comp.entityId = 0
  //
  //  enabled toggle false→true:  comp.onEnable?.()
  //  enabled toggle true→false:  comp.onDisable?.()

  onCreate?(): void;
  onDestroy?(): void;
  onEnable?(): void;
  onDisable?(): void;

  // ── Auto-serialize from @field metadata ───────────────────────────────────

  /**
   * Serialize this component to a plain JSON-compatible object.
   *
   * Default: iterates @field metadata, skips `noSerialize` fields,
   * and converts THREE types to arrays.
   *
   * Override for complex cases (MeshRenderer, Script).
   */
  serialize(): Record<string, any> {
    const fields = getFields(this);
    const meta   = getComponentMeta(this.constructor as Function);
    const out: Record<string, any> = { __v: meta?.version ?? 1 };
    for (const f of fields) {
      if (f.noSerialize) continue;
      out[f.key] = serializeValue((this as any)[f.key]);
    }
    return out;
  }

  /**
   * Restore state from a plain JSON-compatible object.
   *
   * Default: iterates @field metadata, skips `noSerialize` fields,
   * converts array payloads back to THREE types.
   * Calls `migrateFrom()` if the serialized version is older.
   *
   * Override for complex cases (MeshRenderer, Script, async asset loads).
   */
  deserialize(data: Record<string, any>, _ctx: DeserializationContext): void {
    const fields       = getFields(this);
    const meta         = getComponentMeta(this.constructor as Function);
    const dataVersion  = typeof data.__v === 'number' ? data.__v : 1;
    const classVersion = meta?.version ?? 1;

    if (dataVersion < classVersion) {
      this.migrateFrom?.(dataVersion, data);
    }

    for (const f of fields) {
      if (f.noSerialize) continue;
      if (!(f.key in data)) continue;
      (this as any)[f.key] = deserializeValue(data[f.key], (this as any)[f.key]);
    }
  }

  /**
   * Override to handle schema migration between versions.
   * Called by `deserialize()` when `data.__v < component version`.
   *
   * Mutate `data` in-place to bring it up to the current version,
   * then let `deserialize()` apply the rest normally.
   *
   * @param fromVersion  The version stored in the file
   * @param data         The raw serialized data object (mutable)
   */
  migrateFrom?(fromVersion: number, data: Record<string, any>): void;
}

// ── Field value serialization helpers ────────────────────────────────────────

/**
 * Convert a field value to a JSON-compatible primitive.
 * THREE types are serialized as compact arrays.
 */
export function serializeValue(val: unknown): unknown {
  if (val instanceof THREE.Color)   return [val.r, val.g, val.b];
  if (val instanceof THREE.Vector3) return [val.x, val.y, val.z];
  if (val instanceof THREE.Vector2) return [val.x, val.y];
  if (val instanceof THREE.Euler)   return [val.x, val.y, val.z];
  return val;
}

/**
 * Restore a field value from its serialized form.
 * Uses `current` to detect the expected type (THREE instances are mutated in-place).
 */
export function deserializeValue(raw: unknown, current: unknown): unknown {
  if (raw === null || raw === undefined) return current;

  if (Array.isArray(raw)) {
    if (current instanceof THREE.Color && raw.length >= 3)
      return current.setRGB(raw[0] as number, raw[1] as number, raw[2] as number);
    if (current instanceof THREE.Vector3 && raw.length >= 3)
      return current.set(raw[0] as number, raw[1] as number, raw[2] as number);
    if (current instanceof THREE.Vector2 && raw.length >= 2)
      return current.set(raw[0] as number, raw[1] as number);
    if (current instanceof THREE.Euler && raw.length >= 3)
      return current.set(raw[0] as number, raw[1] as number, raw[2] as number);
    // Unknown array — return as-is (plain data)
    return raw;
  }

  return raw;
}
