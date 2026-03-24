// ============================================================
// FluxionJS V2 — Inspector Panel (Thin Shell)
// Composes per-component inspectors
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  PanelHeader, Section, PropertyRow,
  TextInput, Button, Icons, ContextMenu,
} from '../../ui';
import { useEditor, useEngine } from '../../core/EditorContext';
import { EntityId } from '../../../src/core/ECS';
import {
  CameraComponent,
  LightComponent,
  RigidbodyComponent,
  ColliderComponent,
  ParticleEmitterComponent,
} from '../../../src/core/Components';
import { TransformInspector } from './inspector/TransformInspector';
import { MeshRendererInspector } from './inspector/MeshRendererInspector';
import { CameraInspector } from './inspector/CameraInspector';
import { LightInspector } from './inspector/LightInspector';
import { RigidbodyInspector, ColliderInspector } from './inspector/PhysicsInspector';
import { ParticleInspector } from './inspector/ParticleInspector';

// ── Add Component Menu ──
const AddComponentMenu: React.FC<{ entity: EntityId }> = ({ entity }) => {
  const engine = useEngine();
  const { log, dispatch } = useEditor();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  if (!engine) return null;

  const existing = engine.engine.ecs.getAllComponents(entity).map((c) => c.type);
  const components = [
    { type: 'Camera', create: () => new CameraComponent() },
    { type: 'Light', create: () => new LightComponent() },
    { type: 'Rigidbody', create: () => new RigidbodyComponent() },
    { type: 'Collider', create: () => new ColliderComponent() },
    { type: 'ParticleEmitter', create: () => new ParticleEmitterComponent() },
  ].filter((c) => !existing.includes(c.type));

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
          items={components.map((comp) => ({
            label: comp.type,
            onClick: () => {
              engine.engine.ecs.addComponent(entity, comp.create());
              log(`Added ${comp.type} component`, 'info');
              dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
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

        {/* Component inspectors — auto-render based on entity components */}
        <TransformInspector entity={entity} />
        <MeshRendererInspector entity={entity} onRemoved={refreshInspector} />
        <CameraInspector entity={entity} onRemoved={refreshInspector} />
        <LightInspector entity={entity} onRemoved={refreshInspector} />
        <RigidbodyInspector entity={entity} onRemoved={refreshInspector} />
        <ColliderInspector entity={entity} onRemoved={refreshInspector} />
        <ParticleInspector entity={entity} onRemoved={refreshInspector} />

        {/* Add Component */}
        <div style={{ padding: '4px 12px' }}>
          <AddComponentMenu entity={entity} />
        </div>
      </div>
    </div>
  );
};
