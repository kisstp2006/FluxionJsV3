// ============================================================
// FluxionJS V2 — Entity Component System
// Inspired by Nuake ECS + s&box component model
// ============================================================

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
}

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

  // ── Entity management ──

  createEntity(name?: string): EntityId {
    const id = this.nextEntityId++;
    this.entities.add(id);
    this.entityTags.set(id, new Set());
    this.childrenMap.set(id, new Set());
    if (name) this.entityNames.set(id, name);
    this.dirty = true;
    return id;
  }

  destroyEntity(entity: EntityId): void {
    // Destroy children first (recursive, like LumixEngine)
    const children = this.childrenMap.get(entity);
    if (children) {
      for (const child of [...children]) {
        this.destroyEntity(child);
      }
    }

    // Remove from parent
    const parent = this.parentMap.get(entity);
    if (parent !== undefined) {
      this.childrenMap.get(parent)?.delete(entity);
      this.parentMap.delete(entity);
    }

    // Remove all components
    for (const [, store] of this.components) {
      store.delete(entity);
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

  setParent(child: EntityId, parent: EntityId): void {
    const oldParent = this.parentMap.get(child);
    if (oldParent !== undefined) {
      this.childrenMap.get(oldParent)?.delete(child);
    }
    this.parentMap.set(child, parent);
    this.childrenMap.get(parent)?.add(child);
  }

  getParent(entity: EntityId): EntityId | undefined {
    return this.parentMap.get(entity);
  }

  getChildren(entity: EntityId): ReadonlySet<EntityId> {
    return this.childrenMap.get(entity) ?? new Set();
  }

  getRootEntities(): EntityId[] {
    return [...this.entities].filter(e => !this.parentMap.has(e));
  }

  // ── Tags ──

  addTag(entity: EntityId, tag: string): void {
    this.entityTags.get(entity)?.add(tag);
  }

  hasTag(entity: EntityId, tag: string): boolean {
    return this.entityTags.get(entity)?.has(tag) ?? false;
  }

  getEntitiesWithTag(tag: string): EntityId[] {
    return [...this.entities].filter(e => this.entityTags.get(e)?.has(tag));
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
    return component;
  }

  getComponent<T extends Component>(entity: EntityId, type: string): T | undefined {
    return this.components.get(type)?.get(entity) as T | undefined;
  }

  hasComponent(entity: EntityId, type: string): boolean {
    return this.components.get(type)?.has(entity) ?? false;
  }

  removeComponent(entity: EntityId, type: string): void {
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
    return [...this.entities].filter(entity =>
      componentTypes.every(type => this.hasComponent(entity, type))
    );
  }

  // ── Update ──

  private rebuildCaches(): void {
    if (!this.dirty) return;

    for (const system of this.systems) {
      const matching = new Set<EntityId>();
      for (const entity of this.entities) {
        if (system.requiredComponents.every(type => this.hasComponent(entity, type))) {
          matching.add(entity);
        }
      }
      this.systemEntityCache.set(system.name, matching);
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

      for (const [type, store] of this.components) {
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
    for (const entity of [...this.entities]) {
      this.destroyEntity(entity);
    }
    this.nextEntityId = 1;
  }
}
