// ============================================================
// FluxionJS V3 — Reflection System: Metadata Type Definitions
// ============================================================

/**
 * Supported property types for the editor and serialization.
 * Mirrors the existing FieldType from ComponentDecorators but
 * is extensible for future reflection needs.
 */
export type PropertyType =
  | 'number'      // Generic number
  | 'int'         // Integer-only
  | 'slider'      // Number with range slider UI
  | 'boolean'
  | 'string'
  | 'textarea'    // Multi-line string
  | 'select'      // Dropdown with options
  | 'color'
  | 'vector3'
  | 'vector2'
  | 'euler'       // Euler angles (display in degrees, store radians)
  | 'asset'       // Reference to an asset file
  | 'entity'      // Reference to another entity
  | 'scene'       // Reference to a scene file
  | 'array'       // Array of elements
  | 'union'       // Union of multiple types
  | 'curve'       // Animation curve
  | 'gradient'    // Color gradient
  | 'button'      // Inspector-only button
  | 'header'      // Inspector section header
  | 'separator';  // Inspector horizontal separator

/**
 * Metadata for a single method parameter.
 */
export interface ParameterMetadata {
  /** Parameter name (extracted from source if available) */
  name: string;
  
  /** Type string (e.g., 'number', 'Vector3', 'string | null') */
  type: string;
  
  /** True if parameter is optional */
  optional?: boolean;
  
  /** Default value if parameter is optional */
  defaultValue?: unknown;
  
  /** Description for documentation */
  description?: string;
}

/**
 * Metadata for a class method exposed to scripts.
 */
export interface MethodMetadata {
  /** Method name */
  key: string;
  
  /** Return type as string */
  returnType?: string;
  
  /** Parameter definitions in order */
  parameters: ParameterMetadata[];
  
  /** Human-readable description */
  description?: string;
  
  /** True if method is async (returns Promise) */
  isAsync?: boolean;
  
  /** True if method is a generator */
  isGenerator?: boolean;
  
  /** True to hide from public API (internal use only). */
  internal?: boolean;
  
  /** Tags for categorization (serialization, networking, editor filtering) */
  tags?: string[];
}

/**
 * Validation constraint for numeric properties.
 */
export interface NumericConstraint {
  /** Minimum value (inclusive) */
  min?: number;
  
  /** Maximum value (inclusive) */
  max?: number;
  
  /** Step size for increment/decrement */
  step?: number;
}

/**
 * Select option for dropdown properties.
 */
export interface SelectOption {
  /** Internal value */
  value: string;
  
  /** Display label */
  label: string;
}

/**
 * Metadata for a class property/field.
 */
export interface PropertyMetadata {
  /** Property name/key */
  key: string;
  
  /** Property type for editor and serialization */
  type: PropertyType;
  
  /** Display label in inspector (defaults to key) */
  label?: string;
  
  /** Tooltip/description in inspector */
  description?: string;
  
  /** Group name for inspector organization */
  group?: string;
  
  /** Default value for the property */
  defaultValue?: unknown;
  
  /** True if property should not be serialized */
  transient?: boolean;
  
  /** True if property is read-only in inspector */
  readOnly?: boolean;
  
  /** True if property is optional (may be undefined) */
  optional?: boolean;
  
  /** Numeric constraints (for number/int/slider types) */
  numericConstraint?: NumericConstraint;
  
  /** Options for 'select' type */
  options?: SelectOption[];
  
  /** Asset type filter (for 'asset' type) */
  assetType?: string | string[];
  
  /** Element type for 'array' type */
  itemType?: string;
  
  /** Union types for 'union' type */
  unionTypes?: string[];
  
  /** Tuple element types for fixed-size arrays */
  tupleTypes?: string[];
  
  /** Button handler method name (for 'button' type) */
  onClick?: string;
  
  /** For type:'textarea' — number of visible text rows (default 3) */
  rows?: number;
  
  /** Tags for categorization (serialization, networking, editor filtering) */
  tags?: string[];
  
  /** Validation function (runtime validation) */
  validate?: (value: unknown, instance: object) => boolean | string;
  
  /** Visibility predicate (controls inspector visibility) */
  visibleIf?: (instance: object) => boolean;
  
  /** Field keys that trigger visibleIf re-evaluation */
  visibleIfDependsOn?: string[];
  
  /** True for uniform scale lock (for vector3 fields) */
  uniformScale?: boolean;
}

/**
 * Hierarchy icon rule for scene hierarchy visualization.
 */
export interface HierarchyIconRule {
  /** Icon identifier (e.g., 'Camera', 'Light', 'Mesh') */
  icon: string;
  
  /** Optional color override */
  color?: string;
  
  /** Higher priority wins when multiple components have icons */
  priority: number;
}

/**
 * Class-level metadata for scriptable components.
 */
export interface ScriptMetadata {
  /** Unique type identifier (e.g., 'PlayerController', 'CameraComponent') */
  typeId: string;
  
  /** Human-readable display name */
  displayName: string;
  
  /** Category for organization (e.g., 'Gameplay', 'Physics', 'Rendering') */
  category: string;
  
  /** Optional namespace for collision resolution */
  namespace?: string;
  
  /** Description for documentation and tooltips */
  description?: string;
  
  /** Icon identifier for the component */
  icon?: string;
  
  /** Schema version for serialization compatibility */
  version: number;
  
  /** True if component can be added multiple times to one entity */
  allowMultiple?: boolean;
  
  /** False to hide from Add Component menu */
  showInAddMenu?: boolean;
  
  /** False to prevent removal from entity */
  removable?: boolean;
  
  /** typeIds of required components */
  requires?: string[];
  
  /** True if component is deprecated */
  deprecated?: boolean;
  
  /** Hierarchy icon configuration */
  hierarchyIcon?: HierarchyIconRule;
}

/**
 * Complete metadata descriptor for a registered class.
 * Used internally by the reflection registry.
 */
export interface ClassDescriptor {
  /** Class constructor */
  ctor: new (...args: any[]) => object;
  
  /** Class-level metadata */
  scriptMeta: ScriptMetadata;
  
  /** Property metadata map (key -> metadata) */
  properties: Map<string, PropertyMetadata>;
  
  /** Method metadata map (key -> metadata) */
  methods: Map<string, MethodMetadata>;
  
  /** Base class constructor (for inheritance tracking) */
  baseClass?: Function;
}

/**
 * Engine definition produced by aggregating all registered scripts.
 * Compatible with MetaTypes.EngineDef for API generation.
 */
export interface ReflectionEngineDef {
  /** Schema version */
  version: string;
  
  /** All registered class descriptors */
  classes: ReflectionClassDef[];
}

/**
 * Class definition for engine def output.
 */
export interface ReflectionClassDef {
  typeId: string;
  displayName: string;
  category: string;
  namespace?: string;
  description?: string;
  icon?: string;
  requires: string[];
  deprecated?: boolean;
  
  /** Serialized property definitions */
  properties: ReflectionPropertyDef[];
  
  /** Exposed method definitions */
  methods: ReflectionMethodDef[];
}

/**
 * Property definition for engine def output.
 * Simplified version of PropertyMetadata for serialization.
 */
export interface ReflectionPropertyDef {
  key: string;
  type: PropertyType;
  label: string;
  description?: string;
  optional: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: SelectOption[];
  assetType?: string | string[];
  itemType?: string;
  unionTypes?: string[];
  tupleTypes?: string[];
  readOnly?: boolean;
  transient?: boolean;
  group?: string;
}

/**
 * Method definition for engine def output.
 */
export interface ReflectionMethodDef {
  key: string;
  returnType?: string;
  parameters: ParameterMetadata[];
  description?: string;
  isAsync?: boolean;
}
