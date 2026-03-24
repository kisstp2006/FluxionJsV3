// ============================================================
// FluxionJS V3 — Settings Bindings
// Connects SettingsRegistry values to live engine subsystems.
// Call bind() once after engine init, dispose() on teardown.
// ============================================================

import * as THREE from 'three';
import { SettingsRegistry } from './SettingsRegistry';
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
  const get = <T>(k: string) => SettingsRegistry.get<T>(k);

  // ── Renderer ──
  const r = sys.renderer.renderer;
  r.setPixelRatio(Math.min(get<number>('renderer.pixelRatio'), window.devicePixelRatio));
  r.toneMapping = TONE_MAP[get<string>('renderer.toneMapping')] ?? THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = get<number>('renderer.toneMappingExposure');

  // Shadows
  const shadowsEnabled = get<boolean>('renderer.shadows.enabled');
  r.shadowMap.enabled = shadowsEnabled;
  // Shadow map size is applied per-light, not globally on the renderer.
  // Store it so lights can read it when created.

  // ── Post Processing ──
  const pp = sys.renderer.postProcessing;
  pp.config.bloom = {
    ...pp.config.bloom,
    enabled: get<boolean>('renderer.postProcessing.bloom'),
    strength: get<number>('renderer.postProcessing.bloomIntensity'),
  };
  pp.config.vignette = {
    ...pp.config.vignette,
    enabled: get<boolean>('renderer.postProcessing.vignette'),
  };
  // FXAA is not yet wired in PostProcessing pipeline — store flag for future use

  // ── Viewport ──
  const cam = sys.editorCamera;
  cam.fov = get<number>('editor.viewport.fov');
  cam.near = get<number>('editor.viewport.nearClip');
  cam.far = get<number>('editor.viewport.farClip');
  cam.updateProjectionMatrix();

  const bgColor = get<string>('editor.viewport.backgroundColor');
  sys.renderer.scene.background = new THREE.Color(bgColor);
  if (sys.renderer.scene.fog instanceof THREE.FogExp2) {
    sys.renderer.scene.fog.color.set(bgColor);
  }

  sys.orbitControls.dampingFactor = get<number>('editor.viewport.cameraDamping');

  // ── Audio ──
  sys.audio.setMasterVolume(get<number>('audio.masterVolume'));

  // ── Physics ──
  const gravity = get<number>('physics.gravity');
  sys.physics.setGravity(0, gravity, 0);
  sys.engine.time.fixedDeltaTime = get<number>('physics.fixedTimestep');

  // ── Editor ──
  undoManager.maxHistory = get<number>('editor.undoHistorySize');

  // ── Gizmos ──
  sys.gizmoService.setTranslationSnap(get<number>('editor.gizmos.snapTranslation'));
  sys.gizmoService.setRotationSnap(THREE.MathUtils.degToRad(get<number>('editor.gizmos.snapRotation')));
  sys.gizmoService.setScaleSnap(get<number>('editor.gizmos.snapScale'));
}

/** Apply a single changed setting to the engine. */
function applySingle(sys: EngineSubsystems, key: string, value: unknown): void {
  const r = sys.renderer.renderer;
  const pp = sys.renderer.postProcessing;

  switch (key) {
    // ── Renderer ──
    case 'renderer.pixelRatio':
      r.setPixelRatio(Math.min(value as number, window.devicePixelRatio));
      break;
    case 'renderer.toneMapping':
      r.toneMapping = TONE_MAP[value as string] ?? THREE.ACESFilmicToneMapping;
      break;
    case 'renderer.toneMappingExposure':
      r.toneMappingExposure = value as number;
      break;

    // ── Shadows ──
    case 'renderer.shadows.enabled':
      r.shadowMap.enabled = value as boolean;
      r.shadowMap.needsUpdate = true;
      break;

    // ── Post Processing ──
    case 'renderer.postProcessing.bloom':
      pp.config.bloom = { ...pp.config.bloom, enabled: value as boolean };
      break;
    case 'renderer.postProcessing.bloomIntensity':
      pp.config.bloom = { ...pp.config.bloom, strength: value as number };
      break;
    case 'renderer.postProcessing.vignette':
      pp.config.vignette = { ...pp.config.vignette, enabled: value as boolean };
      break;

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
      // Handled by the focus listener in bind()
      break;

    // ── Physics ──
    case 'physics.gravity':
      sys.physics.setGravity(0, value as number, 0);
      break;
    case 'physics.fixedTimestep':
      sys.engine.time.fixedDeltaTime = value as number;
      break;

    // ── Editor ──
    case 'editor.undoHistorySize':
      undoManager.maxHistory = value as number;
      break;

    // ── Gizmos ──
    case 'editor.gizmos.size':
      // GizmoRenderer uses a constant scale; future: pass to GizmoService
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

/**
 * Bind all editor settings to engine subsystems.
 * Call once after engine init. Returns nothing — call dispose() to unbind.
 */
export function bindSettings(sys: EngineSubsystems): void {
  dispose();

  // Apply all current values
  applyAll(sys);

  // Listen for changes and apply them in real-time
  _unsub = SettingsRegistry.on((event) => {
    if (event.type === 'changed' || event.type === 'reset') {
      applySingle(sys, event.key, event.value);
    }
    if (event.type === 'loaded') {
      // Full reload — reapply everything
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

  // Store original unsub and extend it
  const origUnsub = _unsub;
  _unsub = () => {
    origUnsub();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** Unbind all settings listeners. */
export function dispose(): void {
  _unsub?.();
  _unsub = null;
}
