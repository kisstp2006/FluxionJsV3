import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Checkbox, NumberInput, Icons, Vector2Input } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { MeshRendererComponent } from '../../../../src/core/Components';
import { RemoveComponentButton } from './RemoveComponentButton';
import { undoManager } from '../../../core/UndoService';
import { setProperty } from '../../../core/ComponentService';
import { AssetTypeRegistry } from '../../../../src/assets/AssetTypeRegistry';
import type { FluxMeshData, FluxMeshMaterialSlot } from '../../../../src/assets/FluxMeshData';
import { applyMaterialsToModel } from '../../../../src/assets/FluxMeshData';
import type { VisualMaterialFile } from '../../../../src/materials/VisualMaterialGraph';

/** Apply UV scale / offset / rotation to every texture map on the mesh's materials. */
function applyUvTransform(mesh: THREE.Mesh | THREE.Group | null, scale: { x: number; y: number }, offset: { x: number; y: number }, rotationDeg: number) {
  if (!mesh) return;
  const rotRad = (rotationDeg * Math.PI) / 180;
  const visit = (mat: THREE.Material) => {
    if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial)) return;
    const maps: (THREE.Texture | null)[] = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap, mat.emissiveMap];
    for (const tex of maps) {
      if (!tex) continue;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(scale.x, scale.y);
      tex.offset.set(offset.x, offset.y);
      tex.rotation = rotRad;
      tex.center.set(0.5, 0.5);
      tex.needsUpdate = true;
    }
  };
  if (mesh instanceof THREE.Mesh) {
    if (Array.isArray(mesh.material)) mesh.material.forEach(visit);
    else visit(mesh.material);
  } else {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) child.material.forEach(visit);
        else visit(child.material);
      }
    });
  }
}

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

  /** Check if a dropped asset is any material type (.fluxmat or .fluxvismat) */
  const isMaterialAsset = (assetPath: string): boolean => {
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    return !!typeDef && (typeDef.type === 'material' || typeDef.type === 'visual_material');
  };

  /** Load a material from path — handles both .fluxmat and .fluxvismat */
  const loadMaterialFromPath = async (
    assetPath: string,
  ): Promise<THREE.Material | null> => {
    try {
      const { projectManager } = await import('../../../../src/project/ProjectManager');
      const assets = engine.engine.getSubsystem('assets') as any;
      const materials = engine.engine.getSubsystem('materials') as any;
      if (!assets || !materials) return null;

      const matAbsPath = projectManager.resolvePath(assetPath);
      const matDir = matAbsPath.substring(0, matAbsPath.lastIndexOf('/'));
      const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
        let texAbsPath: string;
        if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
          texAbsPath = relPath;
        } else {
          texAbsPath = `${matDir}/${relPath}`;
          try {
            const { getFileSystem: getFs } = await import('../../../../src/filesystem');
            const projResolved = projectManager.resolvePath(relPath);
            if (!(await getFs().exists(texAbsPath)) && await getFs().exists(projResolved)) texAbsPath = projResolved;
          } catch {}
        }
        const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
        return assets.loadTexture(texUrl);
      };

      if (assetPath.endsWith('.fluxvismat')) {
        const visData = await assets.loadAsset(matAbsPath, 'visual_material') as VisualMaterialFile | null;
        if (!visData) return null;
        return materials.createFromVisualMat(visData, loadTexture, assetPath);
      } else {
        const matData = await assets.loadAsset(matAbsPath, 'material');
        if (!matData) return null;
        return materials.createFromFluxMat(matData, loadTexture, assetPath);
      }
    } catch (err) {
      console.error('[MeshRendererInspector] Failed to load material:', err);
      return null;
    }
  };

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
          const matPromises = result.slots.map(async (slot: FluxMeshMaterialSlot) => {
            try {
              const matData = await assets.loadAsset(slot.defaultMaterial, 'material');
              if (!matData) return null;
              const matDir = slot.defaultMaterial.substring(0, slot.defaultMaterial.lastIndexOf('/'));
              const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
                let texAbsPath: string;
                if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
                  texAbsPath = relPath;
                } else {
                  texAbsPath = `${matDir}/${relPath}`;
                  try {
                    const { getFileSystem: getFs } = await import('../../../../src/filesystem');
                    const projResolved = projectManager.resolvePath(relPath);
                    if (!(await getFs().exists(texAbsPath)) && await getFs().exists(projResolved)) texAbsPath = projResolved;
                  } catch {}
                }
                const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
                return assets.loadTexture(texUrl);
              };
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
            const matPromises = result.slots.map(async (slot: FluxMeshMaterialSlot) => {
              try {
                const matData = await assets.loadAsset(slot.defaultMaterial, 'material');
                if (!matData) return null;
                const matDir = slot.defaultMaterial.substring(0, slot.defaultMaterial.lastIndexOf('/'));
                const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
                  let texAbsPath: string;
                  if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
                    texAbsPath = relPath;
                  } else {
                    texAbsPath = `${matDir}/${relPath}`;
                    try {
                      const { getFileSystem: getFs } = await import('../../../../src/filesystem');
                      const projResolved = projectManager.resolvePath(relPath);
                      if (!(await getFs().exists(texAbsPath)) && await getFs().exists(projResolved)) texAbsPath = projResolved;
                    } catch {}
                  }
                  const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
                  return assets.loadTexture(texUrl);
                };
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
    mr.materialPath = undefined;
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.1 });
    mr.mesh = new THREE.Mesh(geom, mat);
    mr.mesh.castShadow = mr.castShadow;
    mr.mesh.receiveShadow = mr.receiveShadow;
    update();
  };

  /** Handle dropping a material (.fluxmat or .fluxvismat) onto a material slot */
  const handleSlotMaterialDrop = async (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath || !isMaterialAsset(assetPath)) return;

    // Update materialSlots override
    const overrides = mr.materialSlots ? [...mr.materialSlots] : [];
    const existingIdx = overrides.findIndex(o => o.slotIndex === slotIndex);
    if (existingIdx >= 0) {
      overrides[existingIdx] = { slotIndex, materialPath: assetPath };
    } else {
      overrides.push({ slotIndex, materialPath: assetPath });
    }
    setProperty(undoManager, mr, 'materialSlots', overrides);

    // Load and apply the material to the correct sub-meshes
    if (mr.mesh && fluxMeshSlots) {
      const mat = await loadMaterialFromPath(assetPath);
      if (mat) {
        const slot = fluxMeshSlots[slotIndex];
        if (slot) {
          applyMaterialsToModel(mr.mesh, [slot], [mat]);
        }
      }
    }
    update();
  };


  /** Clear a slot override back to default */
  const handleClearSlot = async (slotIndex: number) => {
    if (!mr.materialSlots) return;
    const filtered = mr.materialSlots.filter(o => o.slotIndex !== slotIndex);
    setProperty(undoManager, mr, 'materialSlots', filtered.length > 0 ? filtered : undefined);

    // Reload default material for this slot
    if (mr.mesh && fluxMeshSlots && fluxMeshSlots[slotIndex]) {
      try {
        const { projectManager } = await import('../../../../src/project/ProjectManager');
        const assets = engine.engine.getSubsystem('assets') as any;
        const materials = engine.engine.getSubsystem('materials') as any;
        const slot = fluxMeshSlots[slotIndex];
        const matData = await assets.loadAsset(slot.defaultMaterial, 'material');
        if (matData && materials) {
          const matDir = slot.defaultMaterial.substring(0, slot.defaultMaterial.lastIndexOf('/'));
          const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
            let texAbsPath: string;
            if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
              texAbsPath = relPath;
            } else {
              texAbsPath = `${matDir}/${relPath}`;
              try {
                const { getFileSystem: getFs } = await import('../../../../src/filesystem');
                const projResolved = projectManager.resolvePath(relPath);
                if (!(await getFs().exists(texAbsPath)) && await getFs().exists(projResolved)) texAbsPath = projResolved;
              } catch {}
            }
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

  /** Handle dropping a material (.fluxmat or .fluxvismat) onto a primitive's material slot */
  const handlePrimitiveMaterialDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath || !isMaterialAsset(assetPath)) return;

    setProperty(undoManager, mr, 'materialPath', assetPath);

    const mat = await loadMaterialFromPath(assetPath);
    if (mat) {
      if (mr.mesh instanceof THREE.Mesh) {
        mr.mesh.material = mat;
      } else if (mr.mesh instanceof THREE.Group) {
        mr.mesh.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.material = mat;
          }
        });
      }
    }
    update();
  };

  /** Clear a primitive's material override and revert to default */
  const handleClearPrimitiveMaterial = () => {
    setProperty(undoManager, mr, 'materialPath', undefined);
    const defaultMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.1 });
    if (mr.mesh instanceof THREE.Mesh) {
      mr.mesh.material = defaultMat;
    } else if (mr.mesh instanceof THREE.Group) {
      mr.mesh.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.material = defaultMat;
        }
      });
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

      {/* UV Transform — tiling, offset, rotation applied to all texture maps */}
      {mr.mesh && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 600, marginBottom: '4px' }}>
            UV Transform
          </div>
          <PropertyRow label="Tiling">
            <Vector2Input
              value={mr.uvScale}
              step={0.1}
              onChange={(axis, v) => {
                const next = { ...mr.uvScale, [axis]: v };
                setProperty(undoManager, mr, 'uvScale', next);
                applyUvTransform(mr.mesh, next, mr.uvOffset, mr.uvRotation);
                update();
              }}
            />
          </PropertyRow>
          <PropertyRow label="Offset">
            <Vector2Input
              value={mr.uvOffset}
              step={0.05}
              onChange={(axis, v) => {
                const next = { ...mr.uvOffset, [axis]: v };
                setProperty(undoManager, mr, 'uvOffset', next);
                applyUvTransform(mr.mesh, mr.uvScale, next, mr.uvRotation);
                update();
              }}
            />
          </PropertyRow>
          <PropertyRow label="Rotation">
            <NumberInput
              value={parseFloat(mr.uvRotation.toFixed(1))}
              step={1}
              onChange={(v) => {
                setProperty(undoManager, mr, 'uvRotation', v);
                applyUvTransform(mr.mesh, mr.uvScale, mr.uvOffset, v);
                update();
              }}
            />
          </PropertyRow>
        </div>
      )}

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
                        {currentPath ? getFileName(currentPath) : 'Drop material'}
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

      {/* Material drop zone for primitives — same workflow as .fluxmesh */}
      {!isFluxMesh && (
        <div style={{ marginTop: '4px' }}>
          <div style={{
            fontSize: '11px',
            color: 'var(--text)',
            fontWeight: 600,
            marginBottom: '4px',
          }}>
            Material
          </div>
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-fluxion-asset')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'link';
              }
            }}
            onDrop={handlePrimitiveMaterialDrop}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              padding: '3px 6px',
              minHeight: '22px',
              background: mr.materialPath ? 'rgba(255,255,255,0.03)' : 'transparent',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: mr.materialPath ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '10px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
              title={mr.materialPath || ''}
            >
              {mr.materialPath ? getFileName(mr.materialPath) : 'Drop material'}
            </span>
            {mr.materialPath && (
              <button
                onClick={handleClearPrimitiveMaterial}
                title="Clear material"
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
      )}
    </Section>
  );
};
