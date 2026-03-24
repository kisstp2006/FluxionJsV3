// ============================================================
// FluxionJS V2 — Viewport Component
// 3D viewport with camera controls, selection, gizmo overlay
// ============================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { TabBar, ContextMenu, Icons } from '../../ui';
import { useEditor, useEngine } from '../../core/EditorContext';

export interface ViewportProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const Viewport: React.FC<ViewportProps> = ({ onCanvasReady }) => {
  const { state, dispatch, log } = useEditor();
  const engine = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [vpContextMenu, setVpContextMenu] = useState<{ pos: { x: number; y: number }; worldPos?: THREE.Vector3 } | null>(null);
  const [dragDelta, setDragDelta] = useState<string | null>(null);
  const dragStartPosRef = useRef<THREE.Vector3 | null>(null);

  // Report canvas to parent for engine initialization
  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = node;
    if (node && onCanvasReady) {
      onCanvasReady(node);
    }
  }, [onCanvasReady]);

  // Raycaster pick
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!engine || !canvasRef.current) return;
    if (engine.gizmoService.isDragging) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, engine.editorCamera);
    const intersects = raycaster.intersectObjects(engine.renderer.scene.children, true);

    for (const hit of intersects) {
      if (hit.object.type === 'LineSegments') continue;

      const entity = engine.renderer.getEntity(hit.object) ??
        (hit.object.parent ? engine.renderer.getEntity(hit.object.parent) : undefined);
      if (entity !== undefined) {
        dispatch({ type: 'SELECT_ENTITY', entity });
        return;
      }
    }

    dispatch({ type: 'SELECT_ENTITY', entity: null });
  }, [engine, dispatch]);

  // Resize
  useEffect(() => {
    if (!containerRef.current || !engine) return;

    const observer = new ResizeObserver(() => {
      const rect = containerRef.current!.getBoundingClientRect();
      engine.engine.resize(rect.width, rect.height);
      engine.editorCamera.aspect = rect.width / rect.height;
      engine.editorCamera.updateProjectionMatrix();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [engine]);

  // Sync transform controls and selection outline with selection
  useEffect(() => {
    if (!engine) return;
    if (state.selectedEntity !== null) {
      const obj = engine.renderer.getObject(state.selectedEntity);
      if (obj) {
        engine.gizmoService.attach(obj);
        engine.selectionOutline.setFromObject(obj);
        engine.selectionOutline.visible = true;
      } else {
        engine.gizmoService.detach();
        engine.selectionOutline.visible = false;
      }
    } else {
      engine.gizmoService.detach();
      engine.selectionOutline.visible = false;
    }
  }, [engine, state.selectedEntity]);

  // Keep selection outline in sync with transforms each frame
  useEffect(() => {
    if (!engine) return;
    const updateOutline = () => {
      if (state.selectedEntity !== null && engine.selectionOutline.visible) {
        const obj = engine.renderer.getObject(state.selectedEntity);
        if (obj) engine.selectionOutline.update();
      }
    };
    engine.engine.events.on('engine:update', updateOutline);
    return () => engine.engine.events.off('engine:update', updateOutline);
  }, [engine, state.selectedEntity]);

  // Sync tool mode
  useEffect(() => {
    if (!engine) return;
    const toolMap: Record<string, 'translate' | 'rotate' | 'scale'> = {
      select: 'translate',
      move: 'translate',
      rotate: 'rotate',
      scale: 'scale',
    };
    if (toolMap[state.activeTool]) {
      engine.gizmoService.setMode(toolMap[state.activeTool]);
    }
  }, [engine, state.activeTool]);

  // Sync transform space
  useEffect(() => {
    if (!engine) return;
    engine.gizmoService.setSpace(state.transformSpace);
  }, [engine, state.transformSpace]);

  // Sync snap settings
  useEffect(() => {
    if (!engine) return;
    if (state.snapEnabled) {
      engine.gizmoService.setTranslationSnap(state.snapConfig.translationSnap);
      engine.gizmoService.setRotationSnap(state.snapConfig.rotationSnap);
      engine.gizmoService.setScaleSnap(state.snapConfig.scaleSnap);
    } else {
      engine.gizmoService.setTranslationSnap(null);
      engine.gizmoService.setRotationSnap(null);
      engine.gizmoService.setScaleSnap(null);
    }
  }, [engine, state.snapEnabled, state.snapConfig]);

  // Drag delta display for gizmo
  useEffect(() => {
    if (!engine) return;
    const gs = engine.gizmoService;

    const onDragStart = () => {
      const obj = gs.object;
      if (obj) dragStartPosRef.current = obj.position.clone();
    };
    const onDragEnd = () => {
      dragStartPosRef.current = null;
      setDragDelta(null);
    };
    const onChange = () => {
      const obj = gs.object;
      if (!obj || !dragStartPosRef.current) return;
      const mode = gs.getMode();
      if (mode === 'translate') {
        const d = obj.position.clone().sub(dragStartPosRef.current);
        setDragDelta(`X:${d.x >= 0 ? '+' : ''}${d.x.toFixed(2)}  Y:${d.y >= 0 ? '+' : ''}${d.y.toFixed(2)}  Z:${d.z >= 0 ? '+' : ''}${d.z.toFixed(2)}`);
      } else if (mode === 'rotate') {
        setDragDelta(`Rotating...`);
      } else if (mode === 'scale') {
        const s = obj.scale;
        setDragDelta(`S: ${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)}`);
      }
    };

    gs.addEventListener('mouseDown', onDragStart);
    gs.addEventListener('mouseUp', onDragEnd);
    gs.addEventListener('objectChange', onChange);
    return () => {
      gs.removeEventListener('mouseDown', onDragStart);
      gs.removeEventListener('mouseUp', onDragEnd);
      gs.removeEventListener('objectChange', onChange);
    };
  }, [engine]);

  // Sync viewport shading mode
  useEffect(() => {
    if (!engine) return;
    const scene = engine.renderer.scene;
    scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material;
        if (!mat) return;
        const materials = Array.isArray(mat) ? mat : [mat];
        for (const m of materials) {
          if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
            m.wireframe = state.viewportShading === 'wireframe';
            // For unlit, we use emissive override trick — store original if needed
            if (state.viewportShading === 'unlit') {
              (m as any)._origEnvMapIntensity = (m as any)._origEnvMapIntensity ?? m.envMapIntensity;
              m.envMapIntensity = 0;
              // Boost emissive slightly so objects are visible
            } else if ((m as any)._origEnvMapIntensity !== undefined) {
              m.envMapIntensity = (m as any)._origEnvMapIntensity;
            }
          }
        }
      }
    });
    // Toggle scene lights for unlit
    scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Light && !(obj instanceof THREE.AmbientLight)) {
        if (state.viewportShading === 'unlit') {
          (obj as any)._origVisible = (obj as any)._origVisible ?? obj.visible;
          obj.visible = false;
        } else if ((obj as any)._origVisible !== undefined) {
          obj.visible = (obj as any)._origVisible;
        }
      }
      // Ensure ambient light for unlit
      if (obj instanceof THREE.AmbientLight) {
        if (state.viewportShading === 'unlit') {
          (obj as any)._origIntensity = (obj as any)._origIntensity ?? obj.intensity;
          obj.intensity = 2;
        } else if ((obj as any)._origIntensity !== undefined) {
          obj.intensity = (obj as any)._origIntensity;
        }
      }
    });
  }, [engine, state.viewportShading]);

  // Camera preset view helper
  const setCameraView = useCallback((direction: 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left') => {
    if (!engine) return;
    const cam = engine.editorCamera;
    const target = engine.orbitControls.target.clone();
    const dist = cam.position.distanceTo(target);

    const offsets: Record<string, THREE.Vector3> = {
      top: new THREE.Vector3(0, dist, 0),
      bottom: new THREE.Vector3(0, -dist, 0),
      front: new THREE.Vector3(0, 0, dist),
      back: new THREE.Vector3(0, 0, -dist),
      right: new THREE.Vector3(dist, 0, 0),
      left: new THREE.Vector3(-dist, 0, 0),
    };

    cam.position.copy(target).add(offsets[direction]);
    cam.lookAt(target);
    engine.orbitControls.update();
  }, [engine]);

  // Right-click context menu on viewport
  const handleRightClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!engine || !canvasRef.current) return;

    // Raycast to find world position for "Add entity at position"
    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, engine.editorCamera);
    const intersects = raycaster.intersectObjects(engine.renderer.scene.children, true);

    let worldPos = new THREE.Vector3(0, 0, 0);
    for (const hit of intersects) {
      if (hit.object.type === 'LineSegments') continue;
      worldPos = hit.point.clone();
      break;
    }

    setVpContextMenu({ pos: { x: e.clientX, y: e.clientY }, worldPos });
  }, [engine]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Viewport Tabs */}
      <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 5 }}>
        <TabBar
          tabs={['Scene', 'Game']}
          activeTab={state.viewportTab}
          onTabChange={(tab) => dispatch({ type: 'SET_VIEWPORT_TAB', tab: tab as 'Scene' | 'Game' })}
        />
      </div>

      {/* Camera preset buttons */}
      <div style={{
        position: 'absolute',
        top: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 5,
        display: 'flex',
        gap: '2px',
        background: 'rgba(13,17,23,0.7)',
        borderRadius: '4px',
        padding: '2px',
      }}>
        {(['top', 'front', 'right'] as const).map((dir) => (
          <button
            key={dir}
            onClick={() => setCameraView(dir)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '2px',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            {dir}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <canvas
        ref={setCanvasRef}
        id="viewport-canvas"
        onClick={handleClick}
        onContextMenu={handleRightClick}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Viewport Stats Overlay */}
      <div style={{
        position: 'absolute',
        bottom: '8px',
        left: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
        background: 'rgba(13,17,23,0.6)',
        padding: '4px 8px',
        borderRadius: '4px',
        pointerEvents: 'none',
      }}>
        <span style={{ color: state.fps >= 30 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {state.fps} FPS ({state.frameTime.toFixed(1)}ms)
        </span>
        <span>{state.drawCalls} draw calls</span>
        <span>{state.triangles.toLocaleString()} tris</span>
        <span>{state.entityCount} entities</span>
      </div>

      {/* Gizmo Axis Overlay */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        gap: '6px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 700,
        pointerEvents: 'none',
      }}>
        <span style={{
          padding: '2px 6px',
          borderRadius: '3px',
          background: 'rgba(248, 81, 73, 0.2)',
          color: 'var(--axis-x)',
        }}>X</span>
        <span style={{
          padding: '2px 6px',
          borderRadius: '3px',
          background: 'rgba(63, 185, 80, 0.2)',
          color: 'var(--axis-y)',
        }}>Y</span>
        <span style={{
          padding: '2px 6px',
          borderRadius: '3px',
          background: 'rgba(88, 166, 255, 0.2)',
          color: 'var(--axis-z)',
        }}>Z</span>
      </div>

      {/* Drag Delta Overlay */}
      {dragDelta && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(13,17,23,0.85)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '4px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--accent-blue)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {dragDelta}
        </div>
      )}

      {/* Viewport Right-Click Context Menu */}
      {vpContextMenu && engine && (
        <ContextMenu
          position={vpContextMenu.pos}
          onClose={() => setVpContextMenu(null)}
          items={[
            {
              label: 'Add Empty at Position',
              icon: Icons.entity,
              onClick: () => {
                const e = engine.scene.createEmpty('Empty Entity');
                if (vpContextMenu.worldPos) {
                  const t = engine.engine.ecs.getComponent<any>(e, 'Transform');
                  if (t) t.position.copy(vpContextMenu.worldPos);
                }
                dispatch({ type: 'SELECT_ENTITY', entity: e });
                log('Created entity at click position', 'info');
              },
            },
            {
              label: 'Add Cube at Position',
              icon: Icons.cube,
              onClick: () => {
                const e = engine.scene.createPrimitive('Cube', 'cube');
                if (vpContextMenu.worldPos) {
                  const t = engine.engine.ecs.getComponent<any>(e, 'Transform');
                  if (t) t.position.copy(vpContextMenu.worldPos);
                }
                dispatch({ type: 'SELECT_ENTITY', entity: e });
                log('Created cube at click position', 'info');
              },
            },
            {
              label: 'Add Point Light at Position',
              icon: Icons.pointLight,
              onClick: () => {
                const e = engine.scene.createLight('Point Light', 'point', 0xffffff, 1);
                if (vpContextMenu.worldPos) {
                  const t = engine.engine.ecs.getComponent<any>(e, 'Transform');
                  if (t) t.position.copy(vpContextMenu.worldPos);
                }
                dispatch({ type: 'SELECT_ENTITY', entity: e });
                log('Created point light at click position', 'info');
              },
            },
            { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
            {
              label: 'Focus Selected',
              icon: Icons.target,
              shortcut: 'F',
              disabled: state.selectedEntity === null,
              onClick: () => {
                if (state.selectedEntity !== null) {
                  const t = engine.engine.ecs.getComponent<any>(state.selectedEntity, 'Transform');
                  if (t) {
                    engine.orbitControls.target.copy(t.position);
                    engine.orbitControls.update();
                  }
                }
              },
            },
            { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
            {
              label: 'View: Top',
              icon: Icons.chevronDown,
              onClick: () => setCameraView('top'),
            },
            {
              label: 'View: Front',
              icon: Icons.chevronRight,
              onClick: () => setCameraView('front'),
            },
            {
              label: 'View: Right',
              icon: Icons.chevronRight,
              onClick: () => setCameraView('right'),
            },
          ]}
        />
      )}
    </div>
  );
};
