import React from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Checkbox, NumberInput, ColorInput, Slider, AssetInput } from '../../../ui';
import { EntityId } from '../../../../src/core/ECS';
import { SpriteComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';
import { useComponentInspector } from '../../../core/useComponentInspector';

export const SpriteRendererInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const [sprite, update] = useComponentInspector<SpriteComponent>(entity, 'Sprite');
  if (!sprite) return null;

  return (
    <Section title="Sprite Renderer" icon={'🖼'} actions={<RemoveComponentButton entity={entity} componentType="Sprite" onRemoved={onRemoved} />}>
      {/* Texture */}
      <PropertyRow label="Texture">
        <AssetInput
          value={sprite.texturePath}
          assetType="texture"
          placeholder="Drop or select texture"
          onChange={(v) => {
            setProperty(undoManager, sprite, 'texturePath', v || null);
            sprite.spriteTexture = null;
            if (!v && sprite.spriteMesh) {
              const mat = sprite.spriteMesh.material as THREE.MeshBasicMaterial;
              mat.map = null;
              mat.needsUpdate = true;
            }
            update();
          }}
        />
      </PropertyRow>

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
