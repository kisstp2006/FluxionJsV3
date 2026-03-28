// ============================================================
// FluxionJS V3 — EntityRef
// A typed entity reference that can be exposed in the Inspector.
//
// Usage in scripts:
//   target     = new EntityRef();              // any entity
//   cameraSlot = new EntityRef('Camera');      // only entities with Camera
//   physicsSlot = new EntityRef('Rigidbody');
//
//   update() {
//     const tf = this.getComponentOf(this.target.entity, 'Transform');
//   }
// ============================================================

import type { EntityId } from '../core/ECS';

export class EntityRef {
  /**
   * @internal — sentinel used by the Inspector and ScriptSystem to
   * distinguish this from a plain object without needing `instanceof`
   * across module boundaries.
   */
  readonly __type = 'EntityRef' as const;

  /** The currently assigned entity, or null if unassigned. */
  entity: EntityId | null = null;

  /**
   * If set, the Inspector only allows assigning entities that have
   * this component type attached.
   * @example new EntityRef('Camera')   // only Camera entities
   * @example new EntityRef('Rigidbody')
   */
  readonly requireComponent: string | undefined;

  constructor(requireComponent?: string) {
    this.requireComponent = requireComponent;
  }

  /** Returns true when an entity is assigned. */
  get isValid(): boolean {
    return this.entity !== null;
  }

  /** @internal — restore from a serialized plain object. */
  static _restore(plain: { entity: EntityId | null }, proto: EntityRef): EntityRef {
    const ref = new EntityRef(proto.requireComponent);
    ref.entity = typeof plain?.entity === 'number' ? plain.entity : null;
    return ref;
  }
}
