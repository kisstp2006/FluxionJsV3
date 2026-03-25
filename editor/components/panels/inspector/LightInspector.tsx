import React, { useState, useCallback } from 'react';
import { Section, PropertyRow, Select, ColorInput, Slider, NumberInput, Checkbox, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { LightComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';

/** Helper: pick an image file and return absolute path */
async function pickImage(): Promise<string | null> {
  const api = (window as any).fluxionAPI;
  if (!api?.openFileDialog) return null;
  return api.openFileDialog([
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp'] },
  ]);
}

export const LightInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const light = engine.engine.ecs.getComponent<LightComponent>(entity, 'Light');
  if (!light) return null;

  const update = () => forceUpdate((n) => n + 1);

  const browseCookie = useCallback(async () => {
    const picked = await pickImage();
    if (picked) { setProperty(undoManager, light, 'cookieTexturePath', picked); light.cookieTexture = null; update(); }
  }, [light]);

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
      <PropertyRow label="Shadows">
        <Checkbox checked={light.castShadow} onChange={(v) => { setProperty(undoManager, light, 'castShadow', v); update(); }} />
      </PropertyRow>
      {light.lightType === 'spot' && (
        <PropertyRow label="Cookie Texture">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
            <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={light.cookieTexturePath ?? '(none)'}>
              {light.cookieTexturePath ? light.cookieTexturePath.replace(/\\/g, '/').split('/').pop() : <em style={{ color: 'var(--text-muted)' }}>None</em>}
            </span>
            <button style={{ padding: '2px 6px', fontSize: 11, cursor: 'pointer', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)' }} onClick={browseCookie} title="Browse...">...</button>
            {light.cookieTexturePath && (
              <button style={{ padding: '2px 4px', fontSize: 11, cursor: 'pointer', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-muted)' }} onClick={() => { setProperty(undoManager, light, 'cookieTexturePath', null); light.cookieTexture = null; update(); }} title="Clear">&times;</button>
            )}
          </div>
        </PropertyRow>
      )}
    </Section>
  );
};
