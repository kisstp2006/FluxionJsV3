// ============================================================
// FluxionJS V3 — Default Project Settings Registration
// Per-project settings stored in .fluxproj — Stride / ezEngine inspired.
// Categories: General, Rendering, Physics, Audio, Scene, Build.
// ============================================================

import { SettingDescriptor } from './SettingsRegistry';
import { ProjectSettingsRegistry } from './ProjectSettingsRegistry';
import { Icons } from '../ui/Icons';

// ── Categories ──

ProjectSettingsRegistry.registerCategory('General', { label: 'General', icon: Icons.clipboard, order: 10 });
ProjectSettingsRegistry.registerCategory('Rendering', { label: 'Rendering', icon: Icons.monitor, order: 20 });
ProjectSettingsRegistry.registerCategory('Rendering/Quality', { label: 'Quality', icon: Icons.star, order: 21 });
ProjectSettingsRegistry.registerCategory('Physics', { label: 'Physics', icon: Icons.physics, order: 30 });
ProjectSettingsRegistry.registerCategory('Audio', { label: 'Audio', icon: Icons.audio, order: 40 });
ProjectSettingsRegistry.registerCategory('Scene', { label: 'Scene Defaults', icon: Icons.globe, order: 50 });
ProjectSettingsRegistry.registerCategory('Build', { label: 'Build / Export', icon: Icons.prefab, order: 60 });

// ── General ──

const generalSettings: SettingDescriptor[] = [
  {
    key: 'project.name',
    label: 'Project Name',
    description: 'Display name of the project.',
    type: 'string',
    defaultValue: 'Untitled',
    category: 'General',
    order: 1,
  },
  {
    key: 'project.version',
    label: 'Version',
    description: 'Semantic version of the project.',
    type: 'string',
    defaultValue: '1.0.0',
    category: 'General',
    order: 2,
  },
  {
    key: 'project.defaultScene',
    label: 'Default Scene',
    description: 'Relative path to the scene loaded on startup.',
    type: 'string',
    defaultValue: 'Scenes/Main.fluxscene',
    category: 'General',
    order: 3,
  },
  {
    key: 'project.targetFps',
    label: 'Target FPS',
    description: 'Target frame rate for the game runtime (0 = unlimited).',
    type: 'number',
    defaultValue: 60,
    category: 'General',
    order: 4,
    min: 0,
    max: 240,
    step: 1,
  },
];

// ── Rendering ──

const renderingSettings: SettingDescriptor[] = [
  {
    key: 'project.rendering.shadows',
    label: 'Shadows',
    description: 'Enable shadow mapping in game builds.',
    type: 'boolean',
    defaultValue: true,
    category: 'Rendering',
    order: 1,
  },
  {
    key: 'project.rendering.shadowMapSize',
    label: 'Shadow Map Size',
    description: 'Default shadow map resolution for lights. Requires restart.',
    type: 'select',
    defaultValue: '2048',
    category: 'Rendering',
    order: 2,
    requiresRestart: true,
    options: [
      { value: '512', label: '512' },
      { value: '1024', label: '1024' },
      { value: '2048', label: '2048' },
      { value: '4096', label: '4096' },
    ],
  },
  {
    key: 'project.rendering.toneMapping',
    label: 'Tone Mapping',
    description: 'Default HDR tone mapping algorithm.',
    type: 'select',
    defaultValue: 'ACES',
    category: 'Rendering',
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
    key: 'project.rendering.exposure',
    label: 'Exposure',
    description: 'Default tone mapping exposure.',
    type: 'slider',
    defaultValue: 1.2,
    category: 'Rendering',
    order: 4,
    min: 0.1,
    max: 5,
    step: 0.1,
  },
  {
    key: 'project.rendering.maxPixelRatio',
    label: 'Max Pixel Ratio',
    description: 'Maximum rendering pixel ratio in game builds.',
    type: 'slider',
    defaultValue: 2,
    category: 'Rendering/Quality',
    order: 1,
    min: 0.5,
    max: 3,
    step: 0.25,
  },
  {
    key: 'project.rendering.antialias',
    label: 'Antialiasing',
    description: 'Enable MSAA antialiasing in game builds. Requires restart.',
    type: 'boolean',
    defaultValue: true,
    category: 'Rendering/Quality',
    order: 2,
    requiresRestart: true,
  },
  {
    key: 'project.rendering.bloom',
    label: 'Bloom',
    description: 'Enable bloom post-processing in game builds.',
    type: 'boolean',
    defaultValue: true,
    category: 'Rendering/Quality',
    order: 3,
  },
  {
    key: 'project.rendering.bloomIntensity',
    label: 'Bloom Intensity',
    description: 'Default bloom strength.',
    type: 'slider',
    defaultValue: 0.5,
    category: 'Rendering/Quality',
    order: 4,
    min: 0,
    max: 3,
    step: 0.1,
  },
  {
    key: 'project.rendering.fxaa',
    label: 'FXAA',
    description: 'Enable FXAA pass in game builds. Requires restart.',
    type: 'boolean',
    defaultValue: true,
    category: 'Rendering/Quality',
    order: 5,
    requiresRestart: true,
  },
  {
    key: 'project.rendering.vignette',
    label: 'Vignette',
    description: 'Enable vignette post-processing in game builds.',
    type: 'boolean',
    defaultValue: false,
    category: 'Rendering/Quality',
    order: 6,
  },
];

// ── Physics ──

const physicsSettings: SettingDescriptor[] = [
  {
    key: 'project.physics.gravityX',
    label: 'Gravity X',
    description: 'World gravity X component.',
    type: 'number',
    defaultValue: 0,
    category: 'Physics',
    order: 1,
    min: -100,
    max: 100,
    step: 0.1,
  },
  {
    key: 'project.physics.gravityY',
    label: 'Gravity Y',
    description: 'World gravity Y component (negative = down).',
    type: 'number',
    defaultValue: -9.81,
    category: 'Physics',
    order: 2,
    min: -100,
    max: 100,
    step: 0.1,
  },
  {
    key: 'project.physics.gravityZ',
    label: 'Gravity Z',
    description: 'World gravity Z component.',
    type: 'number',
    defaultValue: 0,
    category: 'Physics',
    order: 3,
    min: -100,
    max: 100,
    step: 0.1,
  },
  {
    key: 'project.physics.fixedTimestep',
    label: 'Fixed Timestep',
    description: 'Physics simulation timestep in seconds.',
    type: 'number',
    defaultValue: 1 / 60,
    category: 'Physics',
    order: 4,
    min: 0.001,
    max: 0.1,
    step: 0.001,
  },
  {
    key: 'project.physics.maxSubSteps',
    label: 'Max Sub-Steps',
    description: 'Maximum physics sub-steps per frame to prevent spiral of death.',
    type: 'number',
    defaultValue: 8,
    category: 'Physics',
    order: 5,
    min: 1,
    max: 30,
    step: 1,
  },
];

// ── Audio ──

const audioSettings: SettingDescriptor[] = [
  {
    key: 'project.audio.masterVolume',
    label: 'Master Volume',
    description: 'Default game master volume.',
    type: 'slider',
    defaultValue: 1,
    category: 'Audio',
    order: 1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'project.audio.spatialModel',
    label: 'Spatial Audio Model',
    description: 'Default spatialization model. Requires restart.',
    type: 'select',
    defaultValue: 'HRTF',
    category: 'Audio',
    order: 2,
    requiresRestart: true,
    options: [
      { value: 'HRTF', label: 'HRTF' },
      { value: 'equalpower', label: 'Equal Power' },
    ],
  },
  {
    key: 'project.audio.distanceModel',
    label: 'Distance Model',
    description: 'Audio distance attenuation model.',
    type: 'select',
    defaultValue: 'inverse',
    category: 'Audio',
    order: 3,
    options: [
      { value: 'linear', label: 'Linear' },
      { value: 'inverse', label: 'Inverse' },
      { value: 'exponential', label: 'Exponential' },
    ],
  },
];

// ── Scene Defaults ──

const sceneDefaults: SettingDescriptor[] = [
  {
    key: 'project.scene.ambientColor',
    label: 'Ambient Color',
    description: 'Default ambient light color for new scenes.',
    type: 'color',
    defaultValue: '#45455a',
    category: 'Scene',
    order: 1,
  },
  {
    key: 'project.scene.ambientIntensity',
    label: 'Ambient Intensity',
    description: 'Default ambient light intensity.',
    type: 'slider',
    defaultValue: 0.5,
    category: 'Scene',
    order: 2,
    min: 0,
    max: 3,
    step: 0.1,
  },
  {
    key: 'project.scene.backgroundColor',
    label: 'Background Color',
    description: 'Default scene background / sky color.',
    type: 'color',
    defaultValue: '#0a0e17',
    category: 'Scene',
    order: 3,
  },
  {
    key: 'project.scene.fogEnabled',
    label: 'Fog',
    description: 'Enable fog by default in new scenes.',
    type: 'boolean',
    defaultValue: true,
    category: 'Scene',
    order: 4,
  },
  {
    key: 'project.scene.fogDensity',
    label: 'Fog Density',
    description: 'Default exponential fog density.',
    type: 'slider',
    defaultValue: 0.008,
    category: 'Scene',
    order: 5,
    min: 0,
    max: 0.1,
    step: 0.001,
  },
];

// ── Build / Export ──

const buildSettings: SettingDescriptor[] = [
  {
    key: 'project.build.target',
    label: 'Build Target',
    description: 'Primary build platform.',
    type: 'select',
    defaultValue: 'web',
    category: 'Build',
    order: 1,
    options: [
      { value: 'web', label: 'Web (HTML5)' },
      { value: 'electron', label: 'Desktop (Electron)' },
    ],
  },
  {
    key: 'project.build.outputDir',
    label: 'Output Directory',
    description: 'Relative path for build output.',
    type: 'string',
    defaultValue: 'Build',
    category: 'Build',
    order: 2,
  },
  {
    key: 'project.build.minify',
    label: 'Minify',
    description: 'Minify JavaScript in production builds.',
    type: 'boolean',
    defaultValue: true,
    category: 'Build',
    order: 3,
  },
  {
    key: 'project.build.sourceMaps',
    label: 'Source Maps',
    description: 'Generate source maps for debugging.',
    type: 'boolean',
    defaultValue: false,
    category: 'Build',
    order: 4,
  },
];

// ── Register All ──

export function registerDefaultProjectSettings(): void {
  ProjectSettingsRegistry.registerMany(generalSettings);
  ProjectSettingsRegistry.registerMany(renderingSettings);
  ProjectSettingsRegistry.registerMany(physicsSettings);
  ProjectSettingsRegistry.registerMany(audioSettings);
  ProjectSettingsRegistry.registerMany(sceneDefaults);
  ProjectSettingsRegistry.registerMany(buildSettings);
}
