// ============================================================
// FluxionJS V3 — Component Decorators
// TypeScript 5 stage-3 decorators for metadata-driven components.
//
// Design:
//   @field decorators push to a module-level staging array at class
//   DEFINITION time (not instance time). @component consumes and
//   freezes the staged fields. Zero per-instance overhead.
//
// Usage:
//   @component({ typeId: 'Light', displayName: 'Light', category: 'Rendering' })
//   class LightComponent extends BaseComponent {
//     @field({ type: 'slider', label: 'Intensity', min: 0, max: 10 })
//     intensity = 1;
//
//     @field({ type: 'select', label: 'Type', options: [...] })
//     lightType: LightType = 'point';
//
//     @field({ type: 'number', label: 'Range',
//              visibleIf: s => s.lightType !== 'ambient', dependsOn: ['lightType'] })
//     range = 10;
//   }
// ============================================================

export type FieldType =
  | 'number'
  | 'slider'
  | 'boolean'
  | 'string'
  | 'select'
  | 'color'
  | 'vector3'
  | 'vector2'
  | 'asset'
  | 'euler'; // euler = display in degrees, store in radians

export interface FieldMeta {
  key: string;
  type: FieldType;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  /** Asset type(s) for 'asset' fields — e.g. 'texture' or ['material', 'visual_material'] */
  assetType?: string | string[];
  /** Inspector group name — renders as a collapsible sub-section */
  group?: string;
  /** Predicate controlling visibility in the inspector */
  visibleIf?: (self: any) => boolean;
  /** Field keys that trigger re-evaluation of visibleIf (optimization) */
  dependsOn?: string[];
  /** Show as read-only in inspector */
  readOnly?: boolean;
  /** Skip this field in auto serialize/deserialize (runtime-only value) */
  noSerialize?: boolean;
  /** For vector3 fields: adds a proportional-scale lock button */
  uniformScale?: boolean;
  /** Safe fallback used by auto-deserialize when key is missing */
  defaultValue?: unknown;
}

export interface ComponentMeta {
  typeId: string;
  displayName: string;
  /** Category shown in the Add Component menu */
  category?: string;
  icon?: string;
  /** If false, the component cannot be removed from an entity */
  removable?: boolean;
  /** If false, hidden from the Add Component menu (default: true) */
  showInAddMenu?: boolean;
  /** If true, the same component can be added multiple times to one entity */
  allowMultiple?: boolean;
  /** Icon shown in the Hierarchy panel when this component is on an entity */
  hierarchyIcon?: { icon: string; color?: string };
  /** Higher priority wins when multiple components have hierarchy icons */
  hierarchyIconPriority?: number;
  /** Schema version — increment when the serialized shape changes */
  version?: number;
}

// ── Module-level staging array ────────────────────────────────────────────────
// @field decorators push metadata here at class definition time.
// @component consumes and resets it.
// TypeScript guarantees: all @field calls for a class finish before @component runs.

let _pendingFields: FieldMeta[] = [];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class decorator — declares component metadata and commits all staged @field entries.
 * Must be applied AFTER @field decorators (i.e., placed above the class body).
 */
export function component(meta: ComponentMeta) {
  return function <T extends abstract new (...args: any[]) => any>(
    target: T,
    _ctx: ClassDecoratorContext,
  ): T {
    (target as any).__componentMeta = { version: 1, showInAddMenu: true, allowMultiple: false, ...meta };
    (target as any).__componentFields = Object.freeze([..._pendingFields]);
    _pendingFields = []; // Reset for next class
    return target;
  };
}

/**
 * Property decorator — registers a field for inspector generation and auto-serialization.
 * Runs at class definition time; zero per-instance cost.
 */
export function field(meta: Omit<FieldMeta, 'key'>) {
  return function (_target: undefined, context: ClassFieldDecoratorContext): void {
    _pendingFields.push({ key: String(context.name), ...meta });
  };
}

// ── Metadata accessors ────────────────────────────────────────────────────────
// All O(1) — read directly from constructor own-properties set by decorators.

/** Get ComponentMeta for a constructor (O(1)) */
export function getComponentMeta(ctor: Function): ComponentMeta | undefined {
  return (ctor as any).__componentMeta;
}

/** Get field descriptors for a live instance (O(1) via constructor lookup) */
export function getFields(instance: object): readonly FieldMeta[] {
  return (instance as any).constructor.__componentFields ?? EMPTY_FIELDS;
}

/** Get field descriptors directly from a constructor (O(1)) */
export function getFieldsForClass(ctor: Function): readonly FieldMeta[] {
  return (ctor as any).__componentFields ?? EMPTY_FIELDS;
}

const EMPTY_FIELDS: readonly FieldMeta[] = Object.freeze([]);
