import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Checkbox, NumberInput, ColorInput, Slider, Button, Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { MeshRendererComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setMaterialProperty, setMaterialColor } from '../../../core/ComponentService';
import { AssetTypeRegistry } from '../../../../src/assets/AssetTypeRegistry';
import type { FluxMeshData, FluxMeshMaterialSlot } from '../../../../src/assets/FluxMeshData';
import { applyMaterialsToModel } from '../../../../src/assets/FluxMeshData';

export const MeshRendererInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  const [fluxMeshSlots, setFluxMeshSlots] = useState<FluxMeshMaterialSlot[] | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(true);
  if (!engine) return null;

  const mr = engine.engine.ecs.getComponent<MeshRendererComponent>(entity, 'MeshRenderer');
  if (!mr) return null;

  const update = () => forceUpdate((n) => n + 1);

  const isFluxMesh = mr.modelPath?.endsWith('.fluxmesh') ?? false;

  // Load .fluxmesh slot data when modelPath changes
  useEffect(() => {
    if (!isFluxMesh || !mr.modelPath) {
      setFluxMeshSlots(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { projectManager } = await import('../../../../src/project/ProjectManager');
        const { getFileSystem } = await import('../../../../src/filesystem');
        const fs = getFileSystem();
        const absPath = projectManager.resolvePath(mr.modelPath!);
        const fluxmeshDir = absPath.substring(0, absPath.lastIndexOf('/'));
        const text = await fs.readFile(absPath);
        const data = JSON.parse(text) as FluxMeshData;
        // Resolve material paths relative to .fluxmesh directory
        const resolvedSlots = data.materialSlots.map((s: FluxMeshMaterialSlot) => ({
          ...s,
          defaultMaterial: s.defaultMaterial && !/^[A-Z]:/i.test(s.defaultMaterial) && !s.defaultMaterial.startsWith('/')
            ? `${fluxmeshDir}/${s.defaultMaterial}`
            : s.defaultMaterial,
        }));
        if (!cancelled) setFluxMeshSlots(resolvedSlots);
      } catch {
        if (!cancelled) setFluxMeshSlots(null);
      }
    })();
    return () => { cancelled = true; };
  }, [mr.modelPath]);

  // Get the material for editing (support Mesh and Group) — primitives only
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

  const material = !isFluxMesh ? getMaterial() : null;

  /** Extract filename from a path */
  const getFileName = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
  };

  /** Handle drop of a model or .fluxmesh asset onto the inspector */
  const handleModelDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath) return;
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef || (typeDef.type !== 'model' && typeDef.type !== 'mesh')) return;

    mr.primitiveType = undefined;
    mr.materialSlots = undefined;

    try {
      const { projectManager } = await import('../../../../src/project/ProjectManager');
      const assets = engine.engine.getSubsystem('assets') as any;

      if (typeDef.type === 'mesh' || assetPath.endsWith('.fluxmesh')) {
        // .fluxmesh drop — load with multi-material support
        mr.modelPath = assetPath;
        const absPath = projectManager.resolvePath(assetPath);
        const result = await assets.loadFluxMesh(absPath);
        const cloned = result.scene.clone();
        cloned.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = mr.castShadow;
            child.receiveShadow = mr.receiveShadow;
          }
        });

        // Load default materials for all slots
        const materials = engine.engine.getSubsystem('materials') as any;
        if (materials) {
          const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
            let texAbsPath: string;
            try { texAbsPath = projectManager.resolvePath(relPath); } catch { texAbsPath = relPath; }
            const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
            return assets.loadTexture(texUrl);
          };
          const matPromises = result.slots.map(async (slot: FluxMeshMaterialSlot) => {
            try {
              const matData = await assets.loadAsset(slot.defaultMaterial, 'material');
              if (!matData) return null;
              return materials.createFromFluxMat(matData, loadTexture, slot.defaultMaterial);
            } catch { return null; }
          });
          const loadedMats = await Promise.all(matPromises);
          applyMaterialsToModel(cloned, result.slots, loadedMats);
        }

        mr.mesh = cloned;
      } else {
        // Raw model drop — check for companion .fluxmesh
        const { getFileSystem } = await import('../../../../src/filesystem');
        const fs = getFileSystem();
        const baseName = assetPath.replace(/\.[^.]+$/, '');
        const fluxmeshPath = baseName + '.fluxmesh';
        const fluxmeshAbsPath = projectManager.resolvePath(fluxmeshPath);
        const hasFluxMesh = await fs.exists(fluxmeshAbsPath);

        if (hasFluxMesh) {
          // Redirect to .fluxmesh
          mr.modelPath = fluxmeshPath;
          const result = await assets.loadFluxMesh(fluxmeshAbsPath);
          const cloned = result.scene.clone();
          cloned.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = mr.castShadow;
              child.receiveShadow = mr.receiveShadow;
            }
          });

          // Load default materials for all slots
          const materials = engine.engine.getSubsystem('materials') as any;
          if (materials) {
            const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
              let texAbsPath: string;
              try { texAbsPath = projectManager.resolvePath(relPath); } catch { texAbsPath = relPath; }
              const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
              return assets.loadTexture(texUrl);
            };
            const matPromises = result.slots.map(async (slot: FluxMeshMaterialSlot) => {
              try {
                const matData = await assets.loadAsset(slot.defaultMaterial, 'material');
                if (!matData) return null;
                return materials.createFromFluxMat(matData, loadTexture, slot.defaultMaterial);
              } catch { return null; }
            });
            const loadedMats = await Promise.all(matPromises);
            applyMaterialsToModel(cloned, result.slots, loadedMats);
          }

          mr.mesh = cloned;
        } else {
          // Legacy raw model
          mr.modelPath = assetPath;
          const absPath = projectManager.resolvePath(assetPath);
          const fileUrl = absPath.startsWith('file://') ? absPath : `file:///${absPath.replace(/\\/g, '/')}`;
          const gltf = await assets.loadModel(fileUrl);
          const cloned = gltf.scene.clone();
          cloned.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = mr.castShadow;
              child.receiveShadow = mr.receiveShadow;
            }
          });
          mr.mesh = cloned;
        }
      }
    } catch (err) {
      console.error('[MeshRendererInspector] Failed to load model:', err);
    }
    update();
  };

  /** Clear the model and revert to a primitive */
  const handleClearModel = () => {
    if (mr.mesh) {
      if (mr.mesh instanceof THREE.Mesh) mr.mesh.geometry?.dispose();
    }
    mr.modelPath = undefined;
    mr.mesh = null;
    mr.primitiveType = 'cube';
    mr.materialSlots = undefined;
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.1 });
    mr.mesh = new THREE.Mesh(geom, mat);
    mr.mesh.castShadow = mr.castShadow;
    mr.mesh.receiveShadow = mr.receiveShadow;
    update();
  };

  /** Handle dropping a .fluxmat onto a material slot */
  const handleSlotMaterialDrop = async (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath) return;
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef || typeDef.type !== 'material') return;

    // Update materialSlots override
    const overrides = mr.materialSlots ? [...mr.materialSlots] : [];
    const existingIdx = overrides.findIndex(o => o.slotIndex === slotIndex);
    if (existingIdx >= 0) {
      overrides[existingIdx] = { slotIndex, materialPath: assetPath };
    } else {
      overrides.push({ slotIndex, materialPath: assetPath });
    }
    mr.materialSlots = overrides;

    // Load and apply the material to the correct sub-meshes
    if (mr.mesh && fluxMeshSlots) {
      try {
        const { projectManager } = await import('../../../../src/project/ProjectManager');
        const assets = engine.engine.getSubsystem('assets') as any;
        const materials = engine.engine.getSubsystem('materials') as any;
        if (assets && materials) {
          const matAbsPath = projectManager.resolvePath(assetPath);
          const matData = await assets.loadAsset(matAbsPath, 'material');
          if (matData) {
            const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
              let texAbsPath: string;
              try { texAbsPath = projectManager.resolvePath(relPath); } catch { texAbsPath = relPath; }
              const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
              return assets.loadTexture(texUrl);
            };
            const mat = await materials.createFromFluxMat(matData, loadTexture, assetPath);
            const slot = fluxMeshSlots[slotIndex];
            if (slot) {
              applyMaterialsToModel(mr.mesh, [slot], [mat]);
            }
          }
        }
      } catch (err) {
        console.error('[MeshRendererInspector] Failed to apply slot material:', err);
      }
    }
    update();
  };

  /** Clear a slot override back to default */
  const handleClearSlot = async (slotIndex: number) => {
    if (!mr.materialSlots) return;
    mr.materialSlots = mr.materialSlots.filter(o => o.slotIndex !== slotIndex);
    if (mr.materialSlots.length === 0) mr.materialSlots = undefined;

    // Reload default material for this slot
    if (mr.mesh && fluxMeshSlots && fluxMeshSlots[slotIndex]) {
      try {
        const { projectManager } = await import('../../../../src/project/ProjectManager');
        const assets = engine.engine.getSubsystem('assets') as any;
        const materials = engine.engine.getSubsystem('materials') as any;
        const slot = fluxMeshSlots[slotIndex];
        const matData = await assets.loadAsset(slot.defaultMaterial, 'material');
        if (matData && materials) {
          const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
            let texAbsPath: string;
            try { texAbsPath = projectManager.resolvePath(relPath); } catch { texAbsPath = relPath; }
            const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
            return assets.loadTexture(texUrl);
          };
          const mat = await materials.createFromFluxMat(matData, loadTexture, slot.defaultMaterial);
          applyMaterialsToModel(mr.mesh, [slot], [mat]);
        }
      } catch {}
    }
    update();
  };

  /** Get the current material path for a slot (override or default) */
  const getSlotMaterialPath = (slotIndex: number): string => {
    const override = mr.materialSlots?.find(o => o.slotIndex === slotIndex);
    if (override) return override.materialPath;
    if (fluxMeshSlots && fluxMeshSlots[slotIndex]) return fluxMeshSlots[slotIndex].defaultMaterial;
    return '';
  };

  const isSlotOverridden = (slotIndex: number): boolean => {
    return mr.materialSlots?.some(o => o.slotIndex === slotIndex) ?? false;
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

      {/* Material slots for .fluxmesh models */}
      {isFluxMesh && fluxMeshSlots && fluxMeshSlots.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <div
            onClick={() => setSlotsOpen(!slotsOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '4px 0',
              color: 'var(--text)',
              fontSize: '11px',
              fontWeight: 600,
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: '8px', transform: slotsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
            Materials ({fluxMeshSlots.length})
          </div>
          {slotsOpen && (
            <div style={{ paddingLeft: '8px' }}>
              {fluxMeshSlots.map((slot, idx) => {
                const currentPath = getSlotMaterialPath(idx);
                const overridden = isSlotOverridden(idx);
                return (
                  <div
                    key={idx}
                    style={{ marginBottom: '4px' }}
                  >
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      marginBottom: '2px',
                      fontWeight: 500,
                    }}>
                      {slot.name}
                    </div>
                    <div
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes('application/x-fluxion-asset')) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'link';
                        }
                      }}
                      onDrop={(e) => handleSlotMaterialDrop(e, idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1px solid var(--border)',
                        borderRadius: '3px',
                        padding: '3px 6px',
                        minHeight: '22px',
                        background: overridden ? 'rgba(255,255,255,0.03)' : 'transparent',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: overridden ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: '10px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                        title={currentPath}
                      >
                        {currentPath ? getFileName(currentPath) : 'Drop .fluxmat'}
                      </span>
                      {overridden && (
                        <button
                          onClick={() => handleClearSlot(idx)}
                          title="Reset to default"
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
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Inline material controls — only for primitives (non-.fluxmesh) */}
      {!isFluxMesh && material && (
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
