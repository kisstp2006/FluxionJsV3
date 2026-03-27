// ============================================================
// FluxionJS V2 — Main Entry Point
// Export all engine modules for external use
// ============================================================

// Core
export { Engine, EngineConfig } from './core/Engine';
export { ECSManager, EntityId, Component, System } from './core/ECS';
export { EventSystem, EngineEvents } from './core/EventSystem';
export { Time } from './core/Time';
export {
  TransformComponent,
  MeshRendererComponent,
  CameraComponent,
  LightComponent,
  RigidbodyComponent,
  ColliderComponent,
  ScriptComponent,
  ParticleEmitterComponent,
  AudioSourceComponent,
  SpriteComponent,
  TextRendererComponent,
  FuiComponent,
  FuiMode,
  AnimationComponent,
  CSGBrushComponent,
} from './core/Components';

// Renderer
export { FluxionRenderer, RendererConfig } from './renderer/Renderer';
export { PostProcessingPipeline, PostProcessConfig } from './renderer/PostProcessing';
export { MaterialSystem, PBRMaterialConfig } from './renderer/MaterialSystem';
export { ParticleRenderSystem } from './renderer/ParticleSystem';

// Physics
export { PhysicsWorld } from './physics/PhysicsWorld';

// UI (FUI)
export { compileFui, renderFuiToCanvas, hitTestFuiButtons } from './ui/FuiRenderer';
export { parseFuiJson } from './ui/FuiParser';
export { FuiRuntimeSystem } from './ui/FuiRuntimeSystem';

// Scene
export { Scene, SceneData, PrefabManager, PrefabData } from './scene/Scene';

// Input
export { InputManager, MouseButton } from './input/InputManager';

// Audio
export { AudioSystem } from './audio/AudioSystem';

// CSG (Constructive Solid Geometry)
export { CSG, CSGSystem, csgToGeometry, geometryToCSG } from './csg';

// Visual Materials
export {
  VisualMaterialFile,
  VisualMaterialGraph,
  VisualMaterialNode,
  VisualMaterialConnection,
  NodeRegistry,
  compileVisualMaterial,
  buildVisualMaterial,
  updateVisualMaterialTime,
} from './materials';

// Assets
export { AssetManager, AssetType, LoadProgress, ModelResult } from './assets/AssetManager';
export { AssetTypeRegistry, AssetTypeDefinition } from './assets/AssetTypeRegistry';
export { AssetImporter, assetImporter, ImportRequest, ImportResult, ImportProgress, ImportOptions } from './assets/AssetImporter';
export { AssetMeta, readAssetMeta, writeAssetMeta, metaPathFor } from './assets/AssetMeta';

// Filesystem
export {
  type IFileSystem,
  type FileInfo,
  type DirEntry,
  type FileWatchEvent,
  type FileDialogFilter,
  normalizePath,
  pathJoin,
  pathDirname,
  pathBasename,
  pathExtension,
  isInsidePath,
  ElectronFileSystem,
  setGlobalFileSystem,
  getFileSystem,
} from './filesystem';
