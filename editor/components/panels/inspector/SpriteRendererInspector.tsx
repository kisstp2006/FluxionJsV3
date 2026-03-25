import React, { useState } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Checkbox, NumberInput, ColorInput, Slider } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { SpriteComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';
import { AssetTypeRegistry } from '../../../../src/assets/AssetTypeRegistry';

export const SpriteRendererInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const sprite = engine.engine.ecs.getComponent<SpriteComponent>(entity, 'Sprite');
  if (!sprite) return null;

  const update = () => forceUpdate((n) => n + 1);

  const getFileName = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
  };

  const handleTextureDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath) return;
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef || typeDef.type !== 'texture') return;

    setProperty(undoManager, sprite, 'texturePath', assetPath);
    // Clear cached texture so the system re-loads
    sprite.spriteTexture = null;
    update();
  };

  const handleClearTexture = () => {
    setProperty(undoManager, sprite, 'texturePath', null);
    sprite.spriteTexture = null;
    if (sprite.spriteMesh) {
      const mat = sprite.spriteMesh.material as THREE.MeshBasicMaterial;
      mat.map = null;
      mat.needsUpdate = true;
    }
    update();
  };

  return (
    <Section title="Sprite Renderer" icon={'🖼'} actions={<RemoveComponentButton entity={entity} componentType="Sprite" onRemoved={onRemoved} />}>
      {/* Texture drop zone */}
      <div style={{ marginTop: '4px', marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 600, marginBottom: '4px' }}>
          Texture
        </div>
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-fluxion-asset')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'link';
            }
          }}
          onDrop={handleTextureDrop}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '3px 6px',
            minHeight: '22px',
            background: sprite.texturePath ? 'rgba(255,255,255,0.03)' : 'transparent',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              color: sprite.texturePath ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '10px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
            title={sprite.texturePath || ''}
          >
            {sprite.texturePath ? getFileName(sprite.texturePath) : 'Drop texture image'}
          </span>
          {sprite.texturePath && (
            <button
              onClick={handleClearTexture}
              title="Clear texture"
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

      <PropertyRow label="Color">
        <ColorInput
          value={`#${sprite.color.getHexString()}`}
          onChange={(v) => { setColorProperty(undoManager, sprite, 'color', v); update(); }}
        />
      </PropertyRow>
      <PropertyRow label="Opacity">
        <Slider value={sprite.opacity} min={0} max={1} step={0.01} onChange={(v) => { setProperty(undoManager, sprite, 'opacity', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Flip X">
        <Checkbox checked={sprite.flipX} onChange={(v) => { setProperty(undoManager, sprite, 'flipX', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Flip Y">
        <Checkbox checked={sprite.flipY} onChange={(v) => { setProperty(undoManager, sprite, 'flipY', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Pixels/Unit">
        <NumberInput value={sprite.pixelsPerUnit} step={1} min={1} onChange={(v) => { setProperty(undoManager, sprite, 'pixelsPerUnit', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Sorting Layer">
        <NumberInput value={sprite.sortingLayer} step={1} onChange={(v) => { setProperty(undoManager, sprite, 'sortingLayer', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Sorting Order">
        <NumberInput value={sprite.sortingOrder} step={1} onChange={(v) => { setProperty(undoManager, sprite, 'sortingOrder', v); update(); }} />
      </PropertyRow>
    </Section>
  );
};
