// ============================================================
// FluxionJS V3 — Reflection System
// Public API Exports
// ============================================================
//
// This module provides the foundation for decorator-based metadata
// reflection in FluxionJS. It enables:
//
//   - Scripting API generation
//   - Editor property inspection
//   - Runtime method invocation
//   - Serialization pipelines
//
// Usage:
//   import { Script, Property, Expose, getAllProperties } from './reflection';
//
//   @Script({ typeId: 'PlayerController', category: 'Gameplay' })
//   class PlayerController {
//     @Property({ type: 'slider', min: 0, max: 100 })
//     speed: number = 50;
//
//     @Expose()
//     move(direction: Vector3): void { }
//   }
//
//   // Runtime introspection
//   const meta = getClass(PlayerController);
//   const props = getAllProperties(PlayerController); // ReadonlyMap
//
// ============================================================

// ── Type Definitions ───────────────────────────────────────────────────────────

export type {
  PropertyType,
  PropertyMetadata,
  MethodMetadata,
  ParameterMetadata,
  ScriptMetadata,
  ClassDescriptor,
  ReflectionEngineDef,
  ReflectionClassDef,
  ReflectionPropertyDef,
  ReflectionMethodDef,
  SelectOption,
  NumericConstraint,
  HierarchyIconRule,
} from './types';

export type {
  ResolvedProperty,
  ResolvedPropertyMap,
  NormalizedProperty,
} from './MetadataStorage';

// ── Decorators ────────────────────────────────────────────────────────────────

export {
  Script,
  Property,
  Expose,
  Transient,
  Range,
  ReadOnly,
  Validate,
} from './decorators';

export type {
  ScriptOptions,
  PropertyOptions,
  ExposeOptions,
} from './decorators';

// ── Core Storage API ─────────────────────────────────────────────────────────

export {
  // Class operations
  defineClass,
  getClass,
  hasClass,

  // Property operations
  defineProperty,
  getProperty,
  getAllProperties,
  hasProperty,
  getOwnProperties,

  // Method operations
  defineMethod,
  getMethod,
  getAllMethods,
  hasMethod,
  getOwnMethods,

  // Inheritance utilities
  getBaseClass,
  getInheritanceChain,

  // Metadata management
  clearMetadata,
  clearAllCaches,

  // Versioning
  getMetadataVersion,

  // Resolver layer
  resolveProperties,
  normalizeProperty,

  // UI registry
  registerUI,
  getUI,

  // Debug
  getDebugStats,
} from './MetadataStorage';
