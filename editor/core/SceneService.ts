// ============================================================
// FluxionJS V3 — Scene Service
// Scene load/save operations — uses IFileSystem abstraction
// ============================================================

import { EngineSubsystems, LogFn } from './EditorEngine';
import { serializeScene } from '../../src/project/SceneSerializer';
import { projectManager } from '../../src/project/ProjectManager';
import { getFileSystem } from '../../src/filesystem';

/** Load a scene file into the engine subsystems. */
export async function loadProjectScene(
  subsystems: EngineSubsystems,
  scenePath: string,
  log: LogFn,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const { deserializeScene } = await import('../../src/project/SceneSerializer');
  const fs = getFileSystem();

  const content = await fs.readFile(scenePath);
  const data = JSON.parse(content);

  // Await all deferred model/material loads before returning — prevents staggered shader-compile stutter
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
  const fs = getFileSystem();
  await fs.writeFile(resolvedPath, JSON.stringify(data, null, 2));
  log(`Scene saved: ${scenePath}`, 'system');
}
