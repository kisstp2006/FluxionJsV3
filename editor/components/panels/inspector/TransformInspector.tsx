import React, { useCallback, useState } from 'react';
import * as THREE from 'three';
import { PropertyRow, Vector3Input, Section } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { TransformComponent } from '../../../../src/core/Components';
import { ComponentSection } from './ComponentSection';
import { ComponentInspectorRegistry } from '../../../core/ComponentInspectorRegistry';
import { undoManager, TransformCommand } from '../../../core/UndoService';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export const TransformInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  const refresh = useCallback(() => forceUpdate(v => v + 1), []);

  if (!engine) return null;
  const t = engine.engine.ecs.getComponent<TransformComponent>(entity, 'Transform');
  if (!t) return null;

  const isChild = engine.engine.ecs.getParent(entity) !== undefined;

  const commitPos = (x: number, y: number, z: number) => {
    const old = { position: t.position.clone(), rotation: t.rotation.clone(), scale: t.scale.clone() };
    t.position.set(x, y, z);
    undoManager.execute(new TransformCommand(entity, engine.engine.ecs, old, { position: t.position, rotation: t.rotation, scale: t.scale }));
    refresh();
  };

  const commitRot = (xDeg: number, yDeg: number, zDeg: number) => {
    const old = { position: t.position.clone(), rotation: t.rotation.clone(), scale: t.scale.clone() };
    t.rotation.set(xDeg * DEG2RAD, yDeg * DEG2RAD, zDeg * DEG2RAD);
    undoManager.execute(new TransformCommand(entity, engine.engine.ecs, old, { position: t.position, rotation: t.rotation, scale: t.scale }));
    refresh();
  };

  const commitScl = (x: number, y: number, z: number) => {
    const old = { position: t.position.clone(), rotation: t.rotation.clone(), scale: t.scale.clone() };
    t.scale.set(x, y, z);
    undoManager.execute(new TransformCommand(entity, engine.engine.ecs, old, { position: t.position, rotation: t.rotation, scale: t.scale }));
    refresh();
  };

  const commitWorldPos = (x: number, y: number, z: number) => {
    const old = { position: t.position.clone(), rotation: t.rotation.clone(), scale: t.scale.clone() };
    t.setWorldPosition(new THREE.Vector3(x, y, z), engine.engine.ecs);
    undoManager.execute(new TransformCommand(entity, engine.engine.ecs, old, { position: t.position, rotation: t.rotation, scale: t.scale }));
    refresh();
  };

  const posVal = { x: t.position.x, y: t.position.y, z: t.position.z };
  const rotVal = { x: t.rotation.x * RAD2DEG, y: t.rotation.y * RAD2DEG, z: t.rotation.z * RAD2DEG };
  const sclVal = { x: t.scale.x, y: t.scale.y, z: t.scale.z };
  const wpVal  = { x: t.worldPosition.x, y: t.worldPosition.y, z: t.worldPosition.z };

  const worldEuler = new THREE.Euler().setFromQuaternion(t.worldRotation);
  const wrVal = { x: worldEuler.x * RAD2DEG, y: worldEuler.y * RAD2DEG, z: worldEuler.z * RAD2DEG };

  return (
    <ComponentSection componentType="Transform" entity={entity} onRemoved={onRemoved}>
      <PropertyRow label="Position">
        <Vector3Input
          value={posVal}
          step={0.1}
          onChange={(axis, v) => commitPos(
            axis === 'x' ? v : posVal.x,
            axis === 'y' ? v : posVal.y,
            axis === 'z' ? v : posVal.z,
          )}
        />
      </PropertyRow>
      <PropertyRow label="Rotation">
        <Vector3Input
          value={rotVal}
          step={1}
          onChange={(axis, v) => commitRot(
            axis === 'x' ? v : rotVal.x,
            axis === 'y' ? v : rotVal.y,
            axis === 'z' ? v : rotVal.z,
          )}
        />
      </PropertyRow>
      <PropertyRow label="Scale">
        <Vector3Input
          value={sclVal}
          step={0.01}
          onChange={(axis, v) => commitScl(
            axis === 'x' ? v : sclVal.x,
            axis === 'y' ? v : sclVal.y,
            axis === 'z' ? v : sclVal.z,
          )}
        />
      </PropertyRow>

      {isChild && (
        <Section title="World">
          <PropertyRow label="Position">
            <Vector3Input
              value={wpVal}
              step={0.1}
              onChange={(axis, v) => commitWorldPos(
                axis === 'x' ? v : wpVal.x,
                axis === 'y' ? v : wpVal.y,
                axis === 'z' ? v : wpVal.z,
              )}
            />
          </PropertyRow>
          <PropertyRow label="Rotation">
            <Vector3Input
              value={wrVal}
              step={1}
              onChange={() => { /* read-only */ }}
            />
          </PropertyRow>
        </Section>
      )}
    </ComponentSection>
  );
};

ComponentInspectorRegistry.register('Transform', TransformInspector);
