// ============================================================
// FluxionJS V3 — Default Settings Registration
// Engine and editor modules register their settings here at import time.
// Each module can also call SettingsRegistry.register() directly.
// ============================================================

import { SettingsRegistry, SettingDescriptor } from './SettingsRegistry';

// ── Category Registration ──

SettingsRegistry.registerCategory('Renderer', { label: 'Renderer', icon: '🖥', order: 10 });
SettingsRegistry.registerCategory('Renderer/Shadows', { label: 'Shadows', icon: '🌑', order: 11 });
SettingsRegistry.registerCategory('Renderer/Post Processing', { label: 'Post Processing', icon: '✨', order: 12 });
SettingsRegistry.registerCategory('Editor', { label: 'Editor', icon: '⚙', order: 20 });
SettingsRegistry.registerCategory('Editor/Viewport', { label: 'Viewport', icon: '🔲', order: 21 });
SettingsRegistry.registerCategory('Editor/Gizmos', { label: 'Gizmos', icon: '✥', order: 22 });
SettingsRegistry.registerCategory('Physics', { label: 'Physics', icon: '⊛', order: 30 });
SettingsRegistry.registerCategory('Audio', { label: 'Audio', icon: '🔊', order: 40 });

// ── Renderer Settings ──

const rendererSettings: SettingDescriptor[] = [
  {
    key: 'renderer.antialias',
    label: 'Antialiasing',
    description: 'Enable MSAA antialiasing for smoother edges. Requires restart.',
    type: 'boolean',
    defaultValue: true,
    category: 'Renderer',
    order: 1,
  },
  {
    key: 'renderer.pixelRatio',
    label: 'Pixel Ratio',
    description: 'Rendering resolution multiplier. Higher values improve quality but decrease performance.',
    type: 'slider',
    defaultValue: 1,
    category: 'Renderer',
    order: 2,
    min: 0.5,
    max: 2,
    step: 0.25,
  },
  {
    key: 'renderer.toneMapping',
    label: 'Tone Mapping',
    description: 'HDR to LDR tone mapping algorithm.',
    type: 'select',
    defaultValue: 'ACES',
    category: 'Renderer',
    order: 3,
    options: [
      { value: 'None', label: 'None' },
      { value: 'Linear', label: 'Linear' },
      { value: 'Reinhard', label: 'Reinhard' },
      { value: 'ACES', label: 'ACES Filmic' },
      { value: 'AgX', label: 'AgX' },
    ],
  },
  {
    key: 'renderer.toneMappingExposure',
    label: 'Exposure',
    description: 'Tone mapping exposure level.',
    type: 'slider',
    defaultValue: 1.2,
    category: 'Renderer',
    order: 4,
    min: 0.1,
    max: 5,
    step: 0.1,
  },
  {
    key: 'renderer.shadows.enabled',
    label: 'Shadows',
    description: 'Enable real-time shadow mapping.',
    type: 'boolean',
    defaultValue: true,
    category: 'Renderer/Shadows',
    order: 1,
  },
  {
    key: 'renderer.shadows.mapSize',
    label: 'Shadow Map Size',
    description: 'Resolution of shadow maps in pixels. Higher values produce sharper shadows.',
    type: 'select',
    defaultValue: '2048',
    category: 'Renderer/Shadows',
    order: 2,
    options: [
      { value: '512', label: '512' },
      { value: '1024', label: '1024' },
      { value: '2048', label: '2048' },
      { value: '4096', label: '4096' },
    ],
  },
  {
    key: 'renderer.postProcessing.bloom',
    label: 'Bloom',
    description: 'Enable bloom post-processing effect for bright areas.',
    type: 'boolean',
    defaultValue: true,
    category: 'Renderer/Post Processing',
    order: 1,
  },
  {
    key: 'renderer.postProcessing.bloomIntensity',
    label: 'Bloom Intensity',
    description: 'Strength of the bloom effect.',
    type: 'slider',
    defaultValue: 0.5,
    category: 'Renderer/Post Processing',
    order: 2,
    min: 0,
    max: 3,
    step: 0.1,
  },
  {
    key: 'renderer.postProcessing.fxaa',
    label: 'FXAA',
    description: 'Enable FXAA post-processing antialiasing pass.',
    type: 'boolean',
    defaultValue: true,
    category: 'Renderer/Post Processing',
    order: 3,
  },
  {
    key: 'renderer.postProcessing.vignette',
    label: 'Vignette',
    description: 'Enable vignette darkening around screen edges.',
    type: 'boolean',
    defaultValue: false,
    category: 'Renderer/Post Processing',
    order: 4,
  },
];

// ── Editor Settings ──

const editorSettings: SettingDescriptor[] = [
  {
    key: 'editor.autoSave',
    label: 'Auto Save',
    description: 'Automatically save the scene when changes are detected.',
    type: 'boolean',
    defaultValue: false,
    category: 'Editor',
    order: 1,
  },
  {
    key: 'editor.autoSaveInterval',
    label: 'Auto Save Interval',
    description: 'Interval between auto-saves in seconds.',
    type: 'number',
    defaultValue: 120,
    category: 'Editor',
    order: 2,
    min: 10,
    max: 600,
    step: 10,
  },
  {
    key: 'editor.undoHistorySize',
    label: 'Undo History Size',
    description: 'Maximum number of undo steps to keep in memory.',
    type: 'number',
    defaultValue: 100,
    category: 'Editor',
    order: 3,
    min: 10,
    max: 1000,
    step: 10,
  },
  {
    key: 'editor.viewport.fov',
    label: 'Field of View',
    description: 'Editor camera field of view in degrees.',
    type: 'slider',
    defaultValue: 60,
    category: 'Editor/Viewport',
    order: 1,
    min: 30,
    max: 120,
    step: 1,
  },
  {
    key: 'editor.viewport.nearClip',
    label: 'Near Clip',
    description: 'Editor camera near clipping plane distance.',
    type: 'number',
    defaultValue: 0.1,
    category: 'Editor/Viewport',
    order: 2,
    min: 0.01,
    max: 10,
    step: 0.01,
  },
  {
    key: 'editor.viewport.farClip',
    label: 'Far Clip',
    description: 'Editor camera far clipping plane distance.',
    type: 'number',
    defaultValue: 2000,
    category: 'Editor/Viewport',
    order: 3,
    min: 100,
    max: 50000,
    step: 100,
  },
  {
    key: 'editor.viewport.backgroundColor',
    label: 'Background Color',
    description: 'Viewport background color.',
    type: 'color',
    defaultValue: '#0a0e17',
    category: 'Editor/Viewport',
    order: 4,
  },
  {
    key: 'editor.viewport.gridSize',
    label: 'Grid Size',
    description: 'Size of the editor grid in world units.',
    type: 'number',
    defaultValue: 100,
    category: 'Editor/Viewport',
    order: 5,
    min: 10,
    max: 1000,
    step: 10,
  },
  {
    key: 'editor.viewport.cameraDamping',
    label: 'Camera Damping',
    description: 'Orbit camera damping factor. Higher values make camera smoother.',
    type: 'slider',
    defaultValue: 0.08,
    category: 'Editor/Viewport',
    order: 6,
    min: 0,
    max: 0.3,
    step: 0.01,
  },
  {
    key: 'editor.gizmos.size',
    label: 'Gizmo Size',
    description: 'Scale of transform gizmos in the viewport.',
    type: 'slider',
    defaultValue: 1,
    category: 'Editor/Gizmos',
    order: 1,
    min: 0.5,
    max: 3,
    step: 0.1,
  },
  {
    key: 'editor.gizmos.snapTranslation',
    label: 'Snap Translation',
    description: 'Default translation snap increment in world units.',
    type: 'number',
    defaultValue: 1,
    category: 'Editor/Gizmos',
    order: 2,
    min: 0.01,
    max: 100,
    step: 0.25,
  },
  {
    key: 'editor.gizmos.snapRotation',
    label: 'Snap Rotation',
    description: 'Default rotation snap increment in degrees.',
    type: 'number',
    defaultValue: 15,
    category: 'Editor/Gizmos',
    order: 3,
    min: 1,
    max: 90,
    step: 1,
  },
  {
    key: 'editor.gizmos.snapScale',
    label: 'Snap Scale',
    description: 'Default scale snap increment.',
    type: 'number',
    defaultValue: 0.25,
    category: 'Editor/Gizmos',
    order: 4,
    min: 0.01,
    max: 10,
    step: 0.05,
  },
];

// ── Physics Settings ──

const physicsSettings: SettingDescriptor[] = [
  {
    key: 'physics.gravity',
    label: 'Gravity',
    description: 'Gravitational acceleration (Y-axis, negative = downward).',
    type: 'number',
    defaultValue: -9.81,
    category: 'Physics',
    order: 1,
    min: -100,
    max: 100,
    step: 0.1,
  },
  {
    key: 'physics.fixedTimestep',
    label: 'Fixed Timestep',
    description: 'Physics simulation timestep in seconds. Lower values are more precise but slower.',
    type: 'number',
    defaultValue: 1 / 60,
    category: 'Physics',
    order: 2,
    min: 0.001,
    max: 0.1,
    step: 0.001,
  },
  {
    key: 'physics.debugDraw',
    label: 'Debug Draw',
    description: 'Show physics collider wireframes in the viewport.',
    type: 'boolean',
    defaultValue: false,
    category: 'Physics',
    order: 3,
  },
];

// ── Audio Settings ──

const audioSettings: SettingDescriptor[] = [
  {
    key: 'audio.masterVolume',
    label: 'Master Volume',
    description: 'Global audio volume multiplier.',
    type: 'slider',
    defaultValue: 1,
    category: 'Audio',
    order: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'audio.muteOnUnfocus',
    label: 'Mute on Unfocus',
    description: 'Mute audio when the editor window loses focus.',
    type: 'boolean',
    defaultValue: true,
    category: 'Audio',
    order: 2,
  },
];

// ── Register All ──

export function registerDefaultSettings(): void {
  SettingsRegistry.registerMany(rendererSettings);
  SettingsRegistry.registerMany(editorSettings);
  SettingsRegistry.registerMany(physicsSettings);
  SettingsRegistry.registerMany(audioSettings);
}
