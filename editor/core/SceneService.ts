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
): Promise<void> {
  const { deserializeScene } = await import('../../src/project/SceneSerializer');
  const fs = getFileSystem();

  const content = await fs.readFile(scenePath);
  const data = JSON.parse(content);
  deserializeScene(subsystems.engine, data, subsystems.scene);
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

  log(`Scene loaded: ${data.name} (${[...subsystems.engine.ecs.getAllEntities()].length} entities)`, 'system');
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
