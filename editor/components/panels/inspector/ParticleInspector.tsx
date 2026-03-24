import React, { useState } from 'react';
import { Section, PropertyRow, NumberInput, Slider, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { ParticleEmitterComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';

export const ParticleInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const p = engine.engine.ecs.getComponent<ParticleEmitterComponent>(entity, 'ParticleEmitter');
  if (!p) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section title="Particle Emitter" icon={Icons.particle} actions={<RemoveComponentButton entity={entity} componentType="ParticleEmitter" onRemoved={onRemoved} />}>
      <PropertyRow label="Max">
        <NumberInput value={p.maxParticles} step={100} onChange={(v) => { setProperty(undoManager, p, 'maxParticles', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Rate">
        <NumberInput value={p.emissionRate} step={10} onChange={(v) => { setProperty(undoManager, p, 'emissionRate', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Gravity">
        <NumberInput value={p.gravity} step={0.1} onChange={(v) => { setProperty(undoManager, p, 'gravity', v); update(); }} />
      </PropertyRow>
      <PropertyRow label="Spread">
        <Slider value={p.spread} min={0} max={Math.PI} step={0.1} onChange={(v) => { setProperty(undoManager, p, 'spread', v); update(); }} />
      </PropertyRow>
    </Section>
  );
};
