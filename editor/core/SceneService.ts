// ============================================================
// FluxionJS V3 — Scene Service
// Scene load/save operations — uses IFileSystem abstraction
// ============================================================

import { EngineSubsystems, LogFn } from './EditorEngine';
import { serializeScene } from '../../src/project/SceneSerializer';
import { projectManager } from '../../src/project/ProjectManager';
import { loadSceneNative, saveSceneNative } from '../../src/project/SceneBridge';

/** Load a scene file into the engine subsystems. */
export async function loadProjectScene(
  subsystems: EngineSubsystems,
  scenePath: string,
  log: LogFn,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const { deserializeScene } = await import('../../src/project/SceneSerializer');

  const data = await loadSceneNative(scenePath);
  if (!data) throw new Error(`[SceneService] load_scene Tauri command returned null for: ${scenePath}`);

  await deserializeScene(subsystems.engine, data, subsystems.scene, onProgress);

  subsystems.scene.name = data.name || 'Untitled';
  subsystems.scene.path = scenePath;
  subsystems.scene.isDirty = false;

  // Restore editor camera if saved
  if (data.editorCamera) {
    const cam = data.editorCamera;
    subsystems.editorCamera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    if (cam.target) {
      subsystems.orbitControls.target.set(cam.target[0], cam.target[1], cam.target[2]);
    }
    if (cam.fov) subsystems.editorCamera.fov = cam.fov;
    subsystems.editorCamera.updateProjectionMatrix();
    subsystems.orbitControls.update();
  }

  // Run one ECS tick so EnvironmentSystem initialises CSM and patches all material defines,
  // then pre-compile every shader program before the first visible render frame.
  subsystems.engine.ecs.update(0);
  const fluxRenderer = subsystems.engine.getSubsystem<any>('renderer');
  if (fluxRenderer?.renderer && fluxRenderer?.scene) {
    try {
      fluxRenderer.renderer.compile(fluxRenderer.scene, subsystems.editorCamera);
    } catch (_e) {
      // Non-fatal — rendering will still work, just without the pre-warm benefit
    }
  }

  log(`Scene loaded: ${data.name} (${subsystems.engine.ecs.entityCount} entities)`, 'system');
}

/** Save the current scene to disk. */
export async function saveScene(
  subsystems: EngineSubsystems,
  scenePath: string,
  log: LogFn,
): Promise<void> {
  const resolvedPath = projectManager.resolvePath(scenePath);
  const data = serializeScene(
    subsystems.scene,
    subsystems.engine,
    subsystems.editorCamera,
    subsystems.orbitControls.target,
  );

  const savedNative = await saveSceneNative(resolvedPath, data as any);
  if (!savedNative) throw new Error(`[SceneService] save_scene Tauri command failed for: ${resolvedPath}`);
  log(`Scene saved: ${scenePath}`, 'system');
}
