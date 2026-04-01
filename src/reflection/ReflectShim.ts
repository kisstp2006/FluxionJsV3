// ============================================================
// FluxionJS V3 — Reflection System: Minimal Reflect API Shim
// ============================================================
//
// Provides a subset of the reflect-metadata API without external dependencies.
// This shim implements only what the reflection system needs:
//   - defineMetadata: Store metadata on targets
//   - getMetadata: Retrieve metadata with prototype chain lookup
//   - hasMetadata: Check metadata existence
//   - metadata: Decorator factory helper
//
// Storage is implemented via WeakMap for memory safety.
//
// ============================================================

// ── Metadata Storage ─────────────────────────────────────────────────────────

/**
 * Internal metadata database.
 * Maps target objects -> metadata key -> value
 */
const MetadataDatabase = new WeakMap<object, Map<symbol | string, unknown>>();

// ── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Get or create the metadata map for a target.
 */
function getMetadataMap(target: object): Map<symbol | string, unknown> {
  let map = MetadataDatabase.get(target);
  if (!map) {
    map = new Map();
    MetadataDatabase.set(target, map);
  }
  return map;
}

/**
 * Get metadata value from a specific target only (no prototype chain).
 */
function getOwnMetadata(
  key: symbol | string,
  target: object,
  propertyKey?: string | symbol,
): unknown {
  const targetKey = propertyKey !== undefined
    ? `${String(propertyKey)}:${String(key)}`
    : key;
  
  const map = MetadataDatabase.get(target);
  return map?.get(targetKey);
}

/**
 * Set metadata value on a specific target.
 */
function setOwnMetadata(
  key: symbol | string,
  value: unknown,
  target: object,
  propertyKey?: string | symbol,
): void {
  const map = getMetadataMap(target);
  const targetKey = propertyKey !== undefined
    ? `${String(propertyKey)}:${String(key)}`
    : key;
  
  map.set(targetKey, value);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Define metadata on a target.
 * 
 * @param key - Metadata key (string or symbol)
 * @param value - Metadata value
 * @param target - Target object (class constructor or prototype)
 * @param propertyKey - Optional property key for property-level metadata
 */
export function defineMetadata(
  key: symbol | string,
  value: unknown,
  target: object,
  propertyKey?: string | symbol,
): void {
  if (typeof target !== 'object' && typeof target !== 'function') {
    throw new TypeError('Metadata target must be an object or function');
  }
  
  setOwnMetadata(key, value, target, propertyKey);
}

/**
 * Get metadata from a target, walking the prototype chain if needed.
 * 
 * @param key - Metadata key
 * @param target - Target object
 * @param propertyKey - Optional property key
 * @returns The metadata value, or undefined if not found
 */
export function getMetadata(
  key: symbol | string,
  target: object,
  propertyKey?: string | symbol,
): unknown {
  if (typeof target !== 'object' && typeof target !== 'function') {
    throw new TypeError('Metadata target must be an object or function');
  }
  
  // Check own metadata first
  let value = getOwnMetadata(key, target, propertyKey);
  if (value !== undefined) {
    return value;
  }
  
  // Walk prototype chain for inherited metadata
  let prototype = Object.getPrototypeOf(target);
  while (prototype !== null && prototype !== Object.prototype) {
    value = getOwnMetadata(key, prototype, propertyKey);
    if (value !== undefined) {
      return value;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  
  return undefined;
}

/**
 * Check if metadata exists on target or its prototype chain.
 * 
 * @param key - Metadata key
 * @param target - Target object
 * @param propertyKey - Optional property key
 * @returns True if metadata exists
 */
export function hasMetadata(
  key: symbol | string,
  target: object,
  propertyKey?: string | symbol,
): boolean {
  return getMetadata(key, target, propertyKey) !== undefined;
}

/**
 * Check if metadata exists on target only (not inherited).
 * 
 * @param key - Metadata key
 * @param target - Target object
 * @param propertyKey - Optional property key
 * @returns True if own metadata exists
 */
export function hasOwnMetadata(
  key: symbol | string,
  target: object,
  propertyKey?: string | symbol,
): boolean {
  if (typeof target !== 'object' && typeof target !== 'function') {
    throw new TypeError('Metadata target must be an object or function');
  }
  
  return getOwnMetadata(key, target, propertyKey) !== undefined;
}

/**
 * Delete metadata from a target.
 * 
 * @param key - Metadata key
 * @param target - Target object
 * @param propertyKey - Optional property key
 * @returns True if metadata was deleted
 */
export function deleteMetadata(
  key: symbol | string,
  target: object,
  propertyKey?: string | symbol,
): boolean {
  const map = MetadataDatabase.get(target);
  if (!map) return false;
  
  const targetKey = propertyKey !== undefined
    ? `${String(propertyKey)}:${String(key)}`
    : key;
  
  return map.delete(targetKey);
}

/**
 * Get all metadata keys for a target.
 * 
 * @param target - Target object
 * @param propertyKey - Optional property key
 * @returns Array of metadata keys
 */
export function getMetadataKeys(
  target: object,
  propertyKey?: string | symbol,
): (symbol | string)[] {
  if (typeof target !== 'object' && typeof target !== 'function') {
    throw new TypeError('Metadata target must be an object or function');
  }
  
  const keys: (symbol | string)[] = [];
  const prefix = propertyKey !== undefined ? `${String(propertyKey)}:` : '';
  
  // Collect from target and prototype chain
  let current: object | null = target;
  while (current !== null && current !== Object.prototype) {
    const map = MetadataDatabase.get(current);
    if (map) {
      for (const key of map.keys()) {
        if (propertyKey !== undefined) {
          if (typeof key === 'string' && key.startsWith(prefix)) {
            const actualKey = key.slice(prefix.length);
            if (!keys.includes(actualKey)) {
              keys.push(actualKey);
            }
          }
        } else {
          if (!keys.includes(key)) {
            keys.push(key);
          }
        }
      }
    }
    current = Object.getPrototypeOf(current);
  }
  
  return keys;
}

/**
 * Decorator factory helper.
 * Creates a decorator that attaches metadata to the target.
 * 
 * @param key - Metadata key
 * @param value - Metadata value
 * @returns Decorator function
 */
export function metadata(
  key: symbol | string,
  value: unknown,
): (target: object, propertyKey?: string | symbol) => void {
  return function (target: object, propertyKey?: string | symbol): void {
    defineMetadata(key, value, target, propertyKey);
  };
}

// ── Symbol Keys for Internal Use ──────────────────────────────────────────────

/**
 * Generate a unique symbol key for metadata.
 * Use this to create collision-resistant metadata keys.
 */
export function createMetadataKey(name: string): symbol {
  return Symbol.for(`fluxion:reflection:${name}`);
}

// ── Predefined Metadata Keys ─────────────────────────────────────────────────

/** Key for class-level script metadata */
export const SCRIPT_METADATA_KEY = createMetadataKey('script');

/** Key for property metadata storage (holds the full Map) */
export const PROPERTIES_METADATA_KEY = createMetadataKey('properties');

/** Key for method metadata storage (holds the full Map) */
export const METHODS_METADATA_KEY = createMetadataKey('methods');

/** Key for design:type metadata (TypeScript emitDecoratorMetadata) */
export const DESIGN_TYPE_KEY = createMetadataKey('design:type');

/** Key for design:paramtypes metadata */
export const DESIGN_PARAM_TYPES_KEY = createMetadataKey('design:paramtypes');

/** Key for design:returntype metadata */
export const DESIGN_RETURN_TYPE_KEY = createMetadataKey('design:returntype');
