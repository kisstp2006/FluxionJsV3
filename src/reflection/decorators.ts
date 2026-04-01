// ============================================================
// FluxionJS V3 — Reflection System: Decorators
// ============================================================
//
// TypeScript 5+ compatible decorators for metadata-driven reflection.
// All decorators use context.addInitializer() for proper class
// registration timing.
//
// Usage:
//   @Script({ typeId: 'PlayerController', category: 'Gameplay' })
//   class PlayerController {
//     @Property({ type: 'slider', min: 0, max: 100 })
//     speed: number = 50;
//
//     @Expose({ description: 'Apply damage' })
//     takeDamage(amount: number): void { }
//   }
//
// ============================================================

import type {
  ScriptMetadata,
  PropertyMetadata,
  MethodMetadata,
  ParameterMetadata,
  PropertyType,
  SelectOption,
  NumericConstraint,
} from './types';

import {
  defineClass,
  defineProperty,
  defineMethod,
} from './MetadataStorage';

// ── @Script Decorator ────────────────────────────────────────────────────────

/**
 * Options for the @Script decorator.
 */
export interface ScriptOptions {
  /** Unique type identifier. Auto-generated from class name if omitted. */
  typeId?: string;
  
  /** Human-readable display name. Defaults to typeId. */
  displayName?: string;
  
  /** Category for organization. Defaults to 'Scripts'. */
  category?: string;
  
  /** Namespace for collision resolution. */
  namespace?: string;
  
  /** Description for documentation. */
  description?: string;
  
  /** Icon identifier. */
  icon?: string;
  
  /** Schema version. Defaults to 1. */
  version?: number;
  
  /** True to allow multiple instances per entity. Defaults to false. */
  allowMultiple?: boolean;
  
  /** False to hide from Add Component menu. Defaults to true. */
  showInAddMenu?: boolean;
  
  /** False to prevent removal from entity. Defaults to true. */
  removable?: boolean;
  
  /** Required component typeIds. */
  requires?: string[];
  
  /** True to mark as deprecated. */
  deprecated?: boolean;
}

/**
 * Class decorator — marks a class as a scriptable component and registers
 * it with the metadata storage system.
 * 
 * @param options - Script metadata options
 * @returns Class decorator function
 */
export function Script(options: ScriptOptions = {}) {
  return function <T extends new (...args: any[]) => object>(
    target: T,
    context: ClassDecoratorContext<T>,
  ): T {
    // Determine the typeId from options or class name
    const className = context.name ?? target.name ?? 'Anonymous';
    const typeId = options.typeId ?? className;
    
    const metadata: ScriptMetadata = {
      typeId,
      displayName: options.displayName ?? typeId,
      category: options.category ?? 'Scripts',
      namespace: options.namespace,
      description: options.description,
      icon: options.icon,
      version: options.version ?? 1,
      allowMultiple: options.allowMultiple ?? false,
      showInAddMenu: options.showInAddMenu ?? true,
      removable: options.removable ?? true,
      requires: options.requires ?? [],
      deprecated: options.deprecated ?? false,
    };
    
    // Use addInitializer to register metadata after class is fully defined
    context.addInitializer(function () {
      defineClass(this as unknown as Function, metadata);
    });
    
    return target;
  };
}

// ── @Property Decorator ─────────────────────────────────────────────────────

/**
 * Options for the @Property decorator.
 */
export interface PropertyOptions {
  /** Property type for editor and serialization. */
  type?: PropertyType;
  
  /** Display label in inspector. Defaults to property name. */
  label?: string;
  
  /** Tooltip/description in inspector. */
  description?: string;
  
  /** Inspector group name for organization. */
  group?: string;
  
  /** Default value. */
  defaultValue?: unknown;
  
  /** True to exclude from serialization. */
  transient?: boolean;
  
  /** True for read-only in inspector. */
  readOnly?: boolean;
  
  /** Numeric constraints (for number types). */
  min?: number;
  max?: number;
  step?: number;
  
  /** Options for 'select' type. */
  options?: SelectOption[];
  
  /** Asset type filter for 'asset' type. */
  assetType?: string | string[];
  
  /** Element type for 'array' type. */
  itemType?: string;
  
  /** Union types for 'union' type. */
  unionTypes?: string[];
  
  /** Tuple element types. */
  tupleTypes?: string[];
  
  /** Visibility predicate. */
  visibleIf?: (instance: object) => boolean;
  
  /** Dependencies for visibleIf. */
  visibleIfDependsOn?: string[];
}

/**
 * Field decorator — registers a property for inspector editing and
 * serialization. Supports inheritance and property overriding.
 * 
 * @param options - Property metadata options
 * @returns Field decorator function
 */
export function Property(options: PropertyOptions = {}) {
  return function (
    _target: undefined,
    context: ClassFieldDecoratorContext,
  ): void {
    const propertyKey = String(context.name);
    
    // Determine property type from options or infer
    const type = options.type ?? 'string';
    
    // Build numeric constraint if applicable
    let numericConstraint: NumericConstraint | undefined;
    if (options.min !== undefined || options.max !== undefined || options.step !== undefined) {
      numericConstraint = {
        min: options.min,
        max: options.max,
        step: options.step,
      };
    }
    
    const metadata: PropertyMetadata = {
      key: propertyKey,
      type,
      label: options.label ?? propertyKey,
      description: options.description,
      group: options.group,
      defaultValue: options.defaultValue,
      transient: options.transient,
      readOnly: options.readOnly,
      optional: false, // Will be determined by type analysis
      numericConstraint,
      options: options.options,
      assetType: options.assetType,
      itemType: options.itemType,
      unionTypes: options.unionTypes,
      tupleTypes: options.tupleTypes,
      visibleIf: options.visibleIf,
      visibleIfDependsOn: options.visibleIfDependsOn,
    };
    
    // Use addInitializer to access the class constructor after definition
    context.addInitializer(function () {
      // 'this' in addInitializer is the class constructor
      const ctor = this as unknown as Function;
      defineProperty(ctor, context.name, metadata);
    });
  };
}

// ── Specialized Property Decorators ──────────────────────────────────────────

/**
 * Mark a property as transient (not serialized).
 * Can be combined with @Property or used standalone.
 * 
 * @example
 *   @Transient()
 *   @Property({ type: 'vector3' })
 *   cachedPosition: Vector3;
 */
export function Transient() {
  return function (
    _target: undefined,
    context: ClassFieldDecoratorContext,
  ): void {
    context.addInitializer(function () {
      const ctor = this as unknown as Function;
      const existingMeta = getPropertyMetadata(ctor, String(context.name));
      
      if (existingMeta) {
        // Update existing metadata
        existingMeta.transient = true;
        defineProperty(ctor, context.name, existingMeta);
      } else {
        // Create minimal metadata with just transient flag
        defineProperty(ctor, context.name, {
          key: String(context.name),
          type: 'string',
          transient: true,
        });
      }
    });
  };
}

/**
 * Apply numeric range constraints to a property.
 * Must be combined with @Property.
 * 
 * @param min - Minimum value
 * @param max - Maximum value
 * @param step - Step increment
 */
export function Range(min: number, max: number, step?: number) {
  return function (
    _target: undefined,
    context: ClassFieldDecoratorContext,
  ): void {
    context.addInitializer(function () {
      const ctor = this as unknown as Function;
      const existingMeta = getPropertyMetadata(ctor, String(context.name));
      
      if (existingMeta) {
        existingMeta.numericConstraint = { min, max, step };
        defineProperty(ctor, context.name, existingMeta);
      }
    });
  };
}

/**
 * Mark a property as read-only in the inspector.
 * Can be combined with @Property.
 */
export function ReadOnly() {
  return function (
    _target: undefined,
    context: ClassFieldDecoratorContext,
  ): void {
    context.addInitializer(function () {
      const ctor = this as unknown as Function;
      const existingMeta = getPropertyMetadata(ctor, String(context.name));
      
      if (existingMeta) {
        existingMeta.readOnly = true;
        defineProperty(ctor, context.name, existingMeta);
      }
    });
  };
}

// ── @Expose Decorator ───────────────────────────────────────────────────────

/**
 * Options for the @Expose decorator.
 */
export interface ExposeOptions {
  /** Method description for documentation. */
  description?: string;
  
  /** Return type override (auto-detected if not specified). */
  returnType?: string;
  
  /** True if method returns a Promise. */
  isAsync?: boolean;
  
  /** True to hide from public API (internal use). */
  internal?: boolean;
}

/**
 * Method decorator — exposes a method to the scripting runtime.
 * The method can be called from scripts and will appear in generated APIs.
 * 
 * @param options - Method metadata options
 * @returns Method decorator function
 */
export function Expose(options: ExposeOptions = {}) {
  return function (
    target: Function,
    context: ClassMethodDecoratorContext,
  ): Function {
    const methodKey = String(context.name);
    
    // Extract parameter info if available
    const parameters: ParameterMetadata[] = [];
    
    // Try to get design:paramtypes from TypeScript emitDecoratorMetadata
    // This requires "emitDecoratorMetadata": true in tsconfig.json
    const designTypes = (target as any).__designParamtypes;
    if (Array.isArray(designTypes)) {
      for (let i = 0; i < designTypes.length; i++) {
        const type = designTypes[i];
        parameters.push({
          name: `arg${i}`,
          type: type?.name ?? 'unknown',
          optional: false,
        });
      }
    }
    
    // Determine if method is async
    const isAsync = options.isAsync ?? 
      target.constructor.name === 'AsyncFunction';
    
    const metadata: MethodMetadata = {
      key: methodKey,
      description: options.description,
      returnType: options.returnType,
      parameters,
      isAsync,
      internal: options.internal ?? false,
    };
    
    // Register metadata using addInitializer
    context.addInitializer(function () {
      const ctor = this as unknown as Function;
      defineMethod(ctor, context.name, metadata);
    });
    
    return target;
  };
}

// ── Helper Functions ─────────────────────────────────────────────────────────

import { getProperty } from './MetadataStorage';

/**
 * Helper to get existing property metadata for decorator composition.
 * This is an internal function used by stacked decorators.
 */
function getPropertyMetadata(
  ctor: Function,
  key: string,
): PropertyMetadata | undefined {
  return getProperty(ctor, key);
}

// ── Validation Decorators (Future) ───────────────────────────────────────────

/**
 * Placeholder for future @Validate decorator.
 * Will attach a validation function to a property.
 */
export function Validate(
  validator: (value: unknown, instance: object) => boolean | string,
) {
  return function (
    _target: undefined,
    context: ClassFieldDecoratorContext,
  ): void {
    context.addInitializer(function () {
      const ctor = this as unknown as Function;
      const existingMeta = getPropertyMetadata(ctor, String(context.name));
      
      if (existingMeta) {
        existingMeta.validate = validator;
        defineProperty(ctor, context.name, existingMeta);
      }
    });
  };
}
