// ============================================================
// FluxionJS V3 — Inspector Panel (Registry-Driven)
// Uses ComponentRegistry for auto-inspection. Custom inspectors
// override only for complex cases (Transform, MeshRenderer).
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  PanelHeader, Section, PropertyRow,
  TextInput, ContextMenu,
} from '../../ui';
import { useEditor, useEngine } from '../../core/EditorContext';
import { EntityId } from '../../../src/core/ECS';
import { ComponentRegistry } from '../../../src/core/ComponentRegistry';
import { TransformInspector } from './inspector/TransformInspector';
import { MeshRendererInspector } from './inspector/MeshRendererInspector';
import { AutoInspector } from './inspector/AutoInspector';
import { AssetInspectorRegistry } from '../../core/AssetInspectorRegistry';
import { GenericAssetInspector } from './inspector/GenericAssetInspector';
import { TextureInspector } from './inspector/TextureInspector';
import { AudioInspector } from './inspector/AudioInspector';
import { MaterialInspector } from './inspector/MaterialInspector';
import { ModelInspector } from './inspector/ModelInspector';
import { VisualMaterialInspector } from './inspector/VisualMaterialInspector';
import { EnvironmentInspector } from './inspector/EnvironmentInspector';
import { TextRendererInspector } from './inspector/TextRendererInspector';
import { SpriteRendererInspector } from './inspector/SpriteRendererInspector';
import { LightInspector } from './inspector/LightInspector';

// Register built-in asset inspectors
AssetInspectorRegistry.register('texture', TextureInspector);
AssetInspectorRegistry.register('audio', AudioInspector);
AssetInspectorRegistry.register('material', MaterialInspector);
AssetInspectorRegistry.register('model', ModelInspector);
AssetInspectorRegistry.register('visual_material', VisualMaterialInspector);

// Component types that have hand-written inspectors (complex UI needs).
// Everything else is auto-generated from ComponentRegistry metadata.
const customInspectors: Record<string, React.FC<{ entity: EntityId; onRemoved: () => void }>> = {
  Transform: ({ entity }) => <TransformInspector entity={entity} />,
  MeshRenderer: MeshRendererInspector,
  Light: LightInspector,
  Environment: EnvironmentInspector,
  TextRenderer: TextRendererInspector,
  Sprite: SpriteRendererInspector,
};

// ── Add Component Menu ──
const AddComponentMenu: React.FC<{ entity: EntityId }> = ({ entity }) => {
  const engine = useEngine();
  const { log, dispatch } = useEditor();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  if (!engine) return null;

  const existing = engine.engine.ecs.getAllComponents(entity).map((c) => c.type);
  const components = ComponentRegistry.getAddable()
    .filter((def) => !existing.includes(def.type));

  return (
    <>
      <button
        onClick={(e) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          setMenuPos({ x: rect.left, y: rect.bottom });
          setShowMenu(true);
        }}
        style={{
          width: '100%',
          padding: '8px',
          margin: '8px 0',
          background: 'var(--bg-hover)',
          border: '1px dashed var(--border)',
          borderRadius: '4px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: '12px',
          transition: 'all 150ms ease',
        }}
      >
        + Add Component
      </button>

      {showMenu && components.length > 0 && (
        <ContextMenu
          position={menuPos}
          onClose={() => setShowMenu(false)}
          items={components.map((def) => ({
            label: def.displayName || def.type,
            onClick: () => {
              const comp = ComponentRegistry.create(def.type);
              if (comp) {
                engine.engine.ecs.addComponent(entity, comp);
                log(`Added ${def.displayName || def.type} component`, 'info');
                dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
              }
            },
          }))}
        />
      )}
    </>
  );
};

// ── Main Inspector Panel ──
export const InspectorPanel: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();
  const [revision, setRevision] = useState(0);

  const refreshInspector = useCallback(() => setRevision((n) => n + 1), []);

  // ── Asset Inspector Mode ──
  if (state.selectedAsset) {
    const { path, type } = state.selectedAsset;
    const CustomInspector = AssetInspectorRegistry.get(type);
    const Inspector = CustomInspector || GenericAssetInspector;

    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
      }}>
        <PanelHeader title="Inspector" />
        <div key={path} style={{ flex: 1, overflowY: 'auto' }}>
          <Inspector assetPath={path} assetType={type} />
        </div>
      </div>
    );
  }

  // ── Entity Inspector Mode ──
  if (state.selectedEntity === null || !engine) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
      }}>
        <PanelHeader title="Inspector" />
        <div style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
        }}>
          Select an entity to inspect
        </div>
      </div>
    );
  }

  const entity = state.selectedEntity;
  const name = engine.engine.ecs.getEntityName(entity);
  // Use component count as part of key to force re-render when components are added/removed
  const componentCount = engine.engine.ecs.getAllComponents(entity).length;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-panel)',
    }}>
      <PanelHeader title="Inspector" />
      <div key={`${entity}-${componentCount}-${revision}`} style={{ flex: 1, overflowY: 'auto' }}>
        {/* Entity identity */}
        <Section title="Entity" defaultOpen>
          <PropertyRow label="Name">
            <TextInput
              value={name}
              onChange={(v) => engine.engine.ecs.setEntityName(entity, v)}
            />
          </PropertyRow>
          <PropertyRow label="ID">
            <span style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              fontSize: '11px',
            }}>
              {entity}
            </span>
          </PropertyRow>
        </Section>

        {/* Component inspectors — registry-driven with custom overrides */}
        {engine.engine.ecs.getAllComponents(entity).map((comp) => {
          const Custom = customInspectors[comp.type];
          if (Custom) {
            return <Custom key={comp.type} entity={entity} onRemoved={refreshInspector} />;
          }
          if (ComponentRegistry.has(comp.type)) {
            return <AutoInspector key={comp.type} entity={entity} componentType={comp.type} onRemoved={refreshInspector} />;
          }
          return null;
        })}

        {/* Add Component */}
        <div style={{ padding: '4px 12px' }}>
          <AddComponentMenu entity={entity} />
        </div>
      </div>
    </div>
  );
};
