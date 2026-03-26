import React, { useState } from 'react';
import * as THREE from 'three';
import {
  Section, PropertyRow,
  NumberInput, Slider, Checkbox, ColorInput, AssetInput, Vector2Input,
  Icons,
} from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { ParticleEmitterComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager, PropertyCommand, ColorPropertyCommand } from '../../../core/UndoService';
import { setProperty, setColorProperty } from '../../../core/ComponentService';

export const ParticleInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const p = engine.engine.ecs.getComponent<ParticleEmitterComponent>(entity, 'ParticleEmitter');
  if (!p) return null;

  const update = () => forceUpdate((n) => n + 1);

  // Helper: change one axis of a THREE.Vector2 property with undo
  const setVec2Axis = (prop: 'lifetime' | 'speed' | 'size', axis: 'x' | 'y', value: number) => {
    const oldVec = (p[prop] as THREE.Vector2).clone();
    const newVec = oldVec.clone();
    newVec[axis] = value;
    undoManager.execute(new PropertyCommand(p, prop, oldVec, newVec, `Set Emitter.${prop}.${axis}`));
    update();
  };

  return (
    <Section
      title="Particle Emitter"
      icon={Icons.particle}
      actions={<RemoveComponentButton entity={entity} componentType="ParticleEmitter" onRemoved={onRemoved} />}
    >
      {/* ── Enabled ── */}
      <PropertyRow label="Enabled">
        <Checkbox
          checked={p.enabled}
          onChange={(v) => { setProperty(undoManager, p, 'enabled', v); update(); }}
        />
      </PropertyRow>

      {/* ── Emission ── */}
      <Section title="Emission" defaultOpen>
        <PropertyRow label="Max Particles">
          <NumberInput
            value={p.maxParticles}
            step={100}
            min={1}
            onChange={(v) => { setProperty(undoManager, p, 'maxParticles', Math.round(v)); update(); }}
          />
        </PropertyRow>
        <PropertyRow label="Rate /s">
          <NumberInput
            value={p.emissionRate}
            step={10}
            min={0}
            onChange={(v) => { setProperty(undoManager, p, 'emissionRate', v); update(); }}
          />
        </PropertyRow>
        <PropertyRow label="World Space">
          <Checkbox
            checked={p.worldSpace}
            onChange={(v) => { setProperty(undoManager, p, 'worldSpace', v); update(); }}
          />
        </PropertyRow>
      </Section>

      {/* ── Ranges ── */}
      <Section title="Lifetime / Speed / Size" defaultOpen>
        <PropertyRow label="Lifetime (s)">
          <Vector2Input
            value={{ x: p.lifetime.x, y: p.lifetime.y }}
            step={0.1}
            onChange={(axis, val) => setVec2Axis('lifetime', axis, Math.max(0.01, val))}
          />
        </PropertyRow>
        <PropertyRow label="Speed">
          <Vector2Input
            value={{ x: p.speed.x, y: p.speed.y }}
            step={0.1}
            onChange={(axis, val) => setVec2Axis('speed', axis, Math.max(0, val))}
          />
        </PropertyRow>
        <PropertyRow label="Size">
          <Vector2Input
            value={{ x: p.size.x, y: p.size.y }}
            step={0.05}
            onChange={(axis, val) => setVec2Axis('size', axis, Math.max(0.001, val))}
          />
        </PropertyRow>
      </Section>

      {/* ── Color ── */}
      <Section title="Color" defaultOpen>
        <PropertyRow label="Start">
          <ColorInput
            value={`#${p.startColor.getHexString()}`}
            onChange={(v) => { setColorProperty(undoManager, p, 'startColor', v); update(); }}
          />
        </PropertyRow>
        <PropertyRow label="End">
          <ColorInput
            value={`#${p.endColor.getHexString()}`}
            onChange={(v) => { setColorProperty(undoManager, p, 'endColor', v); update(); }}
          />
        </PropertyRow>
      </Section>

      {/* ── Physics ── */}
      <Section title="Physics" defaultOpen>
        <PropertyRow label="Gravity">
          <NumberInput
            value={p.gravity}
            step={0.5}
            onChange={(v) => { setProperty(undoManager, p, 'gravity', v); update(); }}
          />
        </PropertyRow>
        <PropertyRow label="Spread">
          <Slider
            value={p.spread}
            min={0}
            max={Math.PI}
            step={0.05}
            onChange={(v) => { setProperty(undoManager, p, 'spread', v); update(); }}
          />
        </PropertyRow>
      </Section>

      {/* ── Rendering ── */}
      <Section title="Rendering" defaultOpen={false}>
        <PropertyRow label="Texture">
          <AssetInput
            value={p.texture ?? ''}
            assetType="texture"
            onChange={(v) => { setProperty(undoManager, p, 'texture', v || null); update(); }}
          />
        </PropertyRow>
        <PropertyRow label="Soft Particles">
          <Checkbox
            checked={p.softParticles}
            onChange={(v) => { setProperty(undoManager, p, 'softParticles', v); update(); }}
          />
        </PropertyRow>
        {p.softParticles && (
          <PropertyRow label="Soft Distance">
            <Slider
              value={p.softDistance}
              min={0.1}
              max={5}
              step={0.1}
              onChange={(v) => { setProperty(undoManager, p, 'softDistance', v); update(); }}
            />
          </PropertyRow>
        )}
      </Section>
    </Section>
  );
};
