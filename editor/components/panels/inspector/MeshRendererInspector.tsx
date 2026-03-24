import React, { useState } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Checkbox, NumberInput, ColorInput, Slider, Button, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { MeshRendererComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setMaterialProperty, setMaterialColor } from '../../../core/ComponentService';
import { AssetTypeRegistry } from '../../../../src/assets/AssetTypeRegistry';

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

  /** Extract filename from a path */
  const getFileName = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
  };

  /** Handle drop of a model asset onto the inspector */
  const handleModelDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath) return;
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef || typeDef.type !== 'model') return;

    mr.modelPath = assetPath;
    mr.primitiveType = undefined;

    try {
      const { projectManager } = await import('../../../../src/project/ProjectManager');
      const absPath = projectManager.resolvePath(assetPath);
      const fileUrl = absPath.startsWith('file://') ? absPath : `file:///${absPath.replace(/\\/g, '/')}`;
      const assets = engine.engine.getSubsystem('assets') as any;
      const gltf = await assets.loadModel(fileUrl);
      const cloned = gltf.scene.clone();
      cloned.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = mr.castShadow;
          child.receiveShadow = mr.receiveShadow;
        }
      });
      mr.mesh = cloned;
    } catch (err) {
      console.error('[MeshRendererInspector] Failed to load model:', err);
    }
    update();
  };

  /** Clear the model and revert to a primitive */
  const handleClearModel = () => {
    if (mr.mesh) {
      if (mr.mesh instanceof THREE.Mesh) mr.mesh.geometry?.dispose();
      // For groups the renderer will clean up
    }
    mr.modelPath = undefined;
    mr.mesh = null;
    mr.primitiveType = 'cube';
    // Recreate default cube
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.1 });
    mr.mesh = new THREE.Mesh(geom, mat);
    mr.mesh.castShadow = mr.castShadow;
    mr.mesh.receiveShadow = mr.receiveShadow;
    update();
  };

  return (
    <Section title="Mesh Renderer" icon={Icons.cube} actions={<RemoveComponentButton entity={entity} componentType="MeshRenderer" onRemoved={onRemoved} />}>
      {mr.modelPath ? (
        <PropertyRow label="Model">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent)',
                fontSize: '11px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
              title={mr.modelPath}
            >
              {getFileName(mr.modelPath)}
            </span>
            <button
              onClick={handleClearModel}
              title="Clear model"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                fontSize: '12px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </PropertyRow>
      ) : mr.primitiveType ? (
        <PropertyRow label="Primitive">
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '11px' }}>
            {mr.primitiveType}
          </span>
        </PropertyRow>
      ) : null}

      {!mr.modelPath && (
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-fluxion-asset')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'link';
            }
          }}
          onDrop={handleModelDrop}
          style={{
            border: '1px dashed var(--border)',
            borderRadius: '4px',
            padding: '8px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '11px',
            marginBottom: '4px',
            cursor: 'default',
          }}
        >
          Drop 3D model here
        </div>
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
