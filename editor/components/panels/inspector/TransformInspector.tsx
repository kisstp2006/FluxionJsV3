import React, { useState } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Vector3Input } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { TransformComponent } from '../../../../src/core/Components';
import { markComponentDirty } from '../../../core/ComponentService';

export const TransformInspector: React.FC<{ entity: EntityId }> = ({ entity }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const t = engine.engine.ecs.getComponent<TransformComponent>(entity, 'Transform');
  if (!t) return null;

  const update = () => forceUpdate((n) => n + 1);

  return (
    <Section title="Transform" icon="✥">
      <PropertyRow label="Position">
        <Vector3Input
          value={t.position}
          onChange={(axis, val) => { t.position[axis] = val; markComponentDirty(t, 'position'); update(); }}
        />
      </PropertyRow>
      <PropertyRow label="Rotation">
        <Vector3Input
          value={{
            x: THREE.MathUtils.radToDeg(t.rotation.x),
            y: THREE.MathUtils.radToDeg(t.rotation.y),
            z: THREE.MathUtils.radToDeg(t.rotation.z),
          }}
          onChange={(axis, val) => {
            t.rotation[axis] = THREE.MathUtils.degToRad(val);
            t.quaternion.setFromEuler(t.rotation);
            markComponentDirty(t, 'rotation');
            update();
          }}
          step={1}
        />
      </PropertyRow>
      <PropertyRow label="Scale">
        <Vector3Input
          value={t.scale}
          onChange={(axis, val) => { t.scale[axis] = val; markComponentDirty(t, 'scale'); update(); }}
        />
      </PropertyRow>
    </Section>
  );
};
