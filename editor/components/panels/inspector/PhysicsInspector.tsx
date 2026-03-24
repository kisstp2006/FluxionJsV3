import React, { useState } from 'react';
import { Section, PropertyRow, Select, NumberInput, Slider, Checkbox, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { RigidbodyComponent, ColliderComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';

export const RigidbodyInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const rb = engine.engine.ecs.getComponent<RigidbodyComponent>(entity, 'Rigidbody');
  if (!rb) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section title="Rigidbody" icon={Icons.physics} actions={<RemoveComponentButton entity={entity} componentType="Rigidbody" onRemoved={onRemoved} />}>
      <PropertyRow label="Type">
        <Select
          value={rb.bodyType}
          onChange={(v) => { setProperty(undoManager, rb, 'bodyType', v); update(); }}
          options={[
            { value: 'dynamic', label: 'Dynamic' },
            { value: 'static', label: 'Static' },
            { value: 'kinematic', label: 'Kinematic' },
          ]}
        />
      </PropertyRow>
      <PropertyRow label="Mass">
        <NumberInput value={rb.mass} step={0.1} onChange={(v) => { setProperty(undoManager, rb, 'mass', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Friction">
        <Slider value={rb.friction} min={0} max={2} step={0.1} onChange={(v) => { setProperty(undoManager, rb, 'friction', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Bounce">
        <Slider value={rb.restitution} min={0} max={1} step={0.05} onChange={(v) => { setProperty(undoManager, rb, 'restitution', v); update(); }} />
      </PropertyRow>
    </Section>
  );
};

export const ColliderInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const collider = engine.engine.ecs.getComponent<ColliderComponent>(entity, 'Collider');
  if (!collider) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section title="Collider" icon={Icons.cube} actions={<RemoveComponentButton entity={entity} componentType="Collider" onRemoved={onRemoved} />}>
      <PropertyRow label="Shape">
        <Select
          value={collider.shape}
          onChange={(v) => { setProperty(undoManager, collider, 'shape', v); update(); }}
          options={[
            { value: 'box', label: 'Box' },
            { value: 'sphere', label: 'Sphere' },
            { value: 'capsule', label: 'Capsule' },
            { value: 'cylinder', label: 'Cylinder' },
            { value: 'mesh', label: 'Mesh' },
          ]}
        />
      </PropertyRow>
      <PropertyRow label="Is Trigger">
        <Checkbox checked={collider.isTrigger} onChange={(v) => { setProperty(undoManager, collider, 'isTrigger', v); update(); }} />
      </PropertyRow>
    </Section>
  );
};
