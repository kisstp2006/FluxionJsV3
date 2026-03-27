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
import { ScriptSystem } from '../../src/core/ScriptSystem';

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
  // Only apply if no EnvironmentComponent is overriding
  const pp = sys.renderer.postProcessing;
  if (!pp.environmentOverride) {
    pp.config.bloom = {
      ...pp.config.bloom,
      enabled: proj<boolean>('project.rendering.bloom'),
      strength: proj<number>('project.rendering.bloomIntensity'),
      threshold: proj<number>('project.rendering.bloomThreshold'),
      radius: proj<number>('project.rendering.bloomRadius'),
    };
    pp.config.vignette = {
      ...pp.config.vignette,
      enabled: proj<boolean>('project.rendering.vignette'),
      intensity: proj<number>('project.rendering.vignetteIntensity'),
      roundness: proj<number>('project.rendering.vignetteRoundness'),
    };
    pp.config.ssao = {
      ...pp.config.ssao,
      enabled: proj<boolean>('project.rendering.ssao'),
      radius: proj<number>('project.rendering.ssaoRadius'),
      intensity: proj<number>('project.rendering.ssaoIntensity'),
    };
    pp.config.dof = {
      ...pp.config.dof,
      enabled: proj<boolean>('project.rendering.dof'),
      focusDistance: proj<number>('project.rendering.dofFocusDistance'),
      aperture: proj<number>('project.rendering.dofAperture'),
      maxBlur: proj<number>('project.rendering.dofMaxBlur'),
    };
    pp.config.ssr = {
      ...pp.config.ssr,
      enabled: proj<boolean>('project.rendering.ssr'),
      maxDistance: proj<number>('project.rendering.ssrMaxDistance'),
      opacity: proj<number>('project.rendering.ssrOpacity'),
    };
    pp.config.filmGrain = proj<number>('project.rendering.filmGrain');
    pp.config.chromaticAberration = proj<number>('project.rendering.chromaticAberration');
  }

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

  // ── Scripting runtime (from Project Settings) ──
  const scriptSys = sys.engine.ecs.getSystem<ScriptSystem>('ScriptSystem');
  if (scriptSys) scriptSys.updateTimeout = proj<number>('scripting.runtime.timeout');

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

    // ── Post Processing ── (skip if EnvironmentComponent overrides)
    case 'project.rendering.bloom':
      if (!pp.environmentOverride) pp.config.bloom = { ...pp.config.bloom, enabled: value as boolean };
      break;
    case 'project.rendering.bloomIntensity':
      if (!pp.environmentOverride) pp.config.bloom = { ...pp.config.bloom, strength: value as number };
      break;
    case 'project.rendering.bloomThreshold':
      if (!pp.environmentOverride) pp.config.bloom = { ...pp.config.bloom, threshold: value as number };
      break;
    case 'project.rendering.bloomRadius':
      if (!pp.environmentOverride) pp.config.bloom = { ...pp.config.bloom, radius: value as number };
      break;
    case 'project.rendering.vignette':
      if (!pp.environmentOverride) pp.config.vignette = { ...pp.config.vignette, enabled: value as boolean };
      break;
    case 'project.rendering.vignetteIntensity':
      if (!pp.environmentOverride) pp.config.vignette = { ...pp.config.vignette, intensity: value as number };
      break;
    case 'project.rendering.vignetteRoundness':
      if (!pp.environmentOverride) pp.config.vignette = { ...pp.config.vignette, roundness: value as number };
      break;
    case 'project.rendering.ssao':
      if (!pp.environmentOverride) pp.config.ssao = { ...pp.config.ssao, enabled: value as boolean };
      break;
    case 'project.rendering.ssaoRadius':
      if (!pp.environmentOverride) pp.config.ssao = { ...pp.config.ssao, radius: value as number };
      break;
    case 'project.rendering.ssaoIntensity':
      if (!pp.environmentOverride) pp.config.ssao = { ...pp.config.ssao, intensity: value as number };
      break;
    case 'project.rendering.dof':
      if (!pp.environmentOverride) pp.config.dof = { ...pp.config.dof, enabled: value as boolean };
      break;
    case 'project.rendering.dofFocusDistance':
      if (!pp.environmentOverride) pp.config.dof = { ...pp.config.dof, focusDistance: value as number };
      break;
    case 'project.rendering.dofAperture':
      if (!pp.environmentOverride) pp.config.dof = { ...pp.config.dof, aperture: value as number };
      break;
    case 'project.rendering.dofMaxBlur':
      if (!pp.environmentOverride) pp.config.dof = { ...pp.config.dof, maxBlur: value as number };
      break;
    case 'project.rendering.ssr':
      if (!pp.environmentOverride) pp.config.ssr = { ...pp.config.ssr, enabled: value as boolean };
      break;
    case 'project.rendering.ssrMaxDistance':
      if (!pp.environmentOverride) pp.config.ssr = { ...pp.config.ssr, maxDistance: value as number };
      break;
    case 'project.rendering.ssrOpacity':
      if (!pp.environmentOverride) pp.config.ssr = { ...pp.config.ssr, opacity: value as number };
      break;
    case 'project.rendering.filmGrain':
      if (!pp.environmentOverride) pp.config.filmGrain = value as number;
      break;
    case 'project.rendering.chromaticAberration':
      if (!pp.environmentOverride) pp.config.chromaticAberration = value as number;
      break;

    // ── Scripting ── (relay editor settings to the script editor window)
    case 'scripting.editor.fontSize':
    case 'scripting.editor.theme':
    case 'scripting.editor.fontFamily':
    case 'scripting.editor.minimap':
    case 'scripting.editor.wordWrap':
    case 'scripting.editor.autoSave':
    case 'scripting.runtime.hotReload':
    case 'scripting.runtime.timeout': {
      const proj = <T>(k: string) => ProjectSettingsRegistry.get<T>(k);
      const settings = {
        fontSize:    proj<number>('scripting.editor.fontSize'),
        theme:       proj<string>('scripting.editor.theme'),
        fontFamily:  proj<string>('scripting.editor.fontFamily'),
        minimap:     proj<boolean>('scripting.editor.minimap'),
        wordWrap:    proj<boolean>('scripting.editor.wordWrap'),
        autoSave:    proj<boolean>('scripting.editor.autoSave'),
        hotReload:   proj<boolean>('scripting.runtime.hotReload'),
        timeout:     proj<number>('scripting.runtime.timeout'),
      };
      (window as any).fluxionAPI?.sendScriptSettings(settings);
      // Apply runtime timeout directly to ScriptSystem
      if (key === 'scripting.runtime.timeout') {
        const scriptSys = sys.engine.ecs.getSystem<ScriptSystem>('ScriptSystem');
        if (scriptSys) scriptSys.updateTimeout = value as number;
      }
      break;
    }

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
