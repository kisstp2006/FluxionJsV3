// ============================================================
// FluxionJS V3 — Serialization Context Types
// Passed to component deserialize() methods so they can resolve
// async assets and cross-entity references during scene load.
// ============================================================

import type { Engine } from './Engine';
import type { EntityId } from './ECS';
import type { MeshRendererComponent } from './Components';

/**
 * Context object passed to every component's deserialize() method.
 * Provides engine-level access (subsystems, asset loading) needed by
 * complex components (MeshRenderer, AudioSource, etc.).
 */
export interface DeserializationContext {
  /** The running engine instance — use engine.getSubsystem<T>(name) for subsystems. */
  engine: Engine;
  /** Maps original (serialized) entity IDs to the newly created entity IDs in this session. */
  entityIdMap: Map<number, EntityId>;
  /**
   * Deferred model loads — populated by MeshRendererComponent.deserialize()
   * when a modelPath is present. Processed by SceneSerializer after all
   * entities have been created.
   */
  deferredModelLoads: Array<{ meshComp: MeshRendererComponent; modelPath: string }>;
  /**
   * Deferred material loads — populated by MeshRendererComponent.deserialize()
   * when a materialPath or materialSlots are present.
   */
  deferredMaterialLoads: Array<{ meshComp: MeshRendererComponent; materialPath: string }>;
}
