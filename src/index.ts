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
  AnimationComponent,
} from './core/Components';

// Renderer
export { FluxionRenderer, RendererConfig } from './renderer/Renderer';
export { PostProcessingPipeline, PostProcessConfig } from './renderer/PostProcessing';
export { MaterialSystem, PBRMaterialConfig } from './renderer/MaterialSystem';
export { ParticleRenderSystem } from './renderer/ParticleSystem';

// Physics
export { PhysicsWorld } from './physics/PhysicsWorld';

// Scene
export { Scene, SceneData, PrefabManager, PrefabData } from './scene/Scene';

// Input
export { InputManager, MouseButton } from './input/InputManager';

// Audio
export { AudioSystem } from './audio/AudioSystem';

// Assets
export { AssetManager, AssetType, LoadProgress } from './assets/AssetManager';
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
