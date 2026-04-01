// ============================================================
// FluxionJS V3 — Reflection System: Metadata Storage Engine (Hardened)
// ============================================================
//
// Central storage for decorator-based reflection metadata.
// 
// Design Principles:
//   - O(1) lookups via WeakMap
//   - Constructor-only storage (never use prototype as key)
//   - Structural inheritance with deep merge
//   - Immutable metadata (frozen objects)
//   - Cached inheritance resolution
//   - No external dependencies (ReflectShim removed)
//
// ============================================================

import type {
  ScriptMetadata,
  PropertyMetadata,
  MethodMetadata,
  PropertyType,
  SelectOption,
} from './types';

// ── Storage Types ────────────────────────────────────────────────────────────

type PropertyMap = Map<string, PropertyMetadata>;
type MethodMap = Map<string, MethodMetadata>;

// ── Environment ──────────────────────────────────────────────────────────────

/** True in development — enables deep freeze for mutation safety. */
const __DEV__: boolean =
  typeof process !== 'undefined'
    ? process.env.NODE_ENV !== 'production'
    : true;

// ── Versioned Cache Entry ─────────────────────────────────────────────────────

interface CacheEntry<T> {
  version: number;
  data: T;
}

// ── Merge Strategy ────────────────────────────────────────────────────────────

type MergeStrategy = 'override' | 'concat' | 'merge';

/**
 * Per-field merge rules used during structural inheritance merges.
 * 'override' — child value replaces parent (default)
 * 'concat'   — arrays are combined (parent first, child appended)
 * 'merge'    — plain objects are shallow-merged (child wins on conflict)
 */
const mergeRules: Record<string, MergeStrategy> = {
  tags:     'concat',
  requires: 'concat',
  default:  'override',
};

// ── Resolved Property ─────────────────────────────────────────────────────────

/** Normalised, editor-ready descriptor produced by resolveProperties(). */
export interface ResolvedProperty {
  /** Property key */
  key: string;
  /** UI widget identifier (e.g. 'Slider', 'Checkbox', 'Vec3Input') */
  ui: string;
  /** Raw property type from the decorator */
  type: PropertyType;
  /** Display label */
  label: string;
  /** Numeric range [min, max] — present for slider/number/int types */
  range?: [number, number];
  /** Step size for numeric inputs */
  step?: number;
  /** Dropdown options */
  options?: SelectOption[];
  /** True if the field is read-only in the inspector */
  readOnly: boolean;
  /** True if the field is excluded from serialization */
  transient: boolean;
  /** True if the field is optional */
  optional: boolean;
  /** Always true — marks this object as normalised */
  normalized: true;
  /** Original raw metadata — deeply frozen, do not cast away Readonly */
  readonly _raw: Readonly<PropertyMetadata>;
}

/** ReadonlyMap of resolved, editor-ready property descriptors. */
export type ResolvedPropertyMap = ReadonlyMap<string, ResolvedProperty>;

// ── Normalized Property ───────────────────────────────────────────────────────

/**
 * Phase 1 output: raw PropertyMetadata with ALL defaults explicitly filled in.
 * Produced by normalizeProperty(). Safe to read without null-checking optional fields.
 */
export interface NormalizedProperty {
  key:          string;
  type:         PropertyType;
  label:        string;
  description?: string;
  group?:       string;
  defaultValue?: unknown;
  transient:    boolean;
  readOnly:     boolean;
  optional:     boolean;
  numericConstraint?: {
    min:  number;
    max:  number;
    step: number;
  };
  options?:           SelectOption[];
  assetType?:         string | string[];
  itemType?:          string;
  unionTypes?:        string[];
  tupleTypes?:        string[];
  tags:               string[];
  visibleIf?:         (instance: object) => boolean;
  visibleIfDependsOn: string[];
  /** Original raw metadata (deeply frozen) */
  readonly _raw: Readonly<PropertyMetadata>;
}

// ── Metadata Versioning ─────────────────────────────────────────────────────

/** Internal metadata version for cache invalidation */
let globalMetadataVersion = 0;

function bumpMetadataVersion(): void {
  globalMetadataVersion++;
}

export function getMetadataVersion(): number {
  return globalMetadataVersion;
}

// ── WeakMap Storage ──────────────────────────────────────────────────────────

/** Class-level metadata: Constructor -> ScriptMetadata */
const classRegistry = new WeakMap<Function, ScriptMetadata>();

/** Property metadata: Constructor -> PropertyMap */
const propertyRegistry = new WeakMap<Function, PropertyMap>();

/** Method metadata: Constructor -> MethodMap */
const methodRegistry = new WeakMap<Function, MethodMap>();

/** Cache for resolved inheritance: Constructor -> Versioned PropertyMap */
let propertyCache = new WeakMap<Function, CacheEntry<Map<string, PropertyMetadata>>>();

/** Cache for resolved inheritance: Constructor -> Versioned MethodMap */
let methodCache = new WeakMap<Function, CacheEntry<Map<string, MethodMetadata>>>();

/** Parent → children tracking for recursive cache invalidation */
const childrenRegistry = new WeakMap<Function, Set<Function>>();

/** Cache for editor-ready resolved property maps */
let resolvedCache = new WeakMap<Function, CacheEntry<ResolvedPropertyMap>>();

/** Debug tracking for statistics */
const debugRegistry = new Set<Function>();

// ── Deep Freeze Utility ─────────────────────────────────────────────────────

/**
 * Recursively freeze an object and its nested properties.
 * Used to ensure metadata immutability.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    obj.forEach(item => deepFreeze(item));
    return Object.freeze(obj) as T;
  }
  
  // Handle objects
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = (obj as any)[name];
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  
  return Object.freeze(obj) as T;
}

// ── Conditional Freeze ───────────────────────────────────────────────────────

/**
 * Apply immutability based on the current environment.
 * DEV  → deep-freeze: catches accidental nested mutations during development.
 * PROD → shallow freeze: lower overhead at runtime.
 */
function freeze<T>(obj: T): T {
  return __DEV__ ? deepFreeze(obj) : (Object.freeze(obj) as T);
}

// ── Structural Merge Utility ────────────────────────────────────────────────

/**
 * Perform a shallow merge of two metadata objects.
 * Child properties override parent properties.
 * Nested objects are NOT deeply merged (they are replaced).
 * 
 * @param parent - Parent metadata (fallback values)
 * @param child - Child metadata (override values)
 * @returns New merged metadata object
 */
/**
 * Apply the configured merge strategy for a specific metadata field.
 * Falls back to 'override' if no rule matches.
 */
function applyMergeStrategy(
  key: string,
  parentVal: unknown,
  childVal: unknown,
): unknown {
  if (childVal === undefined) return parentVal;
  if (parentVal === undefined) return childVal;

  const strategy: MergeStrategy = mergeRules[key] ?? mergeRules['default'] ?? 'override';

  switch (strategy) {
    case 'concat':
      if (Array.isArray(parentVal) && Array.isArray(childVal)) {
        return [...parentVal, ...childVal];
      }
      return childVal;
    case 'merge':
      if (
        typeof parentVal === 'object' && parentVal !== null && !Array.isArray(parentVal) &&
        typeof childVal  === 'object' && childVal  !== null && !Array.isArray(childVal)
      ) {
        return { ...(parentVal as object), ...(childVal as object) };
      }
      return childVal;
    case 'override':
    default:
      return childVal;
  }
}

function mergeMetadata<T extends Record<string, any>>(
  parent: T,
  child: Partial<T>,
): T {
  const result: Record<string, unknown> = { ...parent };

  for (const [key, value] of Object.entries(child)) {
    result[key] = applyMergeStrategy(key, (parent as any)[key], value);
  }

  return freeze(result as T);
}

/**
 * Merge a parent property map with a child property map.
 * Child properties with the same key get structurally merged with parent.
 * 
 * @param parentMap - Parent properties
 * @param childMap - Child properties
 * @returns New merged map
 */
function mergePropertyMaps(
  parentMap: Map<string, PropertyMetadata>,
  childMap: Map<string, PropertyMetadata>,
): Map<string, PropertyMetadata> {
  const result = new Map<string, PropertyMetadata>(parentMap);
  
  for (const [key, childMeta] of childMap) {
    const parentMeta = result.get(key);
    if (parentMeta) {
      // Structural merge: child overrides parent fields
      result.set(key, mergeMetadata(parentMeta, childMeta));
    } else {
      // New property, add directly
      result.set(key, childMeta);
    }
  }
  
  return result;
}

/**
 * Merge a parent method map with a child method map.
 * Child methods with the same key get structurally merged with parent.
 */
function mergeMethodMaps(
  parentMap: Map<string, MethodMetadata>,
  childMap: Map<string, MethodMetadata>,
): Map<string, MethodMetadata> {
  const result = new Map<string, MethodMetadata>(parentMap);
  
  for (const [key, childMeta] of childMap) {
    const parentMeta = result.get(key);
    if (parentMeta) {
      // Structural merge
      result.set(key, mergeMetadata(parentMeta, childMeta));
    } else {
      result.set(key, childMeta);
    }
  }
  
  return result;
}

// ── Cache Invalidation ───────────────────────────────────────────────────────

/**
 * Register a parent → child relationship for recursive invalidation.
 * Called when building inheritance chains in getAllProperties / getAllMethods.
 */
function registerChildRelationship(child: Function, parent: Function): void {
  let children = childrenRegistry.get(parent);
  if (!children) {
    children = new Set<Function>();
    childrenRegistry.set(parent, children);
  }
  children.add(child);
}

/**
 * Recursively invalidate caches for a class and ALL its known descendants.
 * Ensures no stale data remains after a metadata update anywhere in the chain.
 */
function invalidateRecursive(ctor: Function): void {
  propertyCache.delete(ctor);
  methodCache.delete(ctor);
  resolvedCache.delete(ctor);

  const children = childrenRegistry.get(ctor);
  if (children) {
    for (const child of children) {
      invalidateRecursive(child);
    }
  }
}

/**
 * Eagerly register a class's parent in childrenRegistry at definition time.
 * This ensures invalidateRecursive() has full knowledge of the inheritance
 * graph before any cache is ever built — not just after the first query.
 *
 * Safe to call multiple times: Set.add() is idempotent.
 */
function ensureParentRegistered(ctor: Function): void {
  const parent = Object.getPrototypeOf(ctor);
  if (
    typeof parent === 'function' &&
    parent !== Object &&
    parent !== Function.prototype
  ) {
    registerChildRelationship(ctor, parent);
  }
}

// ── Class Metadata API ─────────────────────────────────────────────────────────

/**
 * Define class-level metadata for a constructor.
 * 
 * @param ctor - Class constructor
 * @param metadata - Script metadata to attach
 * @throws TypeError if ctor is not a function
 */
export function defineClass(ctor: Function, metadata: ScriptMetadata): void {
  if (typeof ctor !== 'function') {
    throw new TypeError('defineClass: ctor must be a function');
  }
  
  // Freeze metadata for immutability
  const frozenMeta = freeze({ ...metadata });

  // Store in WeakMap
  classRegistry.set(ctor, frozenMeta);

  // Eagerly register parent relationship before any cache is built
  ensureParentRegistered(ctor);

  // Track for debug statistics
  debugRegistry.add(ctor);

  // Invalidate caches for this class and all known descendants
  invalidateRecursive(ctor);

  // Bump global version for version-aware caches
  bumpMetadataVersion();
}

/**
 * Get class-level metadata for a constructor.
 * Returns undefined if no metadata is defined.
 * 
 * @param ctor - Class constructor
 * @returns ScriptMetadata or undefined (frozen)
 */
export function getClass(ctor: Function): ScriptMetadata | undefined {
  if (typeof ctor !== 'function') {
    return undefined;
  }
  
  return classRegistry.get(ctor);
}

/**
 * Check if a constructor has class-level metadata.
 */
export function hasClass(ctor: Function): boolean {
  return getClass(ctor) !== undefined;
}

// ── Property Metadata API ────────────────────────────────────────────────────

/**
 * Define property metadata on a class.
 * 
 * CRITICAL: This function stores metadata keyed by the CLASS CONSTRUCTOR,
 * not by prototype. This ensures consistency across the entire system.
 * 
 * @param ctor - Class constructor (NOT prototype)
 * @param key - Property key/name
 * @param metadata - Property metadata (will be frozen)
 */
export function defineProperty(
  ctor: Function,
  key: string | symbol,
  metadata: PropertyMetadata,
): void {
  if (typeof ctor !== 'function') {
    throw new TypeError('defineProperty: ctor must be a function');
  }
  
  const stringKey = String(key);
  
  // Get or create property map for this class
  let propMap = propertyRegistry.get(ctor);
  if (!propMap) {
    propMap = new Map();
    propertyRegistry.set(ctor, propMap);
  }

  // Eagerly register parent relationship before any cache is built
  ensureParentRegistered(ctor);

  // Freeze metadata before storing
  const frozenMeta = freeze({ ...metadata });

  // Store metadata
  propMap.set(stringKey, frozenMeta);

  // Invalidate caches for this class and all known descendants
  invalidateRecursive(ctor);

  // Bump global version for version-aware caches
  bumpMetadataVersion();

  // Track for debug
  debugRegistry.add(ctor);
}

/**
 * Get property metadata for a specific key on a class.
 * Walks the prototype chain to find inherited metadata.
 * Returns a FROZEN copy (safe for consumers).
 * 
 * @param ctor - Class constructor
 * @param key - Property key
 * @returns PropertyMetadata or undefined (frozen)
 */
export function getProperty(ctor: Function, key: string): PropertyMetadata | undefined {
  if (typeof ctor !== 'function') {
    return undefined;
  }
  
  // Walk the inheritance chain (child -> parent)
  let current: Function | null = ctor;
  while (current && current !== Object) {
    const propMap = propertyRegistry.get(current);
    if (propMap?.has(key)) {
      return propMap.get(key); // Already frozen
    }
    
    current = Object.getPrototypeOf(current);
  }
  
  return undefined;
}

/**
 * Get all properties for a class, including inherited ones.
 * Properties are STRUCTURALLY MERGED (child fields override parent fields).
 * Results are CACHED for performance.
 * Returns a READONLY Map (new instance on each call for safety).
 * 
 * @param ctor - Class constructor
 * @returns Readonly Map of property key -> metadata
 */
export function getAllProperties(ctor: Function): ReadonlyMap<string, PropertyMetadata> {
  if (typeof ctor !== 'function') {
    return new Map();
  }

  // Version-aware cache check
  const cached = propertyCache.get(ctor);
  if (cached && cached.version === globalMetadataVersion) {
    return new Map(cached.data);
  }

  // Build inheritance chain (child -> parent)
  const chain: Function[] = [];
  let current: Function | null = ctor;
  while (current && current !== Object) {
    chain.push(current);
    current = Object.getPrototypeOf(current);
  }

  // Register child → parent relationships for recursive invalidation
  for (let i = 0; i < chain.length - 1; i++) {
    registerChildRelationship(chain[i], chain[i + 1]);
  }

  // Process from parent to child (reverse), merging as we go
  let merged = new Map<string, PropertyMetadata>();
  for (const cls of [...chain].reverse()) {
    const propMap = propertyRegistry.get(cls);
    if (propMap) {
      merged = mergePropertyMaps(merged, propMap);
    }
  }

  // Store versioned cache entry
  propertyCache.set(ctor, { version: globalMetadataVersion, data: merged });

  return new Map(merged);
}

/**
 * Check if a property is defined on a class (own or inherited).
 */
export function hasProperty(ctor: Function, key: string): boolean {
  return getProperty(ctor, key) !== undefined;
}

/**
 * Get only the properties defined directly on a class (not inherited).
 * Returns a READONLY Map.
 */
export function getOwnProperties(ctor: Function): ReadonlyMap<string, PropertyMetadata> {
  if (typeof ctor !== 'function') {
    return new Map();
  }
  
  const propMap = propertyRegistry.get(ctor);
  return propMap ? new Map(propMap) : new Map();
}

// ── Method Metadata API ─────────────────────────────────────────────────────

/**
 * Define method metadata on a class.
 * 
 * CRITICAL: This function stores metadata keyed by the CLASS CONSTRUCTOR.
 * 
 * @param ctor - Class constructor (NOT prototype)
 * @param key - Method key/name
 * @param metadata - Method metadata (will be frozen)
 */
export function defineMethod(
  ctor: Function,
  key: string | symbol,
  metadata: MethodMetadata,
): void {
  if (typeof ctor !== 'function') {
    throw new TypeError('defineMethod: ctor must be a function');
  }
  
  const stringKey = String(key);
  
  // Get or create method map for this class
  let methodMap = methodRegistry.get(ctor);
  if (!methodMap) {
    methodMap = new Map();
    methodRegistry.set(ctor, methodMap);
  }

  // Eagerly register parent relationship before any cache is built
  ensureParentRegistered(ctor);

  // Freeze metadata
  const frozenMeta = freeze({ ...metadata });

  // Store metadata
  methodMap.set(stringKey, frozenMeta);

  // Invalidate caches for this class and all known descendants
  invalidateRecursive(ctor);

  // Bump global version for version-aware caches
  bumpMetadataVersion();

  // Track for debug
  debugRegistry.add(ctor);
}

/**
 * Get method metadata for a specific key on a class.
 * Walks the prototype chain to find inherited metadata.
 * Returns a FROZEN copy.
 */
export function getMethod(ctor: Function, key: string): MethodMetadata | undefined {
  if (typeof ctor !== 'function') {
    return undefined;
  }
  
  let current: Function | null = ctor;
  while (current && current !== Object) {
    const methodMap = methodRegistry.get(current);
    if (methodMap?.has(key)) {
      return methodMap.get(key); // Already frozen
    }
    
    current = Object.getPrototypeOf(current);
  }
  
  return undefined;
}

/**
 * Get all methods for a class, including inherited ones.
 * Methods are STRUCTURALLY MERGED with caching.
 * Returns a READONLY Map.
 */
export function getAllMethods(ctor: Function): ReadonlyMap<string, MethodMetadata> {
  if (typeof ctor !== 'function') {
    return new Map();
  }

  // Version-aware cache check
  const cached = methodCache.get(ctor);
  if (cached && cached.version === globalMetadataVersion) {
    return new Map(cached.data);
  }

  // Build inheritance chain
  const chain: Function[] = [];
  let current: Function | null = ctor;
  while (current && current !== Object) {
    chain.push(current);
    current = Object.getPrototypeOf(current);
  }

  // Register child → parent relationships for recursive invalidation
  for (let i = 0; i < chain.length - 1; i++) {
    registerChildRelationship(chain[i], chain[i + 1]);
  }

  // Merge from parent to child
  let merged = new Map<string, MethodMetadata>();
  for (const cls of [...chain].reverse()) {
    const methodMap = methodRegistry.get(cls);
    if (methodMap) {
      merged = mergeMethodMaps(merged, methodMap);
    }
  }

  // Store versioned cache entry
  methodCache.set(ctor, { version: globalMetadataVersion, data: merged });

  return new Map(merged);
}

/**
 * Check if a method is defined on a class (own or inherited).
 */
export function hasMethod(ctor: Function, key: string): boolean {
  return getMethod(ctor, key) !== undefined;
}

/**
 * Get only the methods defined directly on a class (not inherited).
 * Returns a READONLY Map.
 */
export function getOwnMethods(ctor: Function): ReadonlyMap<string, MethodMetadata> {
  if (typeof ctor !== 'function') {
    return new Map();
  }
  
  const methodMap = methodRegistry.get(ctor);
  return methodMap ? new Map(methodMap) : new Map();
}

// ── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get the base class (parent) of a given constructor.
 */
export function getBaseClass(ctor: Function): Function | null {
  if (typeof ctor !== 'function') {
    return null;
  }
  
  const parent = Object.getPrototypeOf(ctor);
  return parent && parent !== Object ? parent : null;
}

/**
 * Get the inheritance chain for a class.
 * Returns array from child to parent (excluding Object).
 */
export function getInheritanceChain(ctor: Function): Function[] {
  if (typeof ctor !== 'function') {
    return [];
  }
  
  const chain: Function[] = [];
  let current: Function | null = ctor;
  
  while (current && current !== Object) {
    chain.push(current);
    current = Object.getPrototypeOf(current);
  }
  
  return chain;
}

/**
 * Clear all metadata for a specific class and invalidate caches.
 */
export function clearMetadata(ctor: Function): void {
  if (typeof ctor !== 'function') {
    return;
  }
  
  classRegistry.delete(ctor);
  propertyRegistry.delete(ctor);
  methodRegistry.delete(ctor);
  invalidateRecursive(ctor);
  debugRegistry.delete(ctor);
  
  bumpMetadataVersion();
}

// ── Debug Statistics ─────────────────────────────────────────────────────────

/**
 * Get debug statistics about registered metadata.
 */
export function getDebugStats(): {
  globalVersion: number;
  registeredClasses: number;
  classesWithProperties: number;
  classesWithMethods: number;
} {
  let withProps = 0;
  let withMethods = 0;
  
  for (const ctor of debugRegistry) {
    if (propertyRegistry.has(ctor)) withProps++;
    if (methodRegistry.has(ctor)) withMethods++;
  }
  
  return {
    globalVersion: globalMetadataVersion,
    registeredClasses: debugRegistry.size,
    classesWithProperties: withProps,
    classesWithMethods: withMethods,
  };
}

/**
 * Clear all caches (useful for testing or memory management).
 */
export function clearAllCaches(): void {
  propertyCache  = new WeakMap();
  methodCache    = new WeakMap();
  resolvedCache  = new WeakMap();
}

// ── Metadata Resolver Layer ───────────────────────────────────────────────────────

// ── UI Registry ──────────────────────────────────────────────────────────────

/**
 * Dynamic property-type → UI widget registry.
 * Default mappings are registered below. External systems (editor plugins,
 * custom field types) can extend this at any time via registerUI().
 */
const uiRegistry = new Map<string, string>([
  ['slider',    'Slider'],
  ['number',    'NumberInput'],
  ['int',       'IntInput'],
  ['boolean',   'Checkbox'],
  ['string',    'TextInput'],
  ['textarea',  'TextArea'],
  ['color',     'ColorPicker'],
  ['vector3',   'Vec3Input'],
  ['vector2',   'Vec2Input'],
  ['euler',     'EulerInput'],
  ['select',    'Select'],
  ['asset',     'AssetPicker'],
  ['entity',    'EntityPicker'],
  ['scene',     'ScenePicker'],
  ['array',     'ArrayEditor'],
  ['union',     'UnionEditor'],
  ['curve',     'CurveEditor'],
  ['gradient',  'GradientEditor'],
  ['button',    'Button'],
  ['header',    'Header'],
  ['separator', 'Separator'],
]);

/**
 * Register (or override) the UI widget for a property type.
 * Plugins and the editor can call this to extend the system with custom types.
 *
 * @param type   - Property type string (e.g. 'my-custom-type')
 * @param widget - Widget identifier (e.g. 'MyCustomWidget')
 */
export function registerUI(type: string, widget: string): void {
  uiRegistry.set(type, widget);
}

/**
 * Get the UI widget identifier for a property type.
 * Returns 'Unknown' if no mapping exists.
 */
export function getUI(type: string): string {
  return uiRegistry.get(type) ?? 'Unknown';
}

// ── Phase 1: Normalization ────────────────────────────────────────────────────

/**
 * Normalize raw PropertyMetadata: fill all defaults, resolve implicit values.
 * Does NOT mutate the original. Returns a frozen NormalizedProperty.
 *
 * Slider defaults:  min=0,        max=100,      step=1
 * Int defaults:     min=-Infinity, max=Infinity, step=1
 * Number defaults:  min=-Infinity, max=Infinity, step=0
 */
export function normalizeProperty(meta: PropertyMetadata): NormalizedProperty {
  const nc = meta.numericConstraint;

  let normConstraint: NormalizedProperty['numericConstraint'];
  if (nc || meta.type === 'slider' || meta.type === 'number' || meta.type === 'int') {
    const isSlider = meta.type === 'slider';
    const isInt    = meta.type === 'int';
    normConstraint = {
      min:  nc?.min  ?? (isSlider ?   0 : -Infinity),
      max:  nc?.max  ?? (isSlider ? 100 :  Infinity),
      step: nc?.step ?? (isInt || isSlider ? 1 : 0),
    };
  }

  return Object.freeze({
    key:                meta.key,
    type:               meta.type,
    label:              meta.label         ?? meta.key,
    description:        meta.description,
    group:              meta.group,
    defaultValue:       meta.defaultValue,
    transient:          meta.transient      ?? false,
    readOnly:           meta.readOnly       ?? false,
    optional:           meta.optional       ?? false,
    numericConstraint:  normConstraint,
    options:            meta.options,
    assetType:          meta.assetType,
    itemType:           meta.itemType,
    unionTypes:         meta.unionTypes,
    tupleTypes:         meta.tupleTypes,
    tags:               meta.tags           ?? [],
    visibleIf:          meta.visibleIf,
    visibleIfDependsOn: meta.visibleIfDependsOn ?? [],
    _raw:               meta as Readonly<PropertyMetadata>,
  });
}

// ── Phase 2: Resolution ───────────────────────────────────────────────────────

/**
 * Resolve a NormalizedProperty into an editor-ready ResolvedProperty.
 * Maps normalized data to UI descriptors via the uiRegistry.
 * Does NOT mutate the input; returns a new frozen object.
 */
function resolveProperty(norm: NormalizedProperty): ResolvedProperty {
  const nc = norm.numericConstraint;

  return Object.freeze({
    key:        norm.key,
    ui:         getUI(norm.type),
    type:       norm.type,
    label:      norm.label,
    readOnly:   norm.readOnly,
    transient:  norm.transient,
    optional:   norm.optional,
    normalized: true as const,
    _raw:       norm._raw,
    ...(nc ? {
      range: [nc.min, nc.max] as [number, number],
      ...(nc.step !== 0 ? { step: nc.step } : {}),
    } : {}),
    ...(norm.options ? { options: norm.options } : {}),
  });
}

/**
 * Transform raw inherited metadata for a class into normalised,
 * editor-ready ResolvedProperty descriptors.
 *
 * Results are version-cached separately from the raw property cache
 * so the raw metadata remains usable by downstream tooling without
 * interference from the resolver.
 *
 * @param ctor - Class constructor
 * @returns ResolvedPropertyMap (version-cached, frozen)
 */
export function resolveProperties(ctor: Function): ResolvedPropertyMap {
  if (typeof ctor !== 'function') {
    return new Map() as ResolvedPropertyMap;
  }

  // Version-aware cache check
  const cached = resolvedCache.get(ctor);
  if (cached && cached.version === globalMetadataVersion) {
    return cached.data;
  }

  // Build from raw inherited properties
  const raw = getAllProperties(ctor);
  const result = new Map<string, ResolvedProperty>();

  for (const [key, meta] of raw) {
    result.set(key, resolveProperty(normalizeProperty(meta)));
  }

  const frozen = Object.freeze(result) as ResolvedPropertyMap;
  resolvedCache.set(ctor, { version: globalMetadataVersion, data: frozen });

  return frozen;
}
