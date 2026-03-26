// ============================================================
// FluxionJS V2 — Editor Logic Components
// Invisible React components for keyboard, stats, transform sync
// Extracted from EditorLayout for separation of concerns
// ============================================================

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useEditor, useEngine, EditorTool } from '../../core/EditorContext';
import { TransformComponent, CameraComponent } from '../../../src/core/Components';
import { undoManager, TransformCommand, DeleteEntityCommand, DuplicateEntityCommand } from '../../core/UndoService';
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
              const ecs = engine.engine.ecs;
              undoManager.execute(new DuplicateEntityCommand(
                () => engine.scene.cloneEntity(state.selectedEntity!),
                ecs,
                (clone) => {
                  log(`Duplicated: ${ecs.getEntityName(clone)}`, 'info');
                  dispatch({ type: 'SELECT_ENTITY', entity: clone });
                  dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
                },
              ));
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
            const target = state.selectedEntity;
            const name = engine.engine.ecs.getEntityName(target);
            undoManager.execute(new DeleteEntityCommand(
              target,
              engine.engine.ecs,
              engine.engine,
              (newId) => {
                dispatch({ type: 'SELECT_ENTITY', entity: newId });
                dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
              },
            ));
            dispatch({ type: 'SELECT_ENTITY', entity: null });
            dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
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
          engine.editorCamera,
        );
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, state.selectedEntity]);

  return null;
};

// ── Unified asset hot-reload: materials, textures, fonts, models, audio ──
// Listens to both 'fluxion:material-changed' (editor UI saves) and
// 'fluxion:asset-changed' (FileWatcher detections) with dedup.
export const AssetHotReload: React.FC = () => {
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;

    // Dedup map: path → timestamp of last reload (prevents double-fire within 500ms)
    const recentReloads = new Map<string, number>();
    const DEDUP_MS = 500;

    const isDuplicate = (path: string): boolean => {
      const now = Date.now();
      const last = recentReloads.get(path);
      if (last && now - last < DEDUP_MS) return true;
      recentReloads.set(path, now);
      // Housekeep old entries
      if (recentReloads.size > 100) {
        for (const [k, v] of recentReloads) {
          if (now - v > DEDUP_MS * 2) recentReloads.delete(k);
        }
      }
      return false;
    };

    // ── Helpers shared across handlers ──

    /** Normalize path to forward slashes for reliable comparison. */
    const norm = (p: string) => p.replace(/\\/g, '/');

    const getSubsystems = () => {
      const ecs = engine.engine.ecs;
      const assets = engine.engine.getSubsystem('assets') as any;
      const materials = engine.engine.getSubsystem('materials') as any;
      const renderer = engine.engine.getSubsystem('renderer') as any;
      return { ecs, assets, materials, renderer };
    };

    const resolveRelPath = async (absPath: string): Promise<string | null> => {
      try {
        const { projectManager } = await import('../../../src/project/ProjectManager');
        return projectManager.relativePath(absPath);
      } catch { return null; }
    };

    const buildLoadTexture = (matDir: string, assets: any) => {
      return async (texRelPath: string): Promise<THREE.Texture> => {
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
    };

    // ── Material reload logic (unchanged from MaterialSync) ──

    const reloadMaterial = async (changedPath: string) => {
      const { ecs, assets, materials } = getSubsystems();
      if (!assets || !materials) return;

      const nChanged = norm(changedPath);
      const isVisualMat = nChanged.endsWith('.fluxvismat');
      assets.invalidateCache(changedPath);
      if (nChanged !== changedPath) assets.invalidateCache(nChanged);

      const relPath = await resolveRelPath(changedPath);
      const nRel = relPath ? norm(relPath) : null;
      const matDir = nChanged.substring(0, nChanged.lastIndexOf('/'));
      const loadTexture = buildLoadTexture(matDir, assets);

      const createMaterial = async (): Promise<THREE.Material | null> => {
        try {
          if (isVisualMat) {
            const visData = await assets.loadAsset(nChanged, 'visual_material');
            if (!visData) return null;
            return materials.createFromVisualMat(visData, loadTexture, nChanged);
          } else {
            const matData = await assets.loadAsset(nChanged, 'material');
            if (!matData) return null;
            return materials.createFromFluxMat(matData, loadTexture, nChanged);
          }
        } catch { return null; }
      };

      const allMR = ecs.getComponentsOfType<any>('MeshRenderer');
      for (const [, mr] of allMR) {
        if (!mr.mesh) continue;

        const mrMatPath = mr.materialPath;
        const nMrMat = mrMatPath ? norm(mrMatPath) : null;
        if (nMrMat && (nMrMat === nChanged || nMrMat === nRel)) {
          const mat = await createMaterial();
          if (mat) {
            if (mr.mesh instanceof THREE.Mesh) {
              mr.mesh.material = mat;
            } else if (mr.mesh instanceof THREE.Group) {
              mr.mesh.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh) child.material = mat;
              });
            }
          }
          continue;
        }

        if (!mr.modelPath?.toLowerCase().endsWith('.fluxmesh') || !mr.mesh) continue;

        const slotsToUpdate: number[] = [];
        let fluxSlots: any[] | null = null;

        try {
          const { projectManager } = await import('../../../src/project/ProjectManager');
          const { getFileSystem } = await import('../../../src/filesystem');
          const fs = getFileSystem();
          const absFluxmesh = norm(projectManager.resolvePath(mr.modelPath));
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

        const overrides = mr.materialSlots || [];
        for (let idx = 0; idx < fluxSlots.length; idx++) {
          const override = overrides.find((o: any) => o.slotIndex === idx);
          if (override) {
            const oPath = norm(override.materialPath || '');
            let oAbs: string | null = null;
            try {
              const { projectManager: pm } = await import('../../../src/project/ProjectManager');
              oAbs = norm(pm.resolvePath(override.materialPath));
            } catch {}
            if (oPath === nChanged || oPath === nRel || oAbs === nChanged) slotsToUpdate.push(idx);
          } else {
            const defMat = norm(fluxSlots[idx].defaultMaterial || '');
            if (defMat === nChanged || defMat === nRel) slotsToUpdate.push(idx);
          }
        }

        if (slotsToUpdate.length === 0) continue;

        const mat = await createMaterial();
        if (mat) {
          const { applyMaterialsToModel } = await import('../../../src/assets/FluxMeshData');
          for (const slotIdx of slotsToUpdate) {
            const slot = fluxSlots[slotIdx];
            if (slot) applyMaterialsToModel(mr.mesh, [slot], [mat]);
          }
        }
      }
    };

    // ── Texture reload: sprites, cookie lights, environment ──

    const reloadTexture = async (changedPath: string) => {
      const { ecs, assets } = getSubsystems();
      if (!assets) return;

      const nChanged = norm(changedPath);
      assets.invalidateCache(changedPath);
      const relPath = await resolveRelPath(changedPath);
      const nRel = relPath ? norm(relPath) : null;

      const pathEq = (p: string | undefined) => {
        if (!p) return false;
        const np = norm(p);
        return np === nChanged || np === nRel;
      };

      // Sprites — null out spriteTexture so renderer re-loads next frame
      const sprites = ecs.getComponentsOfType<any>('Sprite');
      for (const [, sprite] of sprites) {
        if (pathEq(sprite.texturePath)) {
          if (sprite.spriteTexture) {
            sprite.spriteTexture.dispose();
            sprite.spriteTexture = null;
          }
        }
      }

      // Lights — null out cookie texture so LightSystem re-loads
      const lights = ecs.getComponentsOfType<any>('Light');
      for (const [, light] of lights) {
        if (pathEq(light.cookieTexturePath)) {
          if (light.cookieTexture) {
            light.cookieTexture.dispose();
            light.cookieTexture = null;
          }
          if (light.light instanceof THREE.SpotLight) {
            light.light.map = null;
          }
        }
      }

      // Environment skybox — mark for re-apply by clearing the internal skybox texture
      const envs = ecs.getComponentsOfType<any>('Environment');
      for (const [, env] of envs) {
        if (pathEq(env.skyboxPath) || (env.skyboxFaces && env.skyboxFaces.some(pathEq))) {
          env._appliedSkybox = null; // forces EnvironmentSystem to re-apply
        }
      }

      // MeshRenderer materials that reference this texture — force material re-build
      // We iterate MeshRenderers and check if any materialPath points to a .fluxmat/.fluxvismat
      // that might use this texture. Since we can't cheaply inspect material internals,
      // we trigger a material-changed event for each material path to rebuild.
      const reloadedMats = new Set<string>();
      const allMR = ecs.getComponentsOfType<any>('MeshRenderer');
      for (const [, mr] of allMR) {
        if (!mr.mesh) continue;
        // Check if any mesh material references the changed texture
        let hasTexRef = false;
        const checkMat = (mat: THREE.Material) => {
          if (hasTexRef) return;
          const m = mat as any;
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap', 'alphaMap']) {
            const tex = m[key] as THREE.Texture | null;
            if (tex && tex.image?.src) {
              const src = decodeURIComponent(tex.image.src.replace('file:///', '').replace(/\\/g, '/'));
              if (src === nChanged || src === nRel) {
                hasTexRef = true;
                return;
              }
            }
          }
        };
        if (mr.mesh instanceof THREE.Mesh && mr.mesh.material) {
          const mats = Array.isArray(mr.mesh.material) ? mr.mesh.material : [mr.mesh.material];
          mats.forEach(checkMat);
        } else if (mr.mesh instanceof THREE.Group) {
          mr.mesh.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach(checkMat);
            }
          });
        }
        if (hasTexRef && mr.materialPath && !reloadedMats.has(mr.materialPath)) {
          reloadedMats.add(mr.materialPath);
          await reloadMaterial(mr.materialPath);
        }
      }
    };

    // ── Font reload: clear fontCache, force text rebuild ──

    const reloadFont = async (changedPath: string) => {
      const { ecs, renderer } = getSubsystems();
      if (!renderer) return;

      const nChanged = norm(changedPath);
      const relPath = await resolveRelPath(changedPath);
      const nRel = relPath ? norm(relPath) : null;

      // Access the TextRendererSystem's fontCache and loading set via the renderer
      const textSystem = renderer.systems?.find?.((s: any) => s.name === 'TextRendererSync');
      if (textSystem) {
        // Delete cached font so it re-loads
        textSystem.fontCache?.delete?.(changedPath);
        textSystem.fontCache?.delete?.(relPath);
        textSystem.loadingFonts?.delete?.(changedPath);
        textSystem.loadingFonts?.delete?.(relPath);
      }

      // Force rebuild on all TextRenderers using this font
      const textComps = ecs.getComponentsOfType<any>('TextRenderer');
      for (const [, tc] of textComps) {
        const nFont = tc.fontPath ? norm(tc.fontPath) : null;
        if (nFont && (nFont === nChanged || nFont === nRel)) {
          tc._cacheKey = '';
        }
      }
    };

    // ── Model / mesh reload: cache invalidation only ──
    // MeshRendererSystem does NOT re-create meshes when mr.mesh is null,
    // so we must not destroy existing meshes. Just invalidate the cache
    // so the next scene load picks up the changes.

    const reloadModel = async (changedPath: string) => {
      const { assets } = getSubsystems();
      if (!assets) return;
      assets.invalidateCache(changedPath);
    };

    // ── Audio reload: invalidate cache only ──

    const reloadAudio = async (changedPath: string) => {
      const { assets } = getSubsystems();
      if (!assets) return;
      assets.invalidateCache(changedPath);
    };

    // ── Main handler for 'fluxion:material-changed' (editor UI saves) ──

    const materialChangedHandler = async (e: Event) => {
      const changedPath = (e as CustomEvent).detail?.path as string | undefined;
      if (!changedPath) return;
      if (isDuplicate(changedPath)) return;
      await reloadMaterial(changedPath);
    };

    // ── Main handler for 'fluxion:asset-changed' (file watcher) ──

    const assetChangedHandler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.path) return;
      const { path, assetType, eventType } = detail as { path: string; assetType: string; eventType: string };
      // Skip delete events — no point reloading a deleted asset
      if (eventType === 'delete') return;
      if (isDuplicate(path)) return;

      switch (assetType) {
        case 'material':
        case 'visual_material':
          await reloadMaterial(path);
          break;
        case 'texture':
          await reloadTexture(path);
          break;
        case 'font':
          await reloadFont(path);
          break;
        case 'model':
        case 'mesh':
          await reloadModel(path);
          break;
        case 'audio':
          await reloadAudio(path);
          break;
        // shader, scene, json, prefab — no live reload needed
      }
    };

    window.addEventListener('fluxion:material-changed', materialChangedHandler);
    window.addEventListener('fluxion:asset-changed', assetChangedHandler);
    return () => {
      window.removeEventListener('fluxion:material-changed', materialChangedHandler);
      window.removeEventListener('fluxion:asset-changed', assetChangedHandler);
    };
  }, [engine]);

  return null;
};
