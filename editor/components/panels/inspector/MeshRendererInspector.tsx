import React, { useState } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Checkbox, NumberInput, ColorInput, Slider } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { MeshRendererComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setMaterialProperty, setMaterialColor } from '../../../core/ComponentService';

export const MeshRendererInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  if (!engine) return null;

  const mr = engine.engine.ecs.getComponent<MeshRendererComponent>(entity, 'MeshRenderer');
  if (!mr) return null;

  const update = () => forceUpdate((n) => n + 1);

  // Get the material for editing (support Mesh and Group)
  const getMaterial = (): THREE.MeshStandardMaterial | null => {
    if (!mr.mesh) return null;
    if (mr.mesh instanceof THREE.Mesh && mr.mesh.material instanceof THREE.MeshStandardMaterial) {
      return mr.mesh.material;
    }
    if (mr.mesh instanceof THREE.Group) {
      let mat: THREE.MeshStandardMaterial | null = null;
      mr.mesh.traverse((child) => {
        if (!mat && child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          mat = child.material;
        }
      });
      return mat;
    }
    return null;
  };

  const material = getMaterial();

  return (
    <Section title="Mesh Renderer" icon="▣" actions={<RemoveComponentButton entity={entity} componentType="MeshRenderer" onRemoved={onRemoved} />}>
      {mr.primitiveType && (
        <PropertyRow label="Primitive">
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '11px' }}>
            {mr.primitiveType}
          </span>
        </PropertyRow>
      )}
      <PropertyRow label="Cast Shadow">
        <Checkbox checked={mr.castShadow} onChange={(v) => {
          setProperty(undoManager, mr, 'castShadow', v);
          update();
        }} />
      </PropertyRow>
      <PropertyRow label="Receive Shadow">
        <Checkbox checked={mr.receiveShadow} onChange={(v) => {
          setProperty(undoManager, mr, 'receiveShadow', v);
          update();
        }} />
      </PropertyRow>
      <PropertyRow label="Layer">
        <NumberInput value={mr.layer} step={1} onChange={(v) => { setProperty(undoManager, mr, 'layer', v); update(); }} />
      </PropertyRow>
      {material && (
        <>
          <PropertyRow label="Color">
            <ColorInput
              value={`#${material.color.getHexString()}`}
              onChange={(v) => { setMaterialColor(undoManager, material, v); update(); }}
            />
          </PropertyRow>
          <PropertyRow label="Roughness">
            <Slider value={material.roughness} min={0} max={1} step={0.01} onChange={(v) => { setMaterialProperty(undoManager, material, 'roughness', v); update(); }} />
          </PropertyRow>
          <PropertyRow label="Metalness">
            <Slider value={material.metalness} min={0} max={1} step={0.01} onChange={(v) => { setMaterialProperty(undoManager, material, 'metalness', v); update(); }} />
          </PropertyRow>
          <PropertyRow label="Wireframe">
            <Checkbox checked={material.wireframe} onChange={(v) => { setMaterialProperty(undoManager, material, 'wireframe', v); update(); }} />
          </PropertyRow>
        </>
      )}
    </Section>
  );
};
