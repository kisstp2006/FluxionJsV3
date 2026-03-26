import React from 'react';
import { Section, PropertyRow, NumberInput, Checkbox, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { CameraComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';
import { useComponentInspector } from '../../../core/useComponentInspector';

export const CameraInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine(); // needed for getAllEntities in handleSetMain
  const [cam, update] = useComponentInspector<CameraComponent>(entity, 'Camera');
  if (!engine || !cam) return null;

  const handleSetMain = (checked: boolean) => {
    if (checked) {
      // Unset isMain on all other cameras in the scene
      const allEntities = engine.engine.ecs.getAllEntities();
      for (const eid of allEntities) {
        const other = engine.engine.ecs.getComponent<CameraComponent>(eid, 'Camera');
        if (other && other !== cam && other.isMain) {
          setProperty(undoManager, other, 'isMain', false);
        }
      }
    }
    setProperty(undoManager, cam, 'isMain', checked);
    update();
  };

  return (
    <Section title="Camera" icon={Icons.camera} actions={<RemoveComponentButton entity={entity} componentType="Camera" onRemoved={onRemoved} />}>
      <PropertyRow label="Main Camera">
        <Checkbox checked={cam.isMain} onChange={handleSetMain} />
      </PropertyRow>
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
