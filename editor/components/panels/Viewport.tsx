// ============================================================
// FluxionJS V2 — Viewport Component
// 3D viewport with camera controls, selection, gizmo overlay
// ============================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { TabBar, ContextMenu, Icons } from '../../ui';
import { useEditor, useEngine } from '../../core/EditorContext';
import { ViewCube } from './ViewCube';
import { AddEntityPopup } from './hierarchy/AddEntityPopup';
import { CameraComponent, MeshRendererComponent } from '../../../src/core/Components';
import { ComponentRegistry } from '../../../src/core/ComponentRegistry';
import { undoManager, CreateEntityCommand } from '../../core/UndoService';
import { ViewportDropService } from '../../core/ViewportDropService';
import type { DropHitInfo } from '../../core/ViewportDropService';
import { applyDebugMode, restoreDebugMode } from '../../core/ViewportDebugMaterials';

export interface ViewportProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

/** Find the entity with the main camera in the scene. */
function findMainCamera(engine: NonNullable<ReturnType<typeof useEngine>>): CameraComponent | null {
  for (const eid of engine.engine.ecs.query('Camera')) {
    const cam = engine.engine.ecs.getComponent<CameraComponent>(eid, 'Camera');
    if (cam && cam.isMain && cam.enabled) return cam;
  }
  return null;
}

export const Viewport: React.FC<ViewportProps> = ({ onCanvasReady }) => {
  const { state, dispatch, log } = useEditor();
  const engine = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [vpContextMenu, setVpContextMenu] = useState<{ pos: { x: number; y: number }; worldPos?: THREE.Vector3 } | null>(null);
  const [addEntityPopupPos, setAddEntityPopupPos] = useState<{ x: number; y: number } | null>(null);
  const addEntityWorldPosRef = useRef<THREE.Vector3 | undefined>(undefined);
  const [dragDelta, setDragDelta] = useState<string | null>(null);
  const [cameraSpeed, setCameraSpeed] = useState(1);
  const dragStartPosRef = useRef<THREE.Vector3 | null>(null);
  const rightDownRef = useRef<{ x: number; y: number } | null>(null);
  const rightDraggedRef = useRef(false);
  const leftDownRef = useRef<{ x: number; y: number } | null>(null);
  const wasDraggingRef = useRef(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRTRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());

  const isGameView = state.viewportTab === 'Game';

  // Switch camera when toggling between Scene and Game tab
  useEffect(() => {
    if (!engine) return;
    if (isGameView) {
      const mainCam = findMainCamera(engine);
      if (mainCam?.camera) {
        engine.renderer.setActiveCamera(mainCam.camera);
        engine.orbitControls.enabled = false;
        engine.gizmoService.detach();
        engine.selectionOutline.visible = false;
      }
    } else {
      engine.renderer.setActiveCamera(engine.editorCamera);
      engine.orbitControls.enabled = true;
      // Re-attach gizmo to selected entity
      if (state.selectedEntity !== null) {
        const obj = engine.renderer.getObject(state.selectedEntity);
        if (obj) {
          engine.gizmoService.attach(obj);
          engine.selectionOutline.setFromObject(obj);
          engine.selectionOutline.visible = true;
        }
      }
    }
  }, [engine, isGameView]);

  // Keep game view camera in sync every frame
  useEffect(() => {
    if (!engine || !isGameView) return;
    const onUpdate = () => {
      const mainCam = findMainCamera(engine);
      if (mainCam?.camera) {
        if (engine.renderer.getActiveCamera() !== mainCam.camera) {
          engine.renderer.setActiveCamera(mainCam.camera);
        }
        // Update aspect ratio to match viewport
        if (containerRef.current && mainCam.camera instanceof THREE.PerspectiveCamera) {
          const rect = containerRef.current.getBoundingClientRect();
          mainCam.camera.aspect = rect.width / rect.height;
          mainCam.camera.updateProjectionMatrix();
        }
      }
    };
    engine.engine.events.on('engine:update', onUpdate);
    return () => engine.engine.events.off('engine:update', onUpdate);
  }, [engine, isGameView]);

  // Report canvas to parent for engine initialization
  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = node;
    if (node && onCanvasReady) {
      onCanvasReady(node);
    }
  }, [onCanvasReady]);

  // ── Camera Preview: detect if selected entity has a Camera component ──
  const selectedCamInfo = React.useMemo<{ cam: CameraComponent; name: string } | null>(() => {
    if (!engine || state.selectedEntity === null || isGameView) return null;
    const cam = engine.engine.ecs.getComponent<CameraComponent>(state.selectedEntity, 'Camera');
    if (!cam || !cam.enabled || !cam.camera) return null;
    const name = engine.engine.ecs.getEntityName(state.selectedEntity);
    return { cam, name };
  }, [engine, state.selectedEntity, isGameView]);

  // ── Camera Preview: render selected camera's view onto preview canvas ──
  useEffect(() => {
    if (!engine || !selectedCamInfo) return;

    const PREVIEW_W = 240;
    const PREVIEW_H = 135;

    // Create (or reuse) render target
    if (!previewRTRef.current) {
      previewRTRef.current = new THREE.WebGLRenderTarget(PREVIEW_W, PREVIEW_H, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
    }
    const rt = previewRTRef.current;
    const glRenderer = engine.renderer.renderer;
    const scene3 = engine.renderer.scene;
    const buf = new Uint8Array(PREVIEW_W * PREVIEW_H * 4);

    const onUpdate = () => {
      const cam3 = selectedCamInfo.cam.camera;
      if (!cam3 || !previewCanvasRef.current) return;

      // Sync aspect
      if (cam3 instanceof THREE.PerspectiveCamera) {
        cam3.aspect = PREVIEW_W / PREVIEW_H;
        cam3.updateProjectionMatrix();
      }

      // Render scene from this camera into the RT
      const prevRT = glRenderer.getRenderTarget();
      glRenderer.setRenderTarget(rt);
      glRenderer.render(scene3, cam3);
      glRenderer.setRenderTarget(prevRT);

      // Read pixels into canvas
      glRenderer.readRenderTargetPixels(rt, 0, 0, PREVIEW_W, PREVIEW_H, buf);
      const ctx = previewCanvasRef.current.getContext('2d');
      if (!ctx) return;
      const imgData = ctx.createImageData(PREVIEW_W, PREVIEW_H);
      // WebGL readPixels is bottom-up, flip vertically
      for (let y = 0; y < PREVIEW_H; y++) {
        const srcRow = (PREVIEW_H - 1 - y) * PREVIEW_W * 4;
        const dstRow = y * PREVIEW_W * 4;
        imgData.data.set(buf.subarray(srcRow, srcRow + PREVIEW_W * 4), dstRow);
      }
      ctx.putImageData(imgData, 0, 0);
    };

    engine.engine.events.on('engine:update', onUpdate);
    return () => {
      engine.engine.events.off('engine:update', onUpdate);
    };
  }, [engine, selectedCamInfo]);

  // Raycaster pick
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!engine || !canvasRef.current) return;
    if (state.isPlaying) return; // no picking while simulation runs
    // Skip selection if we just finished a gizmo drag or camera drag
    if (engine.gizmoService.isDragging || wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(mouse, engine.editorCamera);
    const intersects = raycaster.intersectObjects(engine.renderer.scene.children, true);

    for (const hit of intersects) {
      if (hit.object.type === 'LineSegments') continue;

      // Billboard icon hit — select the associated entity directly
      const billboardEntity = (hit.object as any).__editorEntityId as number | undefined;
      if (billboardEntity !== undefined) {
        dispatch({ type: 'SELECT_ENTITY', entity: billboardEntity });
        return;
      }

      const entity = engine.renderer.getEntity(hit.object) ??
        (hit.object.parent ? engine.renderer.getEntity(hit.object.parent) : undefined);
      if (entity !== undefined) {
        if (state.lockedEntities.includes(entity)) return;
        dispatch({ type: 'SELECT_ENTITY', entity });
        return;
      }
    }

    dispatch({ type: 'SELECT_ENTITY', entity: null });
  }, [engine, dispatch, state.isPlaying]);

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
    if (state.isPlaying) {
      engine.gizmoService.detach();
      engine.selectionOutline.visible = false;
      engine.renderer.hideSkeletonHelper();
      return;
    }
    if (state.selectedEntity !== null) {
      const tryAttach = () => {
        const obj = engine.renderer.getObject(state.selectedEntity!);
        if (obj) {
          engine.gizmoService.attach(obj);
          engine.selectionOutline.setFromObject(obj);
          engine.selectionOutline.visible = true;
          // Show skeleton helper if entity has a skinned mesh
          const meshComp = engine.engine.ecs.getComponent<MeshRendererComponent>(state.selectedEntity!, 'MeshRenderer');
          if (meshComp?.isSkinnedMesh && meshComp.mesh) {
            engine.renderer.showSkeletonHelper(meshComp.mesh);
          } else {
            engine.renderer.hideSkeletonHelper();
          }
          return true;
        }
        return false;
      };
      if (!tryAttach()) {
        // Object not yet registered (e.g. freshly duplicated entity) — retry after next ECS update
        const rafId = requestAnimationFrame(() => {
          if (!tryAttach()) {
            engine.gizmoService.detach();
            engine.selectionOutline.visible = false;
            engine.renderer.hideSkeletonHelper();
          }
        });
        return () => cancelAnimationFrame(rafId);
      }
    } else {
      engine.gizmoService.detach();
      engine.selectionOutline.visible = false;
      engine.renderer.hideSkeletonHelper();
    }
  }, [engine, state.selectedEntity, state.isPlaying]);

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

  // Sync camera speed to OrbitControls
  useEffect(() => {
    if (!engine) return;
    engine.orbitControls.zoomSpeed   = cameraSpeed;
    engine.orbitControls.rotateSpeed = cameraSpeed;
    engine.orbitControls.panSpeed    = cameraSpeed;
  }, [engine, cameraSpeed]);

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
    const threeRenderer = engine.renderer.renderer;
    applyDebugMode(state.viewportShading, scene, threeRenderer);
    return () => restoreDebugMode(scene, threeRenderer);
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

  // ── Unified asset drag-and-drop from Asset Browser ──
  const [isAssetDragOver, setIsAssetDragOver] = useState(false);
  const [_dropLabel, setDropLabel] = useState<string | null>(null);

  /** Raycast from mouse position — returns world hit point, entity under cursor, and hit object */
  const raycastFromEvent = useCallback((e: React.DragEvent | React.MouseEvent): DropHitInfo => {
    const result: DropHitInfo = { worldPos: new THREE.Vector3(0, 0, 0), entityUnderCursor: null, hitObject: null };
    if (!engine || !canvasRef.current) return result;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(mouse, engine.editorCamera);
    const intersects = raycaster.intersectObjects(engine.renderer.scene.children, true);

    for (const hit of intersects) {
      if (hit.object.type === 'LineSegments') continue;
      result.worldPos = hit.point.clone();
      result.hitObject = hit.object;
      // Resolve entity from the hit object or its parent
      const entity = engine.renderer.getEntity(hit.object) ??
        (hit.object.parent ? engine.renderer.getEntity(hit.object.parent) : undefined);
      if (entity !== undefined) {
        result.entityUnderCursor = entity;
      }
      break;
    }

    return result;
  }, [engine]);

  // Right-click context menu on viewport — only if the mouse didn't move (camera orbit)
  const handleRightClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (rightDraggedRef.current) return;
    if (!engine || !canvasRef.current) return;

    const hit = raycastFromEvent(e);
    setVpContextMenu({ pos: { x: e.clientX, y: e.clientY }, worldPos: hit.worldPos });
  }, [engine, raycastFromEvent]);

  const handleAssetDragOver = useCallback((e: React.DragEvent) => {
    if (isGameView) return;
    if (e.dataTransfer.types.includes('application/x-fluxion-asset')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsAssetDragOver(true);
      // Show what action will happen (read path from type data if available)
      // We cannot read the actual data during dragOver (browser security), so use a stored ref
    }
  }, [isGameView]);

  const handleAssetDragLeave = useCallback(() => {
    setIsAssetDragOver(false);
    setDropLabel(null);
  }, []);

  const handleAssetDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsAssetDragOver(false);
    setDropLabel(null);
    if (!engine || isGameView) return;

    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    const absPath = e.dataTransfer.getData('application/x-fluxion-asset-abs');
    if (!assetPath) return;

    // Check if the drop service can handle this type
    if (!ViewportDropService.canHandle(assetPath)) {
      log(`Unsupported asset type for viewport drop`, 'warn');
      return;
    }

    const hit = raycastFromEvent(e);
    const result = await ViewportDropService.handleDrop(assetPath, absPath, hit, engine, log);
    if (!result) return;

    if (result.sceneModified) {
      dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
    }

    if (result.selectEntity !== undefined) {
      // Wait a frame for systems to register the new mesh
      requestAnimationFrame(() => {
        dispatch({ type: 'SELECT_ENTITY', entity: result.selectEntity! });
      });
    }
  }, [engine, isGameView, dispatch, log, raycastFromEvent]);

  return (
    <div
      ref={containerRef}
      onDragOver={handleAssetDragOver}
      onDragLeave={handleAssetDragLeave}
      onDrop={handleAssetDrop}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        outline: isAssetDragOver ? '2px dashed var(--accent)' : 'none',
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

      {/* ViewCube — interactive 3D orientation cube (Scene view only) */}
      {!isGameView && <ViewCube />}

      {/* Canvas */}
      <canvas
        ref={setCanvasRef}
        id="viewport-canvas"
        onClick={isGameView ? undefined : handleClick}
        onContextMenu={isGameView ? undefined : handleRightClick}
        onMouseDown={isGameView ? undefined : (e) => {
          if (e.button === 2) {
            rightDownRef.current = { x: e.clientX, y: e.clientY };
            rightDraggedRef.current = false;
          }
          if (e.button === 0) {
            leftDownRef.current = { x: e.clientX, y: e.clientY };
            wasDraggingRef.current = false;
          }
        }}
        onMouseMove={isGameView ? undefined : (e) => {
          if (rightDownRef.current) {
            const dx = e.clientX - rightDownRef.current.x;
            const dy = e.clientY - rightDownRef.current.y;
            if (dx * dx + dy * dy > 9) rightDraggedRef.current = true;
          }
          if (leftDownRef.current) {
            const dx = e.clientX - leftDownRef.current.x;
            const dy = e.clientY - leftDownRef.current.y;
            if (dx * dx + dy * dy > 9) wasDraggingRef.current = true;
          }
        }}
        onMouseUp={isGameView ? undefined : (e) => {
          if (e.button === 2) rightDownRef.current = null;
          if (e.button === 0) leftDownRef.current = null;
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Game View — stats overlay */}
      {isGameView && (
        <div style={{
          position: 'absolute',
          top: '32px',
          right: '8px',
          zIndex: 8,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '2px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
        }}>
          <span style={{ color: 'var(--accent-green)', background: 'rgba(0,0,0,0.5)', padding: '1px 5px', borderRadius: '2px' }}>
            {state.fps} FPS
          </span>
          <span style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.5)', padding: '1px 5px', borderRadius: '2px' }}>
            {state.drawCalls} DC · {state.triangles.toLocaleString()} tris
          </span>
        </div>
      )}

      {/* Game View — no main camera message */}
      {isGameView && engine && !findMainCamera(engine) && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '8px',
          color: 'var(--text-muted)',
          fontSize: '13px',
          pointerEvents: 'none',
          background: 'rgba(10,14,23,0.85)',
          zIndex: 7,
        }}>
          {Icons.camera}
          <span>No Main Camera in scene</span>
          <span style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>
            Add a Camera component and mark it as Main
          </span>
        </div>
      )}

      {/* Camera Speed picker (Scene view only) */}
      {!isGameView && (
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          zIndex: 8,
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
        }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Spd:</span>
          {[0.25, 0.5, 1, 2, 4].map(s => (
            <button
              key={s}
              onClick={() => setCameraSpeed(s)}
              style={{
                padding: '1px 5px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                background: cameraSpeed === s ? 'var(--accent)' : 'rgba(0,0,0,0.5)',
                border: `1px solid ${cameraSpeed === s ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '2px',
                color: cameraSpeed === s ? '#000' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {s}×
            </button>
          ))}
        </div>
      )}

      {/* Camera Preview (when a camera entity is selected, Scene view only) */}
      {!isGameView && selectedCamInfo && (
        <div style={{
          position: 'absolute',
          bottom: '48px',
          right: '8px',
          zIndex: 8,
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: '11px',
            color: 'var(--text)',
            fontWeight: 600,
            marginBottom: '3px',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}>
            {selectedCamInfo.name}
          </div>
          <div style={{
            border: '1.5px solid rgba(255,255,255,0.25)',
            borderRadius: '3px',
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
            background: '#000',
          }}>
            <canvas
              ref={previewCanvasRef}
              width={240}
              height={135}
              style={{ display: 'block', width: '240px', height: '135px' }}
            />
          </div>
        </div>
      )}

      
      {/* Drag Delta Overlay (Scene view only) */}
      {!isGameView && dragDelta && (
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

      {/* Drop action indicator */}
      {!isGameView && isAssetDragOver && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(13,17,23,0.85)',
          border: '1px solid var(--accent)',
          borderRadius: '6px',
          padding: '8px 16px',
          fontSize: '12px',
          color: 'var(--accent)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          Drop asset to add to scene
        </div>
      )}

      {/* Add Entity popup (opened from viewport right-click) */}
      {addEntityPopupPos && engine && (
        <AddEntityPopup
          position={addEntityPopupPos}
          onClose={() => setAddEntityPopupPos(null)}
          onAdd={(_cat, type) => {
            const worldPos = addEntityWorldPosRef.current;
            const ecs = engine.engine.ecs;
            const scene = engine.scene;
            const materials = engine.materials;
            const createFn = () => {
              let eid: number;
              switch (type) {
                case 'empty':    eid = scene.createEmpty('Empty Entity'); break;
                case 'cube': case 'sphere': case 'cylinder': case 'cone':
                case 'plane': case 'capsule': case 'torus':
                  eid = scene.createPrimitive(type.charAt(0).toUpperCase() + type.slice(1), type as any); break;
                case 'directional': eid = scene.createLight('Directional Light', 'directional', 0xffffff, 1); break;
                case 'point':       eid = scene.createLight('Point Light', 'point', 0xffffff, 1); break;
                case 'spot':        eid = scene.createLight('Spot Light', 'spot', 0xffffff, 1); break;
                case 'ambient':     eid = scene.createLight('Ambient Light', 'ambient', 0xffffff, 0.5); break;
                case 'camera':      eid = scene.createCamera('Camera'); break;
                case 'particle': {
                  eid = scene.createEmpty('Particle System');
                  const pe = ComponentRegistry.create('ParticleEmitter');
                  if (pe) { (pe as any).maxParticles = 200; (pe as any).emissionRate = 30; ecs.addComponent(eid, pe); }
                  break;
                }
                case 'text3d':  eid = scene.createText('3D Text'); break;
                case 'sprite':  eid = scene.createSprite('Sprite'); break;
                case 'physics_box': eid = scene.createPhysicsBox('Physics Box', new THREE.Vector3(1,1,1), materials.createPBR({ name:'pb', albedo:0x888888, roughness:0.6, metalness:0.1 }), 'dynamic'); break;
                case 'physics_sphere': eid = scene.createPhysicsSphere('Physics Sphere', 0.5, materials.createPBR({ name:'ps', albedo:0x888888, roughness:0.6, metalness:0.1 }), 'dynamic'); break;
                default: eid = scene.createEmpty('Entity');
              }
              if (worldPos) {
                const t = ecs.getComponent<any>(eid, 'Transform');
                if (t) t.position.copy(worldPos);
              }
              return eid;
            };
            undoManager.execute(new CreateEntityCommand(createFn, ecs, (entity) => {
              log(`Created: ${ecs.getEntityName(entity)}`, 'info');
              dispatch({ type: 'SELECT_ENTITY', entity });
              dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
            }));
          }}
        />
      )}

      {/* Viewport Right-Click Context Menu (Scene view only) */}
      {!isGameView && vpContextMenu && engine && (
        <ContextMenu
          position={vpContextMenu.pos}
          onClose={() => setVpContextMenu(null)}
          items={[
            {
              label: 'Add Entity...',
              icon: Icons.plus,
              onClick: () => {
                addEntityWorldPosRef.current = vpContextMenu.worldPos;
                setAddEntityPopupPos(vpContextMenu.pos);
                setVpContextMenu(null);
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
