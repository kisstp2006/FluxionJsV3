// ============================================================
// FluxionJS V3 — ViewCube
// Interactive 3D orientation cube for the editor viewport.
// Renders in a dedicated mini canvas with its own renderer.
// Syncs with the main editor camera orientation and allows
// click-to-snap to preset views with smooth animation.
// ============================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { useEngine } from '../../core/EditorContext';
import { SettingsRegistry } from '../../core/SettingsRegistry';

// ── Constants ──

const CAMERA_DISTANCE = 3.7;
const EDGE_THICKNESS = 0.08;
const CORNER_SIZE = 0.22;

// Axis colors matching editor theme
const AXIS_X = 0xf85149;
const AXIS_Y = 0x3fb950;
const AXIS_Z = 0x58a6ff;

const EDGE_COLOR_DEFAULT = 0x4a5568;
const EDGE_COLOR_HOVER = 0x6b7fa0;
const LABEL_COLOR = '#e6edf3';

// ── Face / Edge / Corner definitions ──

interface CubeFace {
  name: string;
  label: string;
  direction: THREE.Vector3;
  up: THREE.Vector3;
}

const FACES: CubeFace[] = [
  { name: 'front',  label: 'Front',  direction: new THREE.Vector3(0, 0, 1),  up: new THREE.Vector3(0, 1, 0) },
  { name: 'back',   label: 'Back',   direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
  { name: 'right',  label: 'Right',  direction: new THREE.Vector3(1, 0, 0),  up: new THREE.Vector3(0, 1, 0) },
  { name: 'left',   label: 'Left',   direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { name: 'top',    label: 'Top',    direction: new THREE.Vector3(0, 1, 0),  up: new THREE.Vector3(0, 0, -1) },
  { name: 'bottom', label: 'Bottom', direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
];

// Edge midpoints (12 edges of a cube)
interface CubeEdge {
  name: string;
  direction: THREE.Vector3;
  up: THREE.Vector3;
}

const EDGES: CubeEdge[] = [
  // Top edges
  { name: 'top-front',  direction: new THREE.Vector3(0, 1, 1).normalize(),  up: new THREE.Vector3(0, 1, -1).normalize() },
  { name: 'top-back',   direction: new THREE.Vector3(0, 1, -1).normalize(), up: new THREE.Vector3(0, 1, 1).normalize() },
  { name: 'top-right',  direction: new THREE.Vector3(1, 1, 0).normalize(),  up: new THREE.Vector3(-1, 1, 0).normalize() },
  { name: 'top-left',   direction: new THREE.Vector3(-1, 1, 0).normalize(), up: new THREE.Vector3(1, 1, 0).normalize() },
  // Bottom edges
  { name: 'bottom-front', direction: new THREE.Vector3(0, -1, 1).normalize(),  up: new THREE.Vector3(0, 1, 0) },
  { name: 'bottom-back',  direction: new THREE.Vector3(0, -1, -1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  { name: 'bottom-right', direction: new THREE.Vector3(1, -1, 0).normalize(),  up: new THREE.Vector3(0, 1, 0) },
  { name: 'bottom-left',  direction: new THREE.Vector3(-1, -1, 0).normalize(), up: new THREE.Vector3(0, 1, 0) },
  // Middle edges
  { name: 'front-right',  direction: new THREE.Vector3(1, 0, 1).normalize(),  up: new THREE.Vector3(0, 1, 0) },
  { name: 'front-left',   direction: new THREE.Vector3(-1, 0, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  { name: 'back-right',   direction: new THREE.Vector3(1, 0, -1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  { name: 'back-left',    direction: new THREE.Vector3(-1, 0, -1).normalize(), up: new THREE.Vector3(0, 1, 0) },
];

// Corner positions (8 corners)
interface CubeCorner {
  name: string;
  direction: THREE.Vector3;
  up: THREE.Vector3;
}

const CORNERS: CubeCorner[] = [
  { name: 'top-front-right',    direction: new THREE.Vector3(1, 1, 1).normalize(),    up: new THREE.Vector3(-1, 1, -1).normalize() },
  { name: 'top-front-left',     direction: new THREE.Vector3(-1, 1, 1).normalize(),   up: new THREE.Vector3(1, 1, -1).normalize() },
  { name: 'top-back-right',     direction: new THREE.Vector3(1, 1, -1).normalize(),   up: new THREE.Vector3(-1, 1, 1).normalize() },
  { name: 'top-back-left',      direction: new THREE.Vector3(-1, 1, -1).normalize(),  up: new THREE.Vector3(1, 1, 1).normalize() },
  { name: 'bottom-front-right', direction: new THREE.Vector3(1, -1, 1).normalize(),   up: new THREE.Vector3(0, 1, 0) },
  { name: 'bottom-front-left',  direction: new THREE.Vector3(-1, -1, 1).normalize(),  up: new THREE.Vector3(0, 1, 0) },
  { name: 'bottom-back-right',  direction: new THREE.Vector3(1, -1, -1).normalize(),  up: new THREE.Vector3(0, 1, 0) },
  { name: 'bottom-back-left',   direction: new THREE.Vector3(-1, -1, -1).normalize(), up: new THREE.Vector3(0, 1, 0) },
];

// ── Texture generation ──

function createFaceTexture(label: string, isHovered: boolean): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = isHovered ? '#253249' : '#1c2333';
  ctx.fillRect(0, 0, size, size);

  // Border
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  // Label text
  ctx.fillStyle = isHovered ? '#79c0ff' : LABEL_COLOR;
  ctx.font = `bold ${label.length > 3 ? 18 : 22}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ── Build the cube mesh ──

function buildCubeMesh(): {
  group: THREE.Group;
  faceMeshes: Map<string, THREE.Mesh>;
  edgeMeshes: Map<string, THREE.Mesh>;
  cornerMeshes: Map<string, THREE.Mesh>;
} {
  const group = new THREE.Group();
  const faceMeshes = new Map<string, THREE.Mesh>();
  const edgeMeshes = new Map<string, THREE.Mesh>();
  const cornerMeshes = new Map<string, THREE.Mesh>();

  const halfSize = 0.5;

  // ── Faces (6 quads) ──
  const faceGeo = new THREE.PlaneGeometry(1 - EDGE_THICKNESS * 2, 1 - EDGE_THICKNESS * 2);

  for (const face of FACES) {
    const tex = createFaceTexture(face.label, false);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(faceGeo, mat);
    mesh.userData = { type: 'face', face };

    // Position and orient face
    mesh.position.copy(face.direction).multiplyScalar(halfSize);
    mesh.lookAt(face.direction.clone().multiplyScalar(2));

    group.add(mesh);
    faceMeshes.set(face.name, mesh);
  }

  // ── Edges (12 elongated boxes) ──
  const edgeGeoH = new THREE.BoxGeometry(1 - CORNER_SIZE * 2, EDGE_THICKNESS, EDGE_THICKNESS);
  const edgeGeoV = new THREE.BoxGeometry(EDGE_THICKNESS, 1 - CORNER_SIZE * 2, EDGE_THICKNESS);
  const edgeGeoD = new THREE.BoxGeometry(EDGE_THICKNESS, EDGE_THICKNESS, 1 - CORNER_SIZE * 2);
  const edgeMat = new THREE.MeshBasicMaterial({ color: EDGE_COLOR_DEFAULT });

  const edgeDefs: Array<{ name: string; geo: THREE.BoxGeometry; pos: THREE.Vector3 }> = [
    // Top 4
    { name: 'top-front',  geo: edgeGeoH, pos: new THREE.Vector3(0, halfSize, halfSize) },
    { name: 'top-back',   geo: edgeGeoH, pos: new THREE.Vector3(0, halfSize, -halfSize) },
    { name: 'top-right',  geo: edgeGeoD, pos: new THREE.Vector3(halfSize, halfSize, 0) },
    { name: 'top-left',   geo: edgeGeoD, pos: new THREE.Vector3(-halfSize, halfSize, 0) },
    // Bottom 4
    { name: 'bottom-front',  geo: edgeGeoH, pos: new THREE.Vector3(0, -halfSize, halfSize) },
    { name: 'bottom-back',   geo: edgeGeoH, pos: new THREE.Vector3(0, -halfSize, -halfSize) },
    { name: 'bottom-right',  geo: edgeGeoD, pos: new THREE.Vector3(halfSize, -halfSize, 0) },
    { name: 'bottom-left',   geo: edgeGeoD, pos: new THREE.Vector3(-halfSize, -halfSize, 0) },
    // Middle 4
    { name: 'front-right',  geo: edgeGeoV, pos: new THREE.Vector3(halfSize, 0, halfSize) },
    { name: 'front-left',   geo: edgeGeoV, pos: new THREE.Vector3(-halfSize, 0, halfSize) },
    { name: 'back-right',   geo: edgeGeoV, pos: new THREE.Vector3(halfSize, 0, -halfSize) },
    { name: 'back-left',    geo: edgeGeoV, pos: new THREE.Vector3(-halfSize, 0, -halfSize) },
  ];

  for (const def of edgeDefs) {
    const mesh = new THREE.Mesh(def.geo, edgeMat.clone());
    mesh.position.copy(def.pos);
    const edgeData = EDGES.find((e) => e.name === def.name)!;
    mesh.userData = { type: 'edge', edge: edgeData };
    group.add(mesh);
    edgeMeshes.set(def.name, mesh);
  }

  // ── Corners (8 small cubes) ──
  const cornerGeo = new THREE.BoxGeometry(CORNER_SIZE, CORNER_SIZE, CORNER_SIZE);
  const cornerMat = new THREE.MeshBasicMaterial({ color: EDGE_COLOR_DEFAULT });

  const cornerPositions = [
    [1, 1, 1], [1, 1, -1], [-1, 1, 1], [-1, 1, -1],
    [1, -1, 1], [1, -1, -1], [-1, -1, 1], [-1, -1, -1],
  ];

  for (let i = 0; i < CORNERS.length; i++) {
    const corner = CORNERS[i];
    const [cx, cy, cz] = cornerPositions[i];
    const mesh = new THREE.Mesh(cornerGeo, cornerMat.clone());
    mesh.position.set(cx * halfSize, cy * halfSize, cz * halfSize);
    mesh.userData = { type: 'corner', corner };
    group.add(mesh);
    cornerMeshes.set(corner.name, mesh);
  }

  return { group, faceMeshes, edgeMeshes, cornerMeshes };
}

// ── Build axis indicators ──

function buildAxisIndicators(): THREE.Group {
  const group = new THREE.Group();
  const len = 0.85;
  const headLen = 0.12;
  const headWidth = 0.04;

  // X axis
  const xDir = new THREE.Vector3(1, 0, 0);
  const xArrow = new THREE.ArrowHelper(xDir, new THREE.Vector3(0, 0, 0), len, AXIS_X, headLen, headWidth);
  group.add(xArrow);

  // Y axis
  const yDir = new THREE.Vector3(0, 1, 0);
  const yArrow = new THREE.ArrowHelper(yDir, new THREE.Vector3(0, 0, 0), len, AXIS_Y, headLen, headWidth);
  group.add(yArrow);

  // Z axis
  const zDir = new THREE.Vector3(0, 0, 1);
  const zArrow = new THREE.ArrowHelper(zDir, new THREE.Vector3(0, 0, 0), len, AXIS_Z, headLen, headWidth);
  group.add(zArrow);

  return group;
}

// ── Smooth animation helper ──

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── ViewCube React Component ──

export const ViewCube: React.FC = () => {
  const engine = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Settings-driven state ──
  const [visible, setVisible] = useState(() => SettingsRegistry.get<boolean>('editor.viewcube.visible'));
  const [cubeSize, setCubeSize] = useState(() => SettingsRegistry.get<number>('editor.viewcube.size'));
  const [opacity, setOpacity] = useState(() => SettingsRegistry.get<number>('editor.viewcube.opacity'));
  const animDurationRef = useRef(SettingsRegistry.get<number>('editor.viewcube.animationSpeed'));

  useEffect(() => {
    return SettingsRegistry.on(({ key, value }) => {
      switch (key) {
        case 'editor.viewcube.visible': setVisible(value as boolean); break;
        case 'editor.viewcube.size': setCubeSize(value as number); break;
        case 'editor.viewcube.opacity': setOpacity(value as number); break;
        case 'editor.viewcube.animationSpeed': animDurationRef.current = value as number; break;
      }
    });
  }, []);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    cubeGroup: THREE.Group;
    axisGroup: THREE.Group;
    faceMeshes: Map<string, THREE.Mesh>;
    edgeMeshes: Map<string, THREE.Mesh>;
    cornerMeshes: Map<string, THREE.Mesh>;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    hoveredMesh: THREE.Mesh | null;
    animating: boolean;
    animStart: number;
    animFromPos: THREE.Vector3;
    animFromUp: THREE.Vector3;
    animToPos: THREE.Vector3;
    animToUp: THREE.Vector3;
    disposed: boolean;
    animDuration: number;
  } | null>(null);

  // Initialize the mini renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine || !visible) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(cubeSize, cubeSize);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);

    const { group, faceMeshes, edgeMeshes, cornerMeshes } = buildCubeMesh();
    scene.add(group);

    const axisGroup = buildAxisIndicators();
    scene.add(axisGroup);

    // Ambient light so labels are visible
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    const state = {
      renderer,
      scene,
      camera,
      cubeGroup: group,
      axisGroup,
      faceMeshes,
      edgeMeshes,
      cornerMeshes,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      hoveredMesh: null as THREE.Mesh | null,
      animating: false,
      animStart: 0,
      animFromPos: new THREE.Vector3(),
      animFromUp: new THREE.Vector3(),
      animToPos: new THREE.Vector3(),
      animToUp: new THREE.Vector3(),
      disposed: false,
      animDuration: animDurationRef.current,
    };
    stateRef.current = state;

    // ── Per-frame sync with editor camera ──
    const camPos = new THREE.Vector3();

    const onUpdate = () => {
      if (state.disposed) return;

      if (state.animating) {
        const elapsed = performance.now() - state.animStart;
        const t = Math.min(elapsed / state.animDuration, 1);
        const ease = easeOutCubic(t);

        // Interpolate camera position on a sphere
        const from = state.animFromPos.clone().normalize();
        const to = state.animToPos.clone().normalize();
        const interpolated = from.lerp(to, ease).normalize().multiplyScalar(
          engine.editorCamera.position.distanceTo(engine.orbitControls.target)
        );

        engine.editorCamera.position.copy(engine.orbitControls.target).add(interpolated);

        // Interpolate up vector
        const fromUp = state.animFromUp.clone();
        const toUp = state.animToUp.clone();
        engine.editorCamera.up.copy(fromUp.lerp(toUp, ease).normalize());

        engine.editorCamera.lookAt(engine.orbitControls.target);
        engine.orbitControls.update();

        if (t >= 1) {
          state.animating = false;
          // Ensure exact final position
          engine.editorCamera.up.set(0, 1, 0);
          // Re-derive up for top/bottom views
          if (Math.abs(state.animToPos.clone().normalize().y) > 0.99) {
            engine.editorCamera.up.copy(state.animToUp);
          }
          engine.editorCamera.lookAt(engine.orbitControls.target);
          engine.orbitControls.update();
        }
      }

      // Sync cube camera orientation from editor camera
      const editorCam = engine.editorCamera;
      const target = engine.orbitControls.target;

      // Get direction from target to camera
      camPos.copy(editorCam.position).sub(target).normalize();

      // Position cube camera to match editor viewing angle
      state.camera.position.copy(camPos).multiplyScalar(CAMERA_DISTANCE);
      state.camera.lookAt(0, 0, 0);
      state.camera.up.copy(editorCam.up);

      // Render
      state.renderer.render(state.scene, state.camera);
    };

    engine.engine.events.on('engine:update', onUpdate);

    return () => {
      state.disposed = true;
      engine.engine.events.off('engine:update', onUpdate);
      // Dispose GPU resources
      state.faceMeshes.forEach((m) => {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      });
      state.edgeMeshes.forEach((m) => (m.material as THREE.Material).dispose());
      state.cornerMeshes.forEach((m) => (m.material as THREE.Material).dispose());
      renderer.dispose();
      stateRef.current = null;
    };
  }, [engine]);

  // ── Hover handling ──
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const st = stateRef.current;
    if (!st || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    st.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    st.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    st.raycaster.setFromCamera(st.mouse, st.camera);
    const allMeshes = [
      ...Array.from(st.faceMeshes.values()),
      ...Array.from(st.edgeMeshes.values()),
      ...Array.from(st.cornerMeshes.values()),
    ];
    const hits = st.raycaster.intersectObjects(allMeshes, false);

    const newHovered = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;

    if (newHovered !== st.hoveredMesh) {
      // Unhover previous
      if (st.hoveredMesh) {
        const ud = st.hoveredMesh.userData;
        if (ud.type === 'face') {
          const face = ud.face as CubeFace;
          const mat = st.hoveredMesh.material as THREE.MeshBasicMaterial;
          mat.map?.dispose();
          mat.map = createFaceTexture(face.label, false);
          mat.needsUpdate = true;
        } else {
          (st.hoveredMesh.material as THREE.MeshBasicMaterial).color.setHex(EDGE_COLOR_DEFAULT);
        }
      }

      // Hover new
      if (newHovered) {
        const ud = newHovered.userData;
        if (ud.type === 'face') {
          const face = ud.face as CubeFace;
          const mat = newHovered.material as THREE.MeshBasicMaterial;
          mat.map?.dispose();
          mat.map = createFaceTexture(face.label, true);
          mat.needsUpdate = true;
        } else {
          (newHovered.material as THREE.MeshBasicMaterial).color.setHex(EDGE_COLOR_HOVER);
        }
      }

      st.hoveredMesh = newHovered;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    const st = stateRef.current;
    if (!st || !st.hoveredMesh) return;

    const ud = st.hoveredMesh.userData;
    if (ud.type === 'face') {
      const face = ud.face as CubeFace;
      const mat = st.hoveredMesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.map = createFaceTexture(face.label, false);
      mat.needsUpdate = true;
    } else {
      (st.hoveredMesh.material as THREE.MeshBasicMaterial).color.setHex(EDGE_COLOR_DEFAULT);
    }
    st.hoveredMesh = null;
  }, []);

  // ── Click → animate camera ──
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const st = stateRef.current;
    if (!st || !engine || st.animating) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    st.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    st.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    st.raycaster.setFromCamera(st.mouse, st.camera);
    const allMeshes = [
      ...Array.from(st.faceMeshes.values()),
      ...Array.from(st.edgeMeshes.values()),
      ...Array.from(st.cornerMeshes.values()),
    ];
    const hits = st.raycaster.intersectObjects(allMeshes, false);
    if (hits.length === 0) return;

    const hit = hits[0].object;
    const ud = hit.userData;

    let targetDir: THREE.Vector3;
    let targetUp: THREE.Vector3;

    if (ud.type === 'face') {
      const face = ud.face as CubeFace;
      targetDir = face.direction.clone();
      targetUp = face.up.clone();
    } else if (ud.type === 'edge') {
      const edge = ud.edge as CubeEdge;
      targetDir = edge.direction.clone();
      targetUp = edge.up.clone();
    } else if (ud.type === 'corner') {
      const corner = ud.corner as CubeCorner;
      targetDir = corner.direction.clone();
      targetUp = corner.up.clone();
    } else {
      return;
    }

    // Calculate animation targets
    const target = engine.orbitControls.target;
    const dist = engine.editorCamera.position.distanceTo(target);
    const fromOffset = engine.editorCamera.position.clone().sub(target);

    st.animFromPos.copy(fromOffset);
    st.animFromUp.copy(engine.editorCamera.up);
    st.animToPos.copy(targetDir.clone().multiplyScalar(dist));
    st.animToUp.copy(targetUp);
    st.animStart = performance.now();
    st.animating = true;

    e.stopPropagation();
  }, [engine]);

  // Keep animDuration in sync
  useEffect(() => {
    const st = stateRef.current;
    if (st) st.animDuration = animDurationRef.current;
  });

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      width={cubeSize}
      height={cubeSize}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        width: `${cubeSize}px`,
        height: `${cubeSize}px`,
        zIndex: 6,
        cursor: 'pointer',
        borderRadius: '6px',
        pointerEvents: 'auto',
        opacity,
      }}
    />
  );
};
