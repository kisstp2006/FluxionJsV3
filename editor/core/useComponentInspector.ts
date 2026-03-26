// ============================================================
// FluxionJS V3 — useComponentInspector
// Shared hook that eliminates the boilerplate every entity
// component inspector repeats: engine guard, forceUpdate,
// component lookup, and update callback.
// ============================================================

import { useState } from 'react';
import { useEngine } from './EditorContext';
import { EntityId, Component } from '../../src/core/ECS';

/**
 * Returns [component, update] for an entity component inspector.
 * `component` is null when the engine isn't ready or the component
 * doesn't exist — callers should early-return in that case.
 * `update()` forces a re-render so the inspector stays in sync.
 */
export function useComponentInspector<T extends Component>(
  entity: EntityId,
  componentType: string,
): [T | null, () => void] {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  const update = () => forceUpdate(n => n + 1);
  if (!engine) return [null, update];
  return [engine.engine.ecs.getComponent<T>(entity, componentType) ?? null, update];
}
