import React, { useState } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Checkbox, NumberInput, ColorInput, Slider, TextInput, Select } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { TextRendererComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';
import { AssetTypeRegistry } from '../../../../src/assets/AssetTypeRegistry';

export const TextRendererInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const tc = engine.engine.ecs.getComponent<TextRendererComponent>(entity, 'TextRenderer');
  if (!tc) return null;

  const update = () => forceUpdate((n) => n + 1);

  const getFileName = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
  };

  const handleFontDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath) return;
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef || typeDef.type !== 'font') return;
    setProperty(undoManager, tc, 'fontPath', assetPath);
    tc._cacheKey = ''; // force rebuild
    update();
  };

  const handleClearFont = () => {
    setProperty(undoManager, tc, 'fontPath', null);
    tc._cacheKey = ''; // force rebuild
    update();
  };

  return (
    <Section title="Text Renderer" icon={'𝐓'} actions={<RemoveComponentButton entity={entity} componentType="TextRenderer" onRemoved={onRemoved} />}>
      <PropertyRow label="Text">
        <TextInput
          value={tc.text}
          onChange={(v) => { setProperty(undoManager, tc, 'text', v); update(); }}
        />
      </PropertyRow>

      {/* Font drop zone */}
      <div style={{ marginTop: '4px', marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 600, marginBottom: '4px' }}>
          Font
        </div>
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-fluxion-asset')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'link';
            }
          }}
          onDrop={handleFontDrop}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '3px 6px',
            minHeight: '22px',
            background: tc.fontPath ? 'rgba(255,255,255,0.03)' : 'transparent',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              color: tc.fontPath ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '10px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
            title={tc.fontPath || ''}
          >
            {tc.fontPath ? getFileName(tc.fontPath) : 'Drop font file (.ttf, .otf, .woff)'}
          </span>
          {tc.fontPath && (
            <button
              onClick={handleClearFont}
              title="Clear font"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '1px',
                fontSize: '10px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

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
