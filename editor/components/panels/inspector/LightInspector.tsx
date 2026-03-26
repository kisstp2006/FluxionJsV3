import React from 'react';
import { Section, PropertyRow, Select, ColorInput, Slider, NumberInput, Checkbox, Icons, AssetInput } from '../../../ui';
import { EntityId } from '../../../../src/core/ECS';
import { LightComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';
import { useComponentInspector } from '../../../core/useComponentInspector';

export const LightInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const [light, update] = useComponentInspector<LightComponent>(entity, 'Light');
  if (!light) return null;

  return (
    <Section title="Light" icon={Icons.light} actions={<RemoveComponentButton entity={entity} componentType="Light" onRemoved={onRemoved} />}>
      <PropertyRow label="Type">
        <Select
          value={light.lightType}
          onChange={(v) => { setProperty(undoManager, light, 'lightType', v); update(); }}
          options={[
            { value: 'directional', label: 'Directional' },
            { value: 'point', label: 'Point' },
            { value: 'spot', label: 'Spot' },
            { value: 'ambient', label: 'Ambient' },
          ]}
        />
      </PropertyRow>
      <PropertyRow label="Color">
        <ColorInput
          value={`#${light.color.getHexString()}`}
          onChange={(v) => { setColorProperty(undoManager, light, 'color', v); update(); }}
        />
      </PropertyRow>
      <PropertyRow label="Intensity">
        <Slider value={light.intensity} min={0} max={10} step={0.1} onChange={(v) => { setProperty(undoManager, light, 'intensity', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Range">
        <NumberInput value={light.range} step={1} onChange={(v) => { setProperty(undoManager, light, 'range', v); update(); }} />
      </PropertyRow>
      {light.lightType === 'spot' && (
        <>
          <PropertyRow label="Spot Angle">
            <Slider value={light.spotAngle} min={1} max={180} step={1} onChange={(v) => { setProperty(undoManager, light, 'spotAngle', v); update(); }} />
          </PropertyRow>
          <PropertyRow label="Penumbra">
            <Slider value={light.spotPenumbra} min={0} max={1} step={0.01} onChange={(v) => { setProperty(undoManager, light, 'spotPenumbra', v); update(); }} />
          </PropertyRow>
        </>
      )}
      <PropertyRow label="Shadows">
        <Checkbox checked={light.castShadow} onChange={(v) => { setProperty(undoManager, light, 'castShadow', v); update(); }} />
      </PropertyRow>
      {light.lightType !== 'ambient' && (
        <PropertyRow label="Cookie Texture">
          <AssetInput
            value={light.cookieTexturePath}
            assetType="texture"
            placeholder="Select cookie texture"
            onChange={(v) => {
              setProperty(undoManager, light, 'cookieTexturePath', v || null);
              light.cookieTexture = null;
              update();
            }}
          />
        </PropertyRow>
      )}
    </Section>
  );
};
