import React, { useState } from 'react';
import { Section, PropertyRow, NumberInput, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { CameraComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';

export const CameraInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const cam = engine.engine.ecs.getComponent<CameraComponent>(entity, 'Camera');
  if (!cam) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section title="Camera" icon={Icons.camera} actions={<RemoveComponentButton entity={entity} componentType="Camera" onRemoved={onRemoved} />}>
      <PropertyRow label="FOV">
        <NumberInput value={cam.fov} step={1} onChange={(v) => { setProperty(undoManager, cam, 'fov', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Near">
        <NumberInput value={cam.near} step={0.01} onChange={(v) => { setProperty(undoManager, cam, 'near', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Far">
        <NumberInput value={cam.far} step={1} onChange={(v) => { setProperty(undoManager, cam, 'far', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Priority">
        <NumberInput value={cam.priority} step={1} onChange={(v) => { setProperty(undoManager, cam, 'priority', v); update(); }} />
      </PropertyRow>
    </Section>
  );
};
