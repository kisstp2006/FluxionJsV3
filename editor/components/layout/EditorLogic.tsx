// ============================================================
// FluxionJS V2 — Editor Logic Components
// Invisible React components for keyboard, stats, transform sync
// Extracted from EditorLayout for separation of concerns
// ============================================================

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useEditor, useEngine, EditorTool } from '../../core/EditorContext';
import { TransformComponent } from '../../../src/core/Components';
import { undoManager, TransformCommand } from '../../core/UndoService';
import { DebugDraw } from '../../../src/renderer/DebugDraw';

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
          case 'KeyD':
            e.preventDefault();
            if (engine && state.selectedEntity !== null) {
              const clone = engine.scene.cloneEntity(state.selectedEntity);
              if (clone !== null) {
                log(`Duplicated: ${engine.engine.ecs.getEntityName(clone)}`, 'info');
                dispatch({ type: 'SELECT_ENTITY', entity: clone });
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
  }, [engine, state.selectedEntity, dispatch, log]);

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
        DebugDraw.drawGrid(100, 100);
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
