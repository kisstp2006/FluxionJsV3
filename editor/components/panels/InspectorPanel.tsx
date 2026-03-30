// ============================================================
// FluxionJS V3 — Inspector Panel (Registry-Driven)
// Uses ComponentRegistry for auto-inspection. Custom inspectors
// override only for complex cases (Transform, MeshRenderer).
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  PanelHeader, Section, PropertyRow,
  TextInput,
} from '../../ui';
import { AddComponentPopup } from './inspector/AddComponentPopup';
import { useEditor, useEngine } from '../../core/EditorContext';
import { EntityId } from '../../../src/core/ECS';
import { ComponentRegistry } from '../../../src/core/ComponentRegistry';
import { AutoInspector } from './inspector/AutoInspector';
import { AssetInspectorRegistry } from '../../core/AssetInspectorRegistry';
import { ComponentInspectorRegistry } from '../../core/ComponentInspectorRegistry';
import { GenericAssetInspector } from './inspector/GenericAssetInspector';
import { TextureInspector } from './inspector/TextureInspector';
import { AudioInspector } from './inspector/AudioInspector';
import { MaterialInspector } from './inspector/MaterialInspector';
import { ModelInspector } from './inspector/ModelInspector';
import { VisualMaterialInspector } from './inspector/VisualMaterialInspector';
import { FuiInspector } from './inspector/FuiInspector';
// Import custom component inspectors to trigger self-registration
import './inspector/TransformInspector';
import './inspector/MeshRendererInspector';
import './inspector/ScriptInspector';
import './inspector/SpriteReactiveInspector';
import './inspector/AnimatorInspector';

// Register built-in asset inspectors
AssetInspectorRegistry.register('texture', TextureInspector);
AssetInspectorRegistry.register('audio', AudioInspector);
AssetInspectorRegistry.register('material', MaterialInspector);
AssetInspectorRegistry.register('model', ModelInspector);
AssetInspectorRegistry.register('visual_material', VisualMaterialInspector);
AssetInspectorRegistry.register('fui', FuiInspector);


// ── Tag Editor ──
const TagEditor: React.FC<{ entity: EntityId }> = ({ entity }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!engine) return null;
  const ecs = engine.engine.ecs;

  const tagSet: Set<string> | undefined = (ecs as any).entityTags?.get(entity);
  const tags: string[] = tagSet ? [...tagSet] : [];

  const addTag = () => {
    const t = inputVal.trim();
    if (!t || ecs.hasTag(entity, t)) return;
    ecs.addTag(entity, t);
    setInputVal('');
    forceUpdate(v => v + 1);
  };

  const removeTag = (t: string) => {
    (ecs as any).entityTags?.get(entity)?.delete(t);
    (ecs as any).tagIndex?.get(t)?.delete(entity);
    forceUpdate(v => v + 1);
  };

  return (
    <div style={{ padding: '2px 0 4px 0' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 0 3px 0' }}>Tags</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: tags.length ? '4px' : 0 }}>
        {tags.map(t => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            borderRadius: '3px', padding: '0 5px', fontSize: '10px',
            color: 'var(--accent)', fontFamily: 'var(--font-mono)',
          }}>
            {t}
            <button
              onClick={() => removeTag(t)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0', fontSize: '10px', lineHeight: 1 }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="Add tag..."
          style={{
            flex: 1, background: 'var(--bg-input, #1c2128)', border: '1px solid var(--border)',
            borderRadius: '3px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
            fontSize: '11px', padding: '2px 6px', outline: 'none',
          }}
        />
        <button
          onClick={addTag}
          style={{
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            borderRadius: '3px', color: 'var(--text-secondary)', fontSize: '11px',
            padding: '2px 8px', cursor: 'pointer',
          }}
        >+</button>
      </div>
    </div>
  );
};

// ── Add Component Button ──
const AddComponentButton: React.FC<{ entity: EntityId; onAdded: () => void }> = ({ entity, onAdded }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  return (
    <>
      <button
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPopupPos({ x: rect.left, y: rect.bottom + 4 });
          setShowPopup(true);
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

      {showPopup && (
        <AddComponentPopup
          entity={entity}
          onClose={() => setShowPopup(false)}
          onAdded={onAdded}
          position={popupPos}
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

  const isEntityActive = engine.engine.ecs.isEntityEnabled(entity);

  const handleToggleActive = () => {
    engine.engine.ecs.setEntityEnabled(entity, !isEntityActive);
    refreshInspector();
  };

  const entityActions = (
    <button
      onClick={(e) => { e.stopPropagation(); handleToggleActive(); }}
      title={isEntityActive ? 'Deactivate entity (disable all components)' : 'Activate entity'}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '0 2px', fontSize: '13px', lineHeight: 1,
        color: isEntityActive ? 'var(--accent-green)' : 'var(--text-muted)',
        opacity: isEntityActive ? 1 : 0.5,
      }}
    >
      {isEntityActive ? '●' : '○'}
    </button>
  );

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
        <Section title="Entity" defaultOpen actions={entityActions}>
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
          <TagEditor entity={entity} key={`tags-${entity}-${revision}`} />
        </Section>

        {/* Component inspectors — custom inspectors self-register; rest auto-generated */}
        {engine.engine.ecs.getAllComponents(entity).map((comp) => {
          const Custom = ComponentInspectorRegistry.get(comp.type);
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
          <AddComponentButton entity={entity} onAdded={refreshInspector} />
        </div>
      </div>
    </div>
  );
};
