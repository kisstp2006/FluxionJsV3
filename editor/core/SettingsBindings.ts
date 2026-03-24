// ============================================================
// FluxionJS V3 — Settings Bindings
// Connects SettingsRegistry (editor) and ProjectSettingsRegistry
// (project) values to live engine subsystems.
// Call bind() once after engine init, dispose() on teardown.
// ============================================================

import * as THREE from 'three';
import { SettingsRegistry } from './SettingsRegistry';
import { ProjectSettingsRegistry } from './ProjectSettingsRegistry';
import { EngineSubsystems } from './EditorEngine';
import { undoManager } from './UndoService';

const TONE_MAP: Record<string, THREE.ToneMapping> = {
  None: THREE.NoToneMapping,
  Linear: THREE.LinearToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
};

let _unsub: (() => void) | null = null;

/** Apply all current settings values to the engine subsystems once. */
function applyAll(sys: EngineSubsystems): void {
  const ed = <T>(k: string) => SettingsRegistry.get<T>(k);
  const proj = <T>(k: string) => ProjectSettingsRegistry.get<T>(k);

  // ── Renderer (from Project Settings) ──
  const r = sys.renderer.renderer;
  r.setPixelRatio(Math.min(proj<number>('project.rendering.maxPixelRatio'), window.devicePixelRatio));
  r.toneMapping = TONE_MAP[proj<string>('project.rendering.toneMapping')] ?? THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = proj<number>('project.rendering.exposure');

  // Shadows (from Project Settings)
  r.shadowMap.enabled = proj<boolean>('project.rendering.shadows');

  // ── Post Processing (from Project Settings) ──
  const pp = sys.renderer.postProcessing;
  pp.config.bloom = {
    ...pp.config.bloom,
    enabled: proj<boolean>('project.rendering.bloom'),
    strength: proj<number>('project.rendering.bloomIntensity'),
  };
  pp.config.vignette = {
    ...pp.config.vignette,
    enabled: proj<boolean>('project.rendering.vignette'),
  };

  // ── Viewport (from Editor Settings) ──
  const cam = sys.editorCamera;
  cam.fov = ed<number>('editor.viewport.fov');
  cam.near = ed<number>('editor.viewport.nearClip');
  cam.far = ed<number>('editor.viewport.farClip');
  cam.updateProjectionMatrix();

  const bgColor = ed<string>('editor.viewport.backgroundColor');
  sys.renderer.scene.background = new THREE.Color(bgColor);
  if (sys.renderer.scene.fog instanceof THREE.FogExp2) {
    sys.renderer.scene.fog.color.set(bgColor);
  }

  sys.orbitControls.dampingFactor = ed<number>('editor.viewport.cameraDamping');

  // ── Audio (editor preview volume from Editor Settings) ──
  sys.audio.setMasterVolume(ed<number>('audio.masterVolume'));

  // ── Physics (from Project Settings) ──
  const gy = proj<number>('project.physics.gravityY');
  const gx = proj<number>('project.physics.gravityX');
  const gz = proj<number>('project.physics.gravityZ');
  sys.physics.setGravity(gx, gy, gz);
  sys.engine.time.fixedDeltaTime = proj<number>('project.physics.fixedTimestep');

  // ── Editor (from Editor Settings) ──
  undoManager.maxHistory = ed<number>('editor.undoHistorySize');

  // ── Gizmos (from Editor Settings) ──
  sys.gizmoService.setTranslationSnap(ed<number>('editor.gizmos.snapTranslation'));
  sys.gizmoService.setRotationSnap(THREE.MathUtils.degToRad(ed<number>('editor.gizmos.snapRotation')));
  sys.gizmoService.setScaleSnap(ed<number>('editor.gizmos.snapScale'));
}

/** Apply a single changed editor setting to the engine. */
function applyEditorSetting(sys: EngineSubsystems, key: string, value: unknown): void {
  switch (key) {
    // ── Viewport / Camera ──
    case 'editor.viewport.fov':
      sys.editorCamera.fov = value as number;
      sys.editorCamera.updateProjectionMatrix();
      break;
    case 'editor.viewport.nearClip':
      sys.editorCamera.near = value as number;
      sys.editorCamera.updateProjectionMatrix();
      break;
    case 'editor.viewport.farClip':
      sys.editorCamera.far = value as number;
      sys.editorCamera.updateProjectionMatrix();
      break;
    case 'editor.viewport.backgroundColor': {
      const color = new THREE.Color(value as string);
      sys.renderer.scene.background = color;
      if (sys.renderer.scene.fog instanceof THREE.FogExp2) {
        sys.renderer.scene.fog.color.copy(color);
      }
      break;
    }
    case 'editor.viewport.cameraDamping':
      sys.orbitControls.dampingFactor = value as number;
      break;

    // ── Audio ──
    case 'audio.masterVolume':
      sys.audio.setMasterVolume(value as number);
      break;
    case 'audio.muteOnUnfocus':
      break;

    // ── Editor ──
    case 'editor.undoHistorySize':
      undoManager.maxHistory = value as number;
      break;

    // ── Gizmos ──
    case 'editor.gizmos.size':
      break;
    case 'editor.gizmos.snapTranslation':
      sys.gizmoService.setTranslationSnap(value as number);
      break;
    case 'editor.gizmos.snapRotation':
      sys.gizmoService.setRotationSnap(THREE.MathUtils.degToRad(value as number));
      break;
    case 'editor.gizmos.snapScale':
      sys.gizmoService.setScaleSnap(value as number);
      break;
  }
}

/** Apply a single changed project setting to the engine. */
function applyProjectSetting(sys: EngineSubsystems, key: string, value: unknown): void {
  const r = sys.renderer.renderer;
  const pp = sys.renderer.postProcessing;

  switch (key) {
    // ── Renderer ──
    case 'project.rendering.maxPixelRatio':
      r.setPixelRatio(Math.min(value as number, window.devicePixelRatio));
      break;
    case 'project.rendering.toneMapping':
      r.toneMapping = TONE_MAP[value as string] ?? THREE.ACESFilmicToneMapping;
      break;
    case 'project.rendering.exposure':
      r.toneMappingExposure = value as number;
      break;

    // ── Shadows ──
    case 'project.rendering.shadows':
      r.shadowMap.enabled = value as boolean;
      r.shadowMap.needsUpdate = true;
      break;

    // ── Post Processing ──
    case 'project.rendering.bloom':
      pp.config.bloom = { ...pp.config.bloom, enabled: value as boolean };
      break;
    case 'project.rendering.bloomIntensity':
      pp.config.bloom = { ...pp.config.bloom, strength: value as number };
      break;
    case 'project.rendering.vignette':
      pp.config.vignette = { ...pp.config.vignette, enabled: value as boolean };
      break;

    // ── Physics ──
    case 'project.physics.gravityX':
    case 'project.physics.gravityY':
    case 'project.physics.gravityZ': {
      const gx = ProjectSettingsRegistry.get<number>('project.physics.gravityX');
      const gy = ProjectSettingsRegistry.get<number>('project.physics.gravityY');
      const gz = ProjectSettingsRegistry.get<number>('project.physics.gravityZ');
      sys.physics.setGravity(gx, gy, gz);
      break;
    }
    case 'project.physics.fixedTimestep':
      sys.engine.time.fixedDeltaTime = value as number;
      break;
  }
}

/**
 * Bind all editor + project settings to engine subsystems.
 * Call once after engine init. Returns nothing — call dispose() to unbind.
 */
export function bindSettings(sys: EngineSubsystems): void {
  dispose();

  // Snapshot restart-required values so we can detect changes
  SettingsRegistry.snapshotRestartValues();
  ProjectSettingsRegistry.snapshotRestartValues();

  // Apply all current values
  applyAll(sys);

  // Listen for editor settings changes
  const unsubEditor = SettingsRegistry.on((event) => {
    if (event.type === 'changed' || event.type === 'reset') {
      applyEditorSetting(sys, event.key, event.value);
    }
    if (event.type === 'loaded') {
      applyAll(sys);
    }
  });

  // Listen for project settings changes
  const unsubProject = ProjectSettingsRegistry.on((event) => {
    if (event.type === 'changed' || event.type === 'reset') {
      applyProjectSetting(sys, event.key, event.value);
    }
    if (event.type === 'loaded') {
      applyAll(sys);
    }
  });

  // ── Audio mute on unfocus ──
  const onVisibility = () => {
    if (SettingsRegistry.get<boolean>('audio.muteOnUnfocus')) {
      if (document.hidden) {
        sys.audio.setMasterVolume(0);
      } else {
        sys.audio.setMasterVolume(SettingsRegistry.get<number>('audio.masterVolume'));
      }
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  _unsub = () => {
    unsubEditor();
    unsubProject();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** Unbind all settings listeners. */
export function dispose(): void {
  _unsub?.();
  _unsub = null;
}
