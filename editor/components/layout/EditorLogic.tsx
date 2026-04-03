// ============================================================
// FluxionJS V2 — Editor Logic Components
// Invisible React components for keyboard, stats, transform sync
// Extracted from EditorLayout for separation of concerns
// ============================================================

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useEditor, useEngine, EditorTool } from '../../core/EditorContext';
import { TransformComponent, CameraComponent, ColliderComponent, LightComponent, AudioSourceComponent, ParticleEmitterComponent } from '../../../src/core/Components';
import { undoManager, TransformCommand, DeleteEntityCommand, DuplicateEntityCommand } from '../../core/UndoService';
import { DebugDraw } from '../../../src/renderer/DebugDraw';
import { GizmoRenderer } from '../../../src/renderer/GizmoRenderer';
import { SettingsRegistry } from '../../core/SettingsRegistry';
import { ParticleRenderSystem } from '../../../src/renderer/ParticleSystem';
import { ScriptSystem } from '../../../src/scripting/ScriptSystem';
import { serializeScene, deserializeScene, SceneFileData } from '../../../src/project/SceneSerializer';
import { ComponentIconSystem } from '../../core/ComponentIconSystem';
import { projectManager } from '../../../src/project/ProjectManager';
import { HotReloadSystem } from '../../core/HotReloadSystem';

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
            if (e.shiftKey) {
              const redoneZ = undoManager.redo();
              if (redoneZ) log(`Redo: ${redoneZ.label}`, 'info');
            } else {
              const undone = undoManager.undo();
              if (undone) log(`Undo: ${undone.label}`, 'info');
            }
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

    let frameCount = 0;
    let prevFps = -1, prevEntities = -1, prevDrawCalls = -1, prevTris = -1;

    const handler = () => {
      // Throttle to ~15 Hz (every 4th frame) — stats display doesn't need 60 Hz
      if ((++frameCount & 3) !== 0) return;

      const info = engine.renderer.renderer.info;
      const fps          = engine.engine.time.smoothFps;
      const entityCount  = engine.engine.ecs.entityCount;
      const drawCalls    = info.render.calls;
      const triangles    = info.render.triangles;

      // Skip dispatch when nothing meaningful changed
      if (fps === prevFps && entityCount === prevEntities &&
          drawCalls === prevDrawCalls && triangles === prevTris) return;

      prevFps = fps; prevEntities = entityCount;
      prevDrawCalls = drawCalls; prevTris = triangles;

      dispatch({
        type: 'UPDATE_STATS',
        stats: {
          fps,
          entityCount,
          frameTime: engine.engine.time.unscaledDeltaTime * 1000,
          drawCalls,
          triangles,
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
        undoManager.pushExternal(cmd);
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
  // Snapshot captured when play starts — restored when play stops (if setting enabled)
  const sceneSnapshot = useRef<SceneFileData | null>(null);

  // Effect 1: handle play START and full STOP (with scene restore)
  useEffect(() => {
    if (!engine) return;

    if (state.isPlaying) {
      // Freeze simulation until we fully start (isPaused handled by effect 2)
      engine.engine.simulationPaused = false;

      // Capture scene state before simulation begins
      if (SettingsRegistry.get<boolean>('editor.playMode.restoreSceneOnStop')) {
        sceneSnapshot.current = serializeScene(engine.scene, engine.engine, engine.editorCamera, engine.orbitControls.target);
      }

      // Switch to first game camera that exists in the scene
      const cameras = engine.engine.ecs.query('Transform', 'Camera');
      if (cameras.length > 0) {
        const camComp = engine.engine.ecs.getComponent<CameraComponent>(cameras[0], 'Camera');
        if (camComp?.camera) {
          engine.renderer.setActiveCamera(camComp.camera as THREE.PerspectiveCamera);
        }
      }
    } else {
      // Full stop — freeze clock first
      engine.engine.simulationPaused = true;

      // Restore editor camera
      engine.renderer.setActiveCamera(engine.editorCamera);

      // Stop all playing audio and reset auto-play tracker
      engine.audio.stopAll(engine.engine.ecs);

      // Clear all live particles
      const particleSys = engine.engine.ecs.getSystem<ParticleRenderSystem>('ParticleRenderer');
      particleSys?.clearAllParticles();

      // Reset scripts: clear coroutines + re-arm onStart() for next play session
      const scriptSys    = engine.engine.ecs.getSystem<ScriptSystem>('ScriptSystem');
      scriptSys?.onSimulationStop();

      // Restore scene to pre-play snapshot
      if (sceneSnapshot.current) {
        void deserializeScene(engine.engine, sceneSnapshot.current, engine.scene);
        sceneSnapshot.current = null;
      }
    }
  }, [engine, state.isPlaying]);

  // Effect 2: handle PAUSE / RESUME — only toggles the sim clock, never restores scene
  useEffect(() => {
    if (!engine || !state.isPlaying) return;
    engine.engine.simulationPaused = state.isPaused;
  }, [engine, state.isPlaying, state.isPaused]);

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
      const isPlaying = !engine.engine.simulationPaused;
      if (isPlaying && !state.debugGroups.drawInPlayMode) return;
      if (!state.debugGroups.camera) return;
      const ecs = engine.engine.ecs;
      const aspect = engine.editorCamera.aspect || 16 / 9;

      for (const [eid, cam] of ecs.getComponentsOfType<CameraComponent>('Camera')) {
        if (!cam.enabled) continue;
        const t = ecs.getComponent<TransformComponent>(eid, 'Transform');
        if (!t) continue;
        GizmoRenderer.drawCameraFrustum(
          t.worldPosition, t.worldRotation,
          cam.fov, cam.near, cam.far, aspect,
          cam.isOrthographic, cam.orthoSize,
          state.selectedEntity === eid,
          engine.editorCamera,
        );
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, state.selectedEntity, state.debugGroups]);

  return null;
};

// ── Unified asset hot-reload ──
// All reload logic lives in HotReloadSystem; this component is the React mount point.
export const AssetHotReload: React.FC = () => {
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    const sys = new HotReloadSystem(engine.engine);
    return sys.attach();
  }, [engine]);

  return null;
};


// ── Collider Gizmo Sync ──
export const ColliderGizmoSync: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    const handler = () => {
      const isPlaying = !engine.engine.simulationPaused;
      if (isPlaying && !state.debugGroups.drawInPlayMode) return;
      if (!state.debugGroups.physics) return;
      const ecs = engine.engine.ecs;
      for (const [eid, col] of ecs.getComponentsOfType<ColliderComponent>('Collider')) {
        if (!col.enabled) continue;
        const t = ecs.getComponent<TransformComponent>(eid, 'Transform');
        if (!t) continue;
        GizmoRenderer.drawColliderGizmo(
          t.position, t.quaternion,
          col.shape, col.size, col.radius, col.height, col.offset,
          col.isTrigger, state.selectedEntity === eid,
        );
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, state.selectedEntity, state.debugGroups]);

  return null;
};

// ── Light Gizmo Sync ──
export const LightGizmoSync: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    const handler = () => {
      const isPlaying = !engine.engine.simulationPaused;
      if (isPlaying && !state.debugGroups.drawInPlayMode) return;
      if (!state.debugGroups.lights) return;
      const ecs = engine.engine.ecs;
      for (const [eid, light] of ecs.getComponentsOfType<LightComponent>('Light')) {
        if (!light.enabled) continue;
        const t = ecs.getComponent<TransformComponent>(eid, 'Transform');
        if (!t) continue;
        GizmoRenderer.drawLightGizmo(
          t.position, t.quaternion,
          light.lightType, light.range, light.spotAngle, light.color,
          state.selectedEntity === eid,
        );
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, state.selectedEntity, state.debugGroups]);

  return null;
};

// ── Audio Source Gizmo Sync ──
export const AudioGizmoSync: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    const handler = () => {
      const isPlaying = !engine.engine.simulationPaused;
      if (isPlaying && !state.debugGroups.drawInPlayMode) return;
      if (!state.debugGroups.audio) return;
      const ecs = engine.engine.ecs;
      for (const [eid, audio] of ecs.getComponentsOfType<AudioSourceComponent>('AudioSource')) {
        if (!audio.enabled) continue;
        const t = ecs.getComponent<TransformComponent>(eid, 'Transform');
        if (!t) continue;
        GizmoRenderer.drawAudioGizmo(
          t.position,
          audio.minDistance, audio.maxDistance, audio.spatial,
          state.selectedEntity === eid,
        );
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, state.selectedEntity, state.debugGroups]);

  return null;
};

// ── Particle Emitter Gizmo Sync ──
export const ParticleGizmoSync: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();

  useEffect(() => {
    if (!engine) return;
    const handler = () => {
      const isPlaying = !engine.engine.simulationPaused;
      if (isPlaying && !state.debugGroups.drawInPlayMode) return;
      if (!state.debugGroups.particles) return;
      const ecs = engine.engine.ecs;
      for (const [eid, emitter] of ecs.getComponentsOfType<ParticleEmitterComponent>('ParticleEmitter')) {
        if (!emitter.enabled) continue;
        const t = ecs.getComponent<TransformComponent>(eid, 'Transform');
        if (!t) continue;
        GizmoRenderer.drawParticleGizmo(
          t.position, t.quaternion, emitter.spread,
          state.selectedEntity === eid,
        );
      }
    };
    engine.engine.events.on('engine:update', handler);
    return () => engine.engine.events.off('engine:update', handler);
  }, [engine, state.selectedEntity, state.debugGroups]);

  return null;
};

// ── Component billboard icon sync ──
export const ComponentIconSync: React.FC = () => {
  const engine = useEngine();
  const systemRef = useRef<ComponentIconSystem | null>(null);

  useEffect(() => {
    if (!engine) return;

    const system = new ComponentIconSystem(engine.renderer.scene);
    systemRef.current = system;

    const handler = () => {
      system.update(
        engine.engine.ecs,
        (id) => engine.renderer.getObject(id),
        engine.editorCamera,
        !engine.engine.simulationPaused,
      );
    };
    engine.engine.events.on('engine:update', handler);

    return () => {
      engine.engine.events.off('engine:update', handler);
      system.dispose();
      systemRef.current = null;
    };
  }, [engine]);

  return null;
};
