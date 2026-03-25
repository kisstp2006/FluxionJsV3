// ============================================================
// FluxionJS V2 — Editor Logic Components
// Invisible React components for keyboard, stats, transform sync
// Extracted from EditorLayout for separation of concerns
// ============================================================

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useEditor, useEngine, EditorTool } from '../../core/EditorContext';
import { TransformComponent, CameraComponent } from '../../../src/core/Components';
import { undoManager, TransformCommand } from '../../core/UndoService';
import { DebugDraw } from '../../../src/renderer/DebugDraw';
import { GizmoRenderer } from '../../../src/renderer/GizmoRenderer';
import { SettingsRegistry } from '../../core/SettingsRegistry';

// ── Keyboard shortcut handler ──
export const KeyboardHandler: React.FC = () => {
  const { state, dispatch, log } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if ((e.target as HTMLElement)?.tagName === 'INPUT' ||
          (e.target as HTMLElement)?.tagName === 'TEXTAREA' ||
          (e.target as HTMLElement)?.tagName === 'SELECT') return;

      // Ctrl shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.code) {
          case 'KeyZ':
            e.preventDefault();
            const undone = undoManager.undo();
            if (undone) log(`Undo: ${undone.label}`, 'info');
            return;
          case 'KeyY':
            e.preventDefault();
            const redone = undoManager.redo();
            if (redone) log(`Redo: ${redone.label}`, 'info');
            return;
          case 'KeyC':
            e.preventDefault();
            if (state.selectedEntity !== null) {
              dispatch({ type: 'SET_CLIPBOARD', entity: state.selectedEntity });
              log(`Copied: ${engine?.engine.ecs.getEntityName(state.selectedEntity) ?? state.selectedEntity}`, 'info');
            }
            return;
          case 'KeyV':
            e.preventDefault();
            if (engine && state.clipboard !== null) {
              const clone = engine.scene.cloneEntity(state.clipboard);
              if (clone !== null) {
                log(`Pasted: ${engine.engine.ecs.getEntityName(clone)}`, 'info');
                dispatch({ type: 'SELECT_ENTITY', entity: clone });
                dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
              }
            }
            return;
          case 'KeyD':
            e.preventDefault();
            if (engine && state.selectedEntity !== null) {
              const clone = engine.scene.cloneEntity(state.selectedEntity);
              if (clone !== null) {
                log(`Duplicated: ${engine.engine.ecs.getEntityName(clone)}`, 'info');
                dispatch({ type: 'SELECT_ENTITY', entity: clone });
                dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
              }
            }
            return;
          case 'KeyS':
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('fluxion:save-scene'));
            return;
        }
      }

      const toolMap: Record<string, EditorTool> = {
        KeyQ: 'select',
        KeyW: 'move',
        KeyE: 'rotate',
        KeyR: 'scale',
      };

      if (toolMap[e.code]) {
        dispatch({ type: 'SET_TOOL', tool: toolMap[e.code] });
        return;
      }

      switch (e.code) {
        case 'Delete':
          if (engine && state.selectedEntity !== null) {
            const name = engine.engine.ecs.getEntityName(state.selectedEntity);
            engine.engine.ecs.destroyEntity(state.selectedEntity);
            dispatch({ type: 'SELECT_ENTITY', entity: null });
            log(`Deleted entity: ${name}`, 'warn');
          }
          break;
        case 'KeyF':
          if (engine && state.selectedEntity !== null) {
            const t = engine.engine.ecs.getComponent<TransformComponent>(state.selectedEntity, 'Transform');
            if (t) {
              engine.orbitControls.target.copy(t.position);
              const dir = engine.editorCamera.position.clone().sub(t.position).normalize();
              engine.editorCamera.position.copy(t.position).addScaledVector(dir, 10);
              engine.orbitControls.update();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [engine, state.selectedEntity, state.clipboard, dispatch, log]);

  return null;
};

// ── Stats updater ──
export const StatsUpdater: React.FC = () => {
  const { dispatch } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;

    const handler = () => {
      const info = engine.renderer.renderer.info;
      dispatch({
        type: 'UPDATE_STATS',
        stats: {
          fps: engine.engine.time.smoothFps,
          entityCount: [...engine.engine.ecs.getAllEntities()].length,
          frameTime: engine.engine.time.unscaledDeltaTime * 1000,
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          textures: info.memory.textures,
          geometries: info.memory.geometries,
        },
      });
    };

    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, dispatch]);

  return null;
};

// ── Transform controls sync back to ECS with undo support ──
export const TransformSync: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();
  const dragStartRef = useRef<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!engine) return;

    const onDragStart = () => {
      if (state.selectedEntity === null) return;
      const transform = engine.engine.ecs.getComponent<TransformComponent>(
        state.selectedEntity,
        'Transform'
      );
      if (transform) {
        dragStartRef.current = {
          position: transform.position.clone(),
          rotation: transform.rotation.clone(),
          scale: transform.scale.clone(),
        };
      }
    };

    const onDragEnd = () => {
      if (state.selectedEntity === null || !dragStartRef.current) return;
      const transform = engine.engine.ecs.getComponent<TransformComponent>(
        state.selectedEntity,
        'Transform'
      );
      if (transform) {
        const cmd = new TransformCommand(
          state.selectedEntity,
          engine.engine.ecs,
          dragStartRef.current,
          {
            position: transform.position.clone(),
            rotation: transform.rotation.clone(),
            scale: transform.scale.clone(),
          }
        );
        (undoManager as any).undoStack.push(cmd);
        (undoManager as any).redoStack.length = 0;
      }
      dragStartRef.current = null;
    };

    const handler = () => {
      if (state.selectedEntity === null) return;
      const transform = engine.engine.ecs.getComponent<TransformComponent>(
        state.selectedEntity,
        'Transform'
      );
      const obj = engine.gizmoService.object;
      if (transform && obj) {
        transform.position.copy(obj.position);
        transform.quaternion.copy(obj.quaternion);
        transform.rotation.setFromQuaternion(obj.quaternion);
        transform.scale.copy(obj.scale);
      }
    };

    engine.gizmoService.addEventListener('mouseDown', onDragStart);
    engine.gizmoService.addEventListener('mouseUp', onDragEnd);
    engine.gizmoService.addEventListener('objectChange', handler);
    return () => {
      engine.gizmoService.removeEventListener('mouseDown', onDragStart);
      engine.gizmoService.removeEventListener('mouseUp', onDragEnd);
      engine.gizmoService.removeEventListener('objectChange', handler);
    };
  }, [engine, state.selectedEntity]);

  return null;
};

// ── Simulation play/pause sync ──
export const SimulationSync: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    engine.engine.simulationPaused = !state.isPlaying;
    // Restore editor camera when simulation stops
    if (!state.isPlaying) {
      engine.renderer.setActiveCamera(engine.editorCamera);
    }
  }, [engine, state.isPlaying]);

  return null;
};

// ── Grid drawing via DebugDraw (replaces THREE.GridHelper) ──
export const GridSync: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    const handler = () => {
      if (state.showGrid) {
        const gridSize = SettingsRegistry.get<number>('editor.viewport.gridSize');
        DebugDraw.drawGrid(gridSize, gridSize);
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, state.showGrid]);

  return null;
};

// ── Gizmo rendering per frame via DebugDraw ──
export const GizmoSync: React.FC = () => {
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    const handler = () => engine.gizmoService.render();
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine]);

  return null;
};

// ── Camera frustum visualization per frame ──
export const CameraGizmoSync: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    const handler = () => {
      const ecs = engine.engine.ecs;
      const allEntities = ecs.getAllEntities();
      const aspect = engine.editorCamera.aspect || 16 / 9;

      for (const eid of allEntities) {
        const cam = ecs.getComponent<CameraComponent>(eid, 'Camera');
        if (!cam || !cam.enabled) continue;

        const t = ecs.getComponent<TransformComponent>(eid, 'Transform');
        if (!t) continue;

        const isSelected = state.selectedEntity === eid;

        GizmoRenderer.drawCameraFrustum(
          t.position,
          t.quaternion,
          cam.fov,
          cam.near,
          cam.far,
          aspect,
          cam.isOrthographic,
          cam.orthoSize,
          isSelected,
        );
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, state.selectedEntity]);

  return null;
};

// ── Live material re-application when .fluxmat files change ──
export const MaterialSync: React.FC = () => {
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;

    const handler = async (e: Event) => {
      const changedPath = (e as CustomEvent).detail?.path as string | undefined;
      if (!changedPath) return;

      const ecs = engine.engine.ecs;
      const assets = engine.engine.getSubsystem('assets') as any;
      const materials = engine.engine.getSubsystem('materials') as any;
      if (!assets || !materials) return;

      // Invalidate the cached material so loadAsset re-reads from disk
      assets.invalidateCache(changedPath);

      // Derive project-relative path for comparison with component fields
      let relPath: string | null = null;
      try {
        const { projectManager } = await import('../../../src/project/ProjectManager');
        relPath = projectManager.relativePath(changedPath);
      } catch { /* ignore */ }

      // Re-load the updated material data from disk
      let matData: any;
      try {
        matData = await assets.loadAsset(changedPath, 'material');
      } catch { return; }
      if (!matData) return;

      // Build a loadTexture that resolves relative to the .fluxmat directory, with project-relative fallback
      const matDir = changedPath.substring(0, changedPath.lastIndexOf('/'));
      const loadTexture = async (texRelPath: string): Promise<THREE.Texture> => {
        let texAbsPath: string;
        if (/^[A-Z]:/i.test(texRelPath) || texRelPath.startsWith('/') || texRelPath.startsWith('file://')) {
          texAbsPath = texRelPath;
        } else {
          texAbsPath = `${matDir}/${texRelPath}`;
          try {
            const { projectManager: pm } = await import('../../../src/project/ProjectManager');
            const { getFileSystem: getFs } = await import('../../../src/filesystem');
            const projResolved = pm.resolvePath(texRelPath);
            if (!(await getFs().exists(texAbsPath)) && await getFs().exists(projResolved)) texAbsPath = projResolved;
          } catch {}
        }
        const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
        return assets.loadTexture(texUrl);
      };

      // Iterate all MeshRenderers and re-apply where this material is referenced
      const allMR = ecs.getComponentsOfType<any>('MeshRenderer');
      for (const [, mr] of allMR) {
        if (!mr.mesh) continue;

        // Case 1: single materialPath matches
        const mrMatPath = mr.materialPath;
        if (mrMatPath && (mrMatPath === changedPath || mrMatPath === relPath)) {
          try {
            const mat = await materials.createFromFluxMat(matData, loadTexture, changedPath);
            if (mr.mesh instanceof THREE.Mesh) {
              mr.mesh.material = mat;
            } else if (mr.mesh instanceof THREE.Group) {
              mr.mesh.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh) child.material = mat;
              });
            }
          } catch { /* skip */ }
          continue;
        }

        // Case 2: .fluxmesh with materialSlots — check slot overrides and defaults
        if (!mr.modelPath?.endsWith('.fluxmesh') || !mr.mesh) continue;

        // Gather which slot indices reference the changed material
        const slotsToUpdate: number[] = [];
        let fluxSlots: any[] | null = null;

        try {
          const { projectManager } = await import('../../../src/project/ProjectManager');
          const { getFileSystem } = await import('../../../src/filesystem');
          const fs = getFileSystem();
          const absFluxmesh = projectManager.resolvePath(mr.modelPath);
          const fluxmeshDir = absFluxmesh.substring(0, absFluxmesh.lastIndexOf('/'));
          const text = await fs.readFile(absFluxmesh);
          const data = JSON.parse(text);
          fluxSlots = (data.materialSlots || []).map((s: any) => ({
            ...s,
            defaultMaterial: s.defaultMaterial && !/^[A-Z]:/i.test(s.defaultMaterial) && !s.defaultMaterial.startsWith('/')
              ? `${fluxmeshDir}/${s.defaultMaterial}`
              : s.defaultMaterial,
          }));
        } catch { continue; }

        if (!fluxSlots) continue;

        // Check overrides
        const overrides = mr.materialSlots || [];
        for (let idx = 0; idx < fluxSlots.length; idx++) {
          const override = overrides.find((o: any) => o.slotIndex === idx);
          if (override) {
            const oPath = override.materialPath;
            if (oPath === changedPath || oPath === relPath) {
              slotsToUpdate.push(idx);
            }
          } else {
            // Default material
            const defMat = fluxSlots[idx].defaultMaterial;
            if (defMat === changedPath || defMat === relPath) {
              slotsToUpdate.push(idx);
            }
          }
        }

        if (slotsToUpdate.length === 0) continue;

        // Re-create the material and apply to matching sub-meshes
        try {
          const { applyMaterialsToModel } = await import('../../../src/assets/FluxMeshData');
          const mat = await materials.createFromFluxMat(matData, loadTexture, changedPath);
          for (const slotIdx of slotsToUpdate) {
            const slot = fluxSlots[slotIdx];
            if (slot) {
              applyMaterialsToModel(mr.mesh, [slot], [mat]);
            }
          }
        } catch { /* skip */ }
      }
    };

    window.addEventListener('fluxion:material-changed', handler);
    return () => window.removeEventListener('fluxion:material-changed', handler);
  }, [engine]);

  return null;
};
