// ============================================================
// FluxionJS V3 — Meta System: Shared Type Definitions
// ============================================================

export interface EngineDef {
  /** Engine schema version */
  version: string;
  /** All registered component definitions */
  components: ComponentDef[];
}

export interface ComponentDef {
  typeId: string;
  displayName: string;
  category: string;
  icon?: string;
  requires: string[];
  fields: FieldDef[];
  /** True for deprecated API aliases (e.g. FluxionScript). */
  deprecated?: boolean;
  /** Absolute source file path — only set for user-discovered scripts. */
  filePath?: string;
  /** Human-readable description emitted in generated API docs. */
  description?: string;
  /** Directory stem used when two classes share the same name (collision resolution). */
  namespace?: string;
}

export interface FieldDef {
  key: string;
  /** Matches FieldType from ComponentDecorators */
  type: string;
  label: string;
  /** true when the field has a visibleIf predicate */
  optional: boolean;
  defaultValue: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  /** For 'asset' fields — e.g. 'texture' or 'material' */
  assetType?: string | string[];
  group?: string;
  description?: string;
  /** For type:'array' — the element field type (e.g. 'vector3', 'number') */
  itemType?: string;
  /** For type:'union' — the possible field types */
  unionTypes?: string[];
  /** True for readonly arrays/tuples — emits readonly keyword in TypeScript */
  readOnly?: boolean;
  /** For tuple types [T, U, V] — the ordered element types */
  tupleTypes?: string[];
}
