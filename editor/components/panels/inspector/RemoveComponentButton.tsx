import React from 'react';
import { EntityId } from '../../../../src/core/ECS';
import { useEditor, useEngine } from '../../../core/EditorContext';

export const RemoveComponentButton: React.FC<{ entity: EntityId; componentType: string; onRemoved: () => void }> = ({ entity, componentType, onRemoved }) => {
  const engine = useEngine();
  const { log, dispatch } = useEditor();
  if (!engine) return null;

  return (
    <button
      onClick={() => {
        engine.engine.ecs.removeComponent(entity, componentType);
        log(`Removed ${componentType} component`, 'info');
        dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
        onRemoved();
      }}
      title={`Remove ${componentType}`}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: '12px',
        padding: '0 4px',
        lineHeight: 1,
      }}
    >
      ✕
    </button>
  );
};
