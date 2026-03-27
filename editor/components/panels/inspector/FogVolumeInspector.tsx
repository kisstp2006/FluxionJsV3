import React, { useState } from 'react';
import { Section, PropertyRow, Select, Slider, ColorInput, Checkbox, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { FogVolumeComponent, FogVolumeShape } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';

const shapeOptions: { value: FogVolumeShape; label: string }[] = [
  { value: 'box',       label: 'Box' },
  { value: 'ellipsoid', label: 'Ellipsoid' },
  { value: 'world',     label: 'World (Global)' },
];

export const FogVolumeInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const fv = engine.engine.ecs.getComponent<FogVolumeComponent>(entity, 'FogVolume');
  if (!fv) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section
      title="Fog Volume"
      icon="🌫"
      actions={<RemoveComponentButton entity={entity} componentType="FogVolume" onRemoved={onRemoved} />}
    >
      <PropertyRow label="Shape">
        <Select
          value={fv.shape}
          options={shapeOptions}
          onChange={(v) => { setProperty(undoManager, fv, 'shape', v as FogVolumeShape); update(); }}
        />
      </PropertyRow>

      <PropertyRow label="Density">
        <Slider
          value={fv.density}
          min={0} max={1} step={0.01}
          onChange={(v) => { setProperty(undoManager, fv, 'density', v); update(); }}
        />
      </PropertyRow>

      <PropertyRow label="Albedo">
        <ColorInput
          value={`#${fv.albedo.getHexString()}`}
          onChange={(v) => { setColorProperty(undoManager, fv, 'albedo', v); update(); }}
        />
      </PropertyRow>

      <PropertyRow label="Emission">
        <ColorInput
          value={`#${fv.emission.getHexString()}`}
          onChange={(v) => { setColorProperty(undoManager, fv, 'emission', v); update(); }}
        />
      </PropertyRow>

      <PropertyRow label="Emission Energy">
        <Slider
          value={fv.emissionEnergy}
          min={0} max={10} step={0.1}
          onChange={(v) => { setProperty(undoManager, fv, 'emissionEnergy', v); update(); }}
        />
      </PropertyRow>

      <PropertyRow label="Negative (Clear Fog)">
        <Checkbox
          checked={fv.negative}
          onChange={(v) => { setProperty(undoManager, fv, 'negative', v); update(); }}
        />
      </PropertyRow>

      {fv.shape !== 'world' && (
        <div style={{ padding: '4px 12px', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
          Volume size is driven by the Transform Scale.
        </div>
      )}
    </Section>
  );
};
