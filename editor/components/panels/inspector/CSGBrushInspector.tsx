import React, { useState } from 'react';
import { Section, PropertyRow, Select, NumberInput, Vector3Input, Checkbox, AssetInput, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { CSGBrushComponent, CSGBrushShape, CSGOperation } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';

const shapeOptions = [
  { value: 'box', label: 'Box' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'cone', label: 'Cone' },
  { value: 'sphere', label: 'Sphere' },
  { value: 'wedge', label: 'Wedge' },
  { value: 'stairs', label: 'Stairs' },
  { value: 'arch', label: 'Arch' },
];

const operationOptions = [
  { value: 'additive', label: 'Additive' },
  { value: 'subtractive', label: 'Subtractive' },
];

/** Shapes that use the size (xyz) property */
const usesSize = (shape: CSGBrushShape) => shape === 'box' || shape === 'wedge' || shape === 'stairs' || shape === 'arch';
/** Shapes that use radius */
const usesRadius = (shape: CSGBrushShape) => shape === 'cylinder' || shape === 'cone' || shape === 'sphere' || shape === 'arch';
/** Shapes that use segments */
const usesSegments = (shape: CSGBrushShape) => shape !== 'box' && shape !== 'wedge';

export const CSGBrushInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const brush = engine.engine.ecs.getComponent<CSGBrushComponent>(entity, 'CSGBrush');
  if (!brush) return null;

  const update = () => forceUpdate((n) => n + 1);

  const markDirty = () => { brush._dirty = true; brush._version++; };

  const set = <K extends keyof CSGBrushComponent>(key: K, value: CSGBrushComponent[K]) => {
    setProperty(undoManager, brush, key, value);
    markDirty();
    update();
  };

  return (
    <Section title="CSG Brush" icon="🧊" actions={<RemoveComponentButton entity={entity} componentType="CSGBrush" onRemoved={onRemoved} />}>
      <PropertyRow label="Shape">
        <Select
          value={brush.shape}
          onChange={(v) => set('shape', v as CSGBrushShape)}
          options={shapeOptions}
        />
      </PropertyRow>
      <PropertyRow label="Operation">
        <Select
          value={brush.operation}
          onChange={(v) => set('operation', v as CSGOperation)}
          options={operationOptions}
        />
      </PropertyRow>

      {usesSize(brush.shape) && (
        <PropertyRow label="Size">
          <Vector3Input
            value={brush.size}
            step={0.1}
            onChange={(axis, v) => {
              brush.size[axis] = v;
              markDirty();
              update();
            }}
          />
        </PropertyRow>
      )}

      {/* Cylinder/cone/sphere/arch use height from size.y */}
      {(brush.shape === 'cylinder' || brush.shape === 'cone') && (
        <PropertyRow label="Height">
          <NumberInput value={brush.size.y} step={0.1} onChange={(v) => { brush.size.y = v; markDirty(); update(); }} />
        </PropertyRow>
      )}

      {usesRadius(brush.shape) && (
        <PropertyRow label="Radius">
          <NumberInput value={brush.radius} min={0.01} step={0.1} onChange={(v) => set('radius', v)} />
        </PropertyRow>
      )}

      {usesSegments(brush.shape) && (
        <PropertyRow label="Segments">
          <NumberInput value={brush.segments} min={3} max={64} step={1} onChange={(v) => set('segments', Math.round(v))} />
        </PropertyRow>
      )}

      {brush.shape === 'stairs' && (
        <PropertyRow label="Steps">
          <NumberInput value={brush.stairSteps} min={1} max={32} step={1} onChange={(v) => set('stairSteps', Math.round(v))} />
        </PropertyRow>
      )}

      <PropertyRow label="Generate Collision">
        <Checkbox checked={brush.generateCollision} onChange={(v) => set('generateCollision', v)} />
      </PropertyRow>
      <PropertyRow label="Cast Shadow">
        <Checkbox checked={brush.castShadow} onChange={(v) => set('castShadow', v)} />
      </PropertyRow>
      <PropertyRow label="Receive Shadow">
        <Checkbox checked={brush.receiveShadow} onChange={(v) => set('receiveShadow', v)} />
      </PropertyRow>
      <PropertyRow label="Material">
        <AssetInput
          value={brush.materialPath}
          assetType="material"
          placeholder="Default (gray)"
          onChange={(v) => set('materialPath', v || null)}
        />
      </PropertyRow>
    </Section>
  );
};
