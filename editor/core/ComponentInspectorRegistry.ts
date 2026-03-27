// ============================================================
// FluxionJS V3 — Component Inspector Registry (editor-side)
// Maps component types to their custom React inspector components.
// Mirrors the pattern used by AssetInspectorRegistry.
//
// Custom inspector files self-register at module load time:
//   ComponentInspectorRegistry.register('Light', LightInspector);
//
// InspectorPanel uses this instead of a hard-coded map.
// ============================================================

import React from 'react';
import { EntityId } from '../../src/core/ECS';

export interface ComponentInspectorProps {
  entity: EntityId;
  onRemoved: () => void;
}

class ComponentInspectorRegistryImpl {
  private map = new Map<string, React.FC<ComponentInspectorProps>>();

  register(type: string, component: React.FC<ComponentInspectorProps>): void {
    this.map.set(type, component);
  }

  get(type: string): React.FC<ComponentInspectorProps> | undefined {
    return this.map.get(type);
  }

  has(type: string): boolean {
    return this.map.has(type);
  }
}

export const ComponentInspectorRegistry = new ComponentInspectorRegistryImpl();
