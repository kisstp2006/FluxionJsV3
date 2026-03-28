// ============================================================
// FluxionJS V3 — ComponentSection
// Unified wrapper for every component inspector panel.
// Provides a consistent header with:
//   · collapsible Section (from the existing UI library)
//   · enabled/disabled toggle (checkbox)
//   · remove button  (only when removable !== false)
// ============================================================

import React from 'react';
import { Section } from '../../../ui';
import { useEditor, useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { ComponentRegistry } from '../../../../src/core/ComponentRegistry';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';
import { Icons } from '../../../ui/Icons';

interface ComponentSectionProps {
  entity: EntityId;
  componentType: string;
  /** Force-rerender the parent inspector (called after remove). */
  onRemoved: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const ComponentSection: React.FC<ComponentSectionProps> = ({
  entity,
  componentType,
  onRemoved,
  children,
  defaultOpen = true,
}) => {
  const engine = useEngine();
  const { log, dispatch } = useEditor();
  const [, forceUpdate] = React.useState(0);

  if (!engine) return null;

  const reg   = ComponentRegistry.get(componentType);
  const comp  = engine.engine.ecs.getComponent(entity, componentType);
  if (!comp) return null;

  const displayName = reg?.meta.displayName ?? componentType;
  const icon        = reg?.meta.icon;
  const isRemovable = reg?.meta.removable !== false;

  const missingDeps = (reg?.meta.requires ?? []).filter(
    reqType => !engine.engine.ecs.hasComponent(entity, reqType)
  );

  const handleToggleEnabled = (e: React.MouseEvent) => {
    e.stopPropagation();
    setProperty(undoManager, comp, 'enabled', !comp.enabled);
    forceUpdate((n) => n + 1);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    engine.engine.ecs.removeComponent(entity, componentType);
    log(`Removed ${displayName} component`, 'info');
    dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
    onRemoved();
  };

  const actions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {/* Enabled toggle */}
      <button
        onClick={handleToggleEnabled}
        title={comp.enabled ? 'Disable component' : 'Enable component'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0 2px',
          color: comp.enabled ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: '13px',
          lineHeight: 1,
          opacity: comp.enabled ? 1 : 0.5,
        }}
      >
        {comp.enabled ? '●' : '○'}
      </button>

      {/* Remove button */}
      {isRemovable && (
        <button
          onClick={handleRemove}
          title={`Remove ${displayName}`}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 2px',
            color: 'var(--text-muted)',
            fontSize: '12px',
            lineHeight: 1,
          }}
        >
          {Icons.close}
        </button>
      )}
    </div>
  );

  return (
    <Section
      title={displayName}
      icon={icon}
      actions={actions}
      defaultOpen={defaultOpen}
    >
      {missingDeps.length > 0 && (
        <div style={{
          margin: '6px 8px 2px',
          padding: '5px 8px',
          background: 'rgba(255, 200, 0, 0.08)',
          border: '1px solid rgba(255, 200, 0, 0.35)',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}>
          {missingDeps.map(reqType => {
            const depName = ComponentRegistry.get(reqType)?.meta.displayName ?? reqType;
            return (
              <div key={reqType} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                color: 'var(--accent-yellow)',
              }}>
                <span style={{ fontWeight: 700 }}>!</span>
                <span>Requires: <strong>{depName}</strong></span>
              </div>
            );
          })}
        </div>
      )}
      {children}
    </Section>
  );
};
