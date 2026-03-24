// ============================================================
// FluxionJS V3 — Editor Engine (Pure logic, no React)
// Engine subsystem initialization — extracted from EngineContext.tsx
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GizmoService } from './GizmoService';

import { Engine } from '../../src/core/Engine';
import { FluxionRenderer } from '../../src/renderer/Renderer';
import { MaterialSystem } from '../../src/renderer/MaterialSystem';
import { ParticleRenderSystem } from '../../src/renderer/ParticleSystem';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { InputManager } from '../../src/input/InputManager';
import { AudioSystem } from '../../src/audio/AudioSystem';
import { Scene } from '../../src/scene/Scene';
import { AssetManager } from '../../src/assets/AssetManager';

export interface EngineSubsystems {
  engine: Engine;
  renderer: FluxionRenderer;
  materials: MaterialSystem;
  physics: PhysicsWorld;
  input: InputManager;
  audio: AudioSystem;
  scene: Scene;
  assets: AssetManager;
  editorCamera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  gizmoService: GizmoService;
  selectionOutline: THREE.BoxHelper;
}

export type LogFn = (text: string, type: 'info' | 'warn' | 'error' | 'system') => void;

/** Initialize all engine subsystems for the editor. */
export async function initEditorEngine(
  canvas: HTMLCanvasElement,
  log: LogFn,
): Promise<EngineSubsystems> {
  log('FluxionJS V3 Engine initializing...', 'system');

  const container = canvas.parentElement!;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  // Engine
  const engine = new Engine({
    canvas,
    width: rect.width,
    height: rect.height,
    antialias: true,
    physicsEnabled: true,
  });

  // Renderer
  const renderer = new FluxionRenderer(engine, {
    shadows: true,
    shadowMapSize: 2048,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.2,
  });

  const materials = new MaterialSystem();
  engine.registerSubsystem('materials', materials);
  const assets = new AssetManager();
  engine.registerSubsystem('assets', assets);
  const input = new InputManager(engine);
  const audio = new AudioSystem(engine);

  // Physics
  const physics = new PhysicsWorld(engine);
  await physics.init();
  log('Rapier3D physics initialized', 'system');

  // Particles
  engine.ecs.addSystem(new ParticleRenderSystem(renderer.scene));

  // Scene
  const scene = new Scene(engine, 'Main Scene');

  // Editor camera
  const editorCamera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 2000);
  editorCamera.position.set(15, 12, 15);
  editorCamera.lookAt(0, 0, 0);
  renderer.setActiveCamera(editorCamera);

  // Orbit controls
  const orbitControls = new OrbitControls(editorCamera, canvas);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.screenSpacePanning = true;
  orbitControls.maxPolarAngle = Math.PI * 0.95;
  orbitControls.minDistance = 1;
  orbitControls.maxDistance = 500;

  // Gizmo service (replaces TransformControls)
  const gizmoService = new GizmoService(editorCamera, canvas, orbitControls);

  // Selection outline
  const selectionOutline = new THREE.BoxHelper(new THREE.Mesh(), 0x58a6ff);
  selectionOutline.visible = false;
  renderer.gizmoScene.add(selectionOutline);

  // Grid is now drawn via DebugDraw each frame (see EditorLogic GridSync)

  // Environment
  renderer.scene.background = new THREE.Color(0x0a0e17);
  renderer.scene.fog = new THREE.FogExp2(0x0a0e17, 0.008);

  // Update controls each frame
  engine.events.on('engine:update', () => orbitControls.update());

  // Start engine
  await engine.start();

  log('FluxionJS V3 Editor ready!', 'system');
  log(`Renderer: WebGL2 | Shadows: PCFSoft | HDR: HalfFloat`, 'info');
  log(`Physics: Rapier3D (WASM) | ECS: Active`, 'info');

  return {
    engine,
    renderer,
    materials,
    physics,
    input,
    audio,
    scene,
    assets,
    editorCamera,
    orbitControls,
    gizmoService,
    selectionOutline,
  };
}
