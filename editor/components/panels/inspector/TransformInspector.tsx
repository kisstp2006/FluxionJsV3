import React, { useState } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Vector3Input, Icons } from '../../../ui';
import { EntityId } from '../../../../src/core/ECS';
import { TransformComponent } from '../../../../src/core/Components';
import { markComponentDirty } from '../../../core/ComponentService';
import { useComponentInspector } from '../../../core/useComponentInspector';

export const TransformInspector: React.FC<{ entity: EntityId }> = ({ entity }) => {
  const [t, update] = useComponentInspector<TransformComponent>(entity, 'Transform');
  const [uniformScale, setUniformScale] = useState(true);
  if (!t) return null;

  const handleScaleChange = (axis: 'x' | 'y' | 'z', val: number) => {
    if (uniformScale) {
      const prev = t.scale[axis];
      if (prev !== 0) {
        const ratio = val / prev;
        t.scale.x *= ratio;
        t.scale.y *= ratio;
        t.scale.z *= ratio;
      } else {
        t.scale.set(val, val, val);
      }
    } else {
      t.scale[axis] = val;
    }
    markComponentDirty(t, 'scale');
    update();
  };

  return (
    <Section title="Transform" icon={Icons.move}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
          <Vector3Input
            value={t.scale}
            onChange={handleScaleChange}
          />
          <button
            onClick={() => setUniformScale(!uniformScale)}
            title={uniformScale ? 'Uniform scale (linked)' : 'Per-axis scale (unlinked)'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: uniformScale ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '14px',
              lineHeight: 1,
              flexShrink: 0,
              opacity: uniformScale ? 1 : 0.5,
              transition: 'color 150ms, opacity 150ms',
            }}
          >
            {uniformScale ? '🔗' : '🔓'}
          </button>
        </div>
      </PropertyRow>
    </Section>
  );
};
