import React from 'react';
import { Section, PropertyRow, Checkbox, NumberInput, ColorInput, Slider, TextInput, Select, AssetInput } from '../../../ui';
import { EntityId } from '../../../../src/core/ECS';
import { TextRendererComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';
import { useComponentInspector } from '../../../core/useComponentInspector';

export const TextRendererInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const [tc, update] = useComponentInspector<TextRendererComponent>(entity, 'TextRenderer');
  if (!tc) return null;

  return (
    <Section title="Text Renderer" icon={'𝐓'} actions={<RemoveComponentButton entity={entity} componentType="TextRenderer" onRemoved={onRemoved} />}>
      <PropertyRow label="Text">
        <TextInput
          value={tc.text}
          onChange={(v) => { setProperty(undoManager, tc, 'text', v); update(); }}
        />
      </PropertyRow>

      {/* Font */}
      <PropertyRow label="Font">
        <AssetInput
          value={tc.fontPath}
          assetType="font"
          placeholder="Select font file"
          onChange={(v) => {
            setProperty(undoManager, tc, 'fontPath', v || null);
            tc._cacheKey = '';
            update();
          }}
        />
      </PropertyRow>

      <PropertyRow label="Font Size">
        <NumberInput value={tc.fontSize} step={0.1} min={0.01} onChange={(v) => { setProperty(undoManager, tc, 'fontSize', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Color">
        <ColorInput
          value={`#${tc.color.getHexString()}`}
          onChange={(v) => { setColorProperty(undoManager, tc, 'color', v); update(); }}
        />
      </PropertyRow>
      <PropertyRow label="Opacity">
        <Slider value={tc.opacity} min={0} max={1} step={0.01} onChange={(v) => { setProperty(undoManager, tc, 'opacity', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Alignment">
        <Select
          value={tc.alignment}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(v) => { setProperty(undoManager, tc, 'alignment', v); update(); }}
        />
      </PropertyRow>
      <PropertyRow label="Max Width">
        <NumberInput value={tc.maxWidth} step={0.1} min={0} onChange={(v) => { setProperty(undoManager, tc, 'maxWidth', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Billboard">
        <Checkbox checked={tc.billboard} onChange={(v) => { setProperty(undoManager, tc, 'billboard', v); update(); }} />
      </PropertyRow>
    </Section>
  );
};
