// ============================================================
// FluxionJS V3 — Entity Component System
// Inspired by Nuake ECS + s&box component model
// ============================================================

import * as THREE from 'three';

export type EntityId = number;

export interface Component {
  readonly type: string;
  entityId: EntityId;
  enabled: boolean;
  /** Set by ComponentService when a property changes; cleared by systems after handling. */
  __dirty?: boolean;
  /** Tracks which property triggered the dirty flag (for systems that need to know). */
  __dirtyProps?: Set<string>;
}

/** Mark a component as dirty, optionally tracking which property changed. */
export function markDirty(component: Component, property?: string): void {
  component.__dirty = true;
  if (property) {
    if (!component.__dirtyProps) component.__dirtyProps = new Set();
    component.__dirtyProps.add(property);
  }
}

/** Clear dirty state after a system has processed changes. */
export function clearDirty(component: Component): void {
  component.__dirty = false;
  if (component.__dirtyProps) component.__dirtyProps.clear();
}

/** Check if a component has pending changes. */
export function isDirty(component: Component): boolean {
  return component.__dirty === true;
}

export interface System {
  readonly name: string;
  readonly requiredComponents: string[];
  priority: number;
  enabled: boolean;
  init?(ecs: ECSManager): void;
  update(entities: Set<EntityId>, ecs: ECSManager, dt: number): void;
  fixedUpdate?(entities: Set<EntityId>, ecs: ECSManager, dt: number): void;
  destroy?(): void;
  /** Called when the scene is cleared, before entities are destroyed. Systems should reset tracked state. */
  onSceneClear?(): void;
}

// Module-level scratch for query() — avoids spread+filter array allocation per call
const _queryScratch: EntityId[] = [];

// Module-level scratch matrices for setParent(keepWorldTransform) — zero heap alloc in hot path
const _invParent   = new THREE.Matrix4();
const _localResult = new THREE.Matrix4();

export class ECSManager {
  private nextEntityId: EntityId = 1;
  private entities: Set<EntityId> = new Set();
  private components: Map<string, Map<EntityId, Component>> = new Map();
  private systems: System[] = [];
  private systemEntityCache: Map<string, Set<EntityId>> = new Map();
  private entityTags: Map<EntityId, Set<string>> = new Map();
  private entityNames: Map<EntityId, string> = new Map();
  private parentMap: Map<EntityId, EntityId> = new Map();
  private childrenMap: Map<EntityId, Set<EntityId>> = new Map();
  private dirty = true;
  // O(1) indexes maintained incrementally — no full-scan on every query
  private rootEntities: Set<EntityId> = new Set();
  private tagIndex: Map<string, Set<EntityId>> = new Map();

  // ── Entity management ──

  createEntity(name?: string): EntityId {
    const id = this.nextEntityId++;
    this.entities.add(id);
    this.entityTags.set(id, new Set());
    this.childrenMap.set(id, new Set());
    if (name) this.entityNames.set(id, name);
    this.rootEntities.add(id);
    this.dirty = true;
    return id;
  }

  destroyEntity(entity: EntityId): void {
    // Destroy children first (iterative to avoid stack overflow on deep hierarchies)
    const childrenToDestroy: EntityId[] = [];
    const childSet = this.childrenMap.get(entity);
    if (childSet) {
      for (const child of childSet) childrenToDestroy.push(child);
    }
    for (const child of childrenToDestroy) {
      this.destroyEntity(child);
    }

    // Remove from parent — also remove from parent's TransformComponent.children
    const parent = this.parentMap.get(entity);
    if (parent !== undefined) {
      this.childrenMap.get(parent)?.delete(entity);
      this.parentMap.delete(entity);
      type TC = import('./Components').TransformComponent;
      const parentT = this.getComponent<TC>(parent, 'Transform');
      if (parentT) {
        const idx = parentT.children.indexOf(entity);
        if (idx !== -1) parentT.children.splice(idx, 1);
      }
    }

    // Remove all components
    for (const [, store] of this.components) {
      store.delete(entity);
    }

    // Remove from O(1) indexes
    this.rootEntities.delete(entity);
    const tags = this.entityTags.get(entity);
    if (tags) {
      for (const tag of tags) {
        this.tagIndex.get(tag)?.delete(entity);
      }
    }

    this.entities.delete(entity);
    this.entityTags.delete(entity);
    this.entityNames.delete(entity);
    this.childrenMap.delete(entity);
    this.dirty = true;
  }

  entityExists(entity: EntityId): boolean {
    return this.entities.has(entity);
  }

  getEntityName(entity: EntityId): string {
    return this.entityNames.get(entity) ?? `Entity_${entity}`;
  }

  setEntityName(entity: EntityId, name: string): void {
    this.entityNames.set(entity, name);
  }

  getAllEntities(): ReadonlySet<EntityId> {
    return this.entities;
  }

  // ── Hierarchy (like LumixEngine scene tree) ──

  /**
   * Set the parent of `child` to `newParent`, or remove the parent entirely
   * when `newParent` is undefined / null (makes the child a root entity).
   *
   * @param keepWorldTransform
   *   When true, the child's WORLD position/rotation/scale is preserved by
   *   recalculating its local transform relative to the new parent.
   *   When false (default), the local transform stays the same and world
   *   position changes to reflect the new parent's world transform.
   *
   * Cycle detection: if `newParent` is a descendant of `child`, the call is
   * silently rejected and a warning is logged.
   */
  setParent(child: EntityId, newParent: EntityId | undefined | null, keepWorldTransform = false): void {
    const resolvedParent = newParent == null ? undefined : newParent as EntityId;

    // Prevent self-parenting
    if (resolvedParent === child) {
      console.warn(`[ECS] setParent: cannot parent entity ${child} to itself.`);
      return;
    }

    // Cycle detection — walk up from resolvedParent; reject if we reach child
    if (resolvedParent !== undefined && this._isCyclicParent(child, resolvedParent)) {
      console.warn(`[ECS] setParent: rejected — would create a hierarchy cycle (entity ${child} is an ancestor of ${resolvedParent}).`);
      return;
    }

    // Lazily import TransformComponent to avoid a circular module dependency.
    // We use a runtime check rather than a static import.
    type TC = import('./Components').TransformComponent;
    const childT  = this.getComponent<TC>(child, 'Transform');

    // Save world matrix if keepWorldTransform is requested
    const savedWorld = (keepWorldTransform && childT)
      ? childT._worldMatrix.clone()
      : null;

    // ── Remove from old parent ──────────────────────────────────────────────
    const oldParent = this.parentMap.get(child);
    if (oldParent !== undefined) {
      this.childrenMap.get(oldParent)?.delete(child);
      // Remove from old parent's TransformComponent.children
      const oldParentT = this.getComponent<TC>(oldParent, 'Transform');
      if (oldParentT && childT) {
        const idx = oldParentT.children.indexOf(child);
        if (idx !== -1) oldParentT.children.splice(idx, 1);
      }
      this.parentMap.delete(child);
    }

    // ── Set new parent ──────────────────────────────────────────────────────
    if (resolvedParent !== undefined) {
      this.parentMap.set(child, resolvedParent);
      if (!this.childrenMap.has(resolvedParent)) this.childrenMap.set(resolvedParent, new Set());
      this.childrenMap.get(resolvedParent)!.add(child);
      this.rootEntities.delete(child);

      // Mirror in TransformComponent
      if (childT) childT.parent = resolvedParent;
      const newParentT = this.getComponent<TC>(resolvedParent, 'Transform');
      if (newParentT && childT && !newParentT.children.includes(child)) {
        newParentT.children.push(child);
      }
    } else {
      // Unparented — becomes a root entity
      this.rootEntities.add(child);
      if (childT) childT.parent = null;
    }

    // ── Apply keepWorldTransform ────────────────────────────────────────────
    if (savedWorld && childT) {
      if (resolvedParent !== undefined) {
        const newParentT = this.getComponent<TC>(resolvedParent, 'Transform');
        if (newParentT) {
          // newLocal = inverse(parent.worldMatrix) * savedWorld
          _invParent.copy(newParentT._worldMatrix).invert();
          _localResult.multiplyMatrices(_invParent, savedWorld);
          _localResult.decompose(childT.position, childT.quaternion, childT.scale);
          childT.rotation.setFromQuaternion(childT.quaternion, undefined, false);
        }
      } else {
        // Becoming root: world IS the local transform
        savedWorld.decompose(childT.position, childT.quaternion, childT.scale);
        childT.rotation.setFromQuaternion(childT.quaternion, undefined, false);
      }
      childT.dirty = true;
    }

    // Mark world dirty since parent relationship changed
    if (childT) childT.worldDirty = true;

    this.dirty = true;
  }

  getParent(entity: EntityId): EntityId | undefined {
    return this.parentMap.get(entity);
  }

  getChildren(entity: EntityId): ReadonlySet<EntityId> {
    return this.childrenMap.get(entity) ?? new Set();
  }

  getRootEntities(): EntityId[] {
    return [...this.rootEntities];
  }

  /** Returns true if `child` is an ancestor of `potentialDescendant` (cycle check). */
  private _isCyclicParent(child: EntityId, potentialDescendant: EntityId): boolean {
    let current: EntityId | undefined = potentialDescendant;
    while (current !== undefined) {
      if (current === child) return true;
      current = this.parentMap.get(current);
    }
    return false;
  }

  // ── Tags ──

  addTag(entity: EntityId, tag: string): void {
    this.entityTags.get(entity)?.add(tag);
    let set = this.tagIndex.get(tag);
    if (!set) { set = new Set(); this.tagIndex.set(tag, set); }
    set.add(entity);
  }

  hasTag(entity: EntityId, tag: string): boolean {
    return this.entityTags.get(entity)?.has(tag) ?? false;
  }

  getEntitiesWithTag(tag: string): EntityId[] {
    return [...(this.tagIndex.get(tag) ?? [])];
  }

  // ── Component management ──

  addComponent<T extends Component>(entity: EntityId, component: T): T {
    if (!this.entities.has(entity)) {
      throw new Error(`Entity ${entity} does not exist`);
    }

    let store = this.components.get(component.type);
    if (!store) {
      store = new Map();
      this.components.set(component.type, store);
    }

    component.entityId = entity;
    store.set(entity, component);
    this.dirty = true;

    // Lifecycle hooks
    const bc = component as any;
    bc.onCreate?.();
    if (component.enabled) bc.onEnable?.();

    return component;
  }

  getComponent<T extends Component>(entity: EntityId, type: string): T | undefined {
    return this.components.get(type)?.get(entity) as T | undefined;
  }

  hasComponent(entity: EntityId, type: string): boolean {
    return this.components.get(type)?.has(entity) ?? false;
  }

  removeComponent(entity: EntityId, type: string): void {
    const comp = this.components.get(type)?.get(entity);
    if (comp) {
      // Lifecycle hooks
      const bc = comp as any;
      if (comp.enabled) bc.onDisable?.();
      bc.onDestroy?.();
      comp.entityId = 0 as EntityId;
    }
    this.components.get(type)?.delete(entity);
    this.dirty = true;
  }

  getComponentsOfType<T extends Component>(type: string): Map<EntityId, T> {
    return (this.components.get(type) as Map<EntityId, T>) ?? new Map();
  }

  getAllComponents(entity: EntityId): Component[] {
    const result: Component[] = [];
    for (const [, store] of this.components) {
      const comp = store.get(entity);
      if (comp) result.push(comp);
    }
    return result;
  }

  // ── System management ──

  addSystem(system: System): void {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
    system.init?.(this);
    this.dirty = true;
  }

  removeSystem(name: string): void {
    const idx = this.systems.findIndex(s => s.name === name);
    if (idx >= 0) {
      this.systems[idx].destroy?.();
      this.systems.splice(idx, 1);
    }
  }

  getSystem<T extends System>(name: string): T | undefined {
    return this.systems.find(s => s.name === name) as T | undefined;
  }

  // ── Queries ──

  query(...componentTypes: string[]): EntityId[] {
    _queryScratch.length = 0;
    for (const entity of this.entities) {
      if (componentTypes.every(type => this.hasComponent(entity, type))) {
        _queryScratch.push(entity);
      }
    }
    return _queryScratch.slice();
  }

  // ── Update ──

  private rebuildCaches(): void {
    if (!this.dirty) return;

    for (const system of this.systems) {
      let matching = this.systemEntityCache.get(system.name);
      if (!matching) {
        matching = new Set<EntityId>();
        this.systemEntityCache.set(system.name, matching);
      } else {
        matching.clear();
      }
      for (const entity of this.entities) {
        if (system.requiredComponents.every(type => this.hasComponent(entity, type))) {
          matching!.add(entity);
        }
      }
    }

    this.dirty = false;
  }

  update(dt: number): void {
    this.rebuildCaches();

    for (const system of this.systems) {
      if (!system.enabled) continue;
      const entities = this.systemEntityCache.get(system.name) ?? new Set();
      system.update(entities, this, dt);
    }
  }

  fixedUpdate(dt: number): void {
    this.rebuildCaches();

    for (const system of this.systems) {
      if (!system.enabled || !system.fixedUpdate) continue;
      const entities = this.systemEntityCache.get(system.name) ?? new Set();
      system.fixedUpdate(entities, this, dt);
    }
  }

  // ── Serialization (for scene save/load, like s&box) ──

  serialize(): object {
    const data: any = { entities: [] };

    for (const entity of this.entities) {
      const entityData: any = {
        id: entity,
        name: this.getEntityName(entity),
        parent: this.parentMap.get(entity) ?? null,
        tags: [...(this.entityTags.get(entity) ?? [])],
        components: [],
      };

      for (const [_type, store] of this.components) {
        const comp = store.get(entity);
        if (comp) {
          const { entityId, ...rest } = comp as any;
          entityData.components.push(rest);
        }
      }

      data.entities.push(entityData);
    }

    return data;
  }

  clear(): void {
    // Notify systems before destroying entities so they can reset tracked state
    for (const system of this.systems) {
      system.onSceneClear?.();
    }
    for (const entity of [...this.entities]) {
      this.destroyEntity(entity);
    }
    this.nextEntityId = 1;
    this.rootEntities.clear();
    this.tagIndex.clear();
  }
}
