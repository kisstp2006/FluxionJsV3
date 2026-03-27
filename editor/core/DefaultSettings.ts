// ============================================================
// FluxionJS V3 — Default Settings Registration
// Engine and editor modules register their settings here at import time.
// Each module can also call SettingsRegistry.register() directly.
// ============================================================

import { SettingsRegistry, SettingDescriptor } from './SettingsRegistry';
import { Icons } from '../ui/Icons';

// ── Category Registration ──

SettingsRegistry.registerCategory('Editor', { label: 'Editor', icon: Icons.settings, order: 20 });
SettingsRegistry.registerCategory('Editor/Viewport', { label: 'Viewport', icon: Icons.eye, order: 21 });
SettingsRegistry.registerCategory('Editor/Gizmos', { label: 'Gizmos', icon: Icons.move, order: 22 });
SettingsRegistry.registerCategory('Editor/ViewCube', { label: 'ViewCube', icon: Icons.cube, order: 23 });
SettingsRegistry.registerCategory('Editor/PlayMode', { label: 'Play Mode', icon: Icons.play, order: 24 });
SettingsRegistry.registerCategory('Audio', { label: 'Audio', icon: Icons.audio, order: 40 });

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
  {
    key: 'editor.viewport.physicsDebugDraw',
    label: 'Physics Debug Draw',
    description: 'Show physics collider wireframes in the viewport.',
    type: 'boolean',
    defaultValue: false,
    category: 'Editor/Viewport',
    order: 7,
  },
];

// ── ViewCube Settings ──

const viewCubeSettings: SettingDescriptor[] = [
  {
    key: 'editor.viewcube.visible',
    label: 'Show ViewCube',
    description: 'Display the 3D orientation cube in the viewport.',
    type: 'boolean',
    defaultValue: true,
    category: 'Editor/ViewCube',
    order: 1,
  },
  {
    key: 'editor.viewcube.size',
    label: 'Size',
    description: 'ViewCube canvas size in pixels.',
    type: 'slider',
    defaultValue: 120,
    category: 'Editor/ViewCube',
    order: 2,
    min: 80,
    max: 200,
    step: 10,
  },
  {
    key: 'editor.viewcube.opacity',
    label: 'Opacity',
    description: 'Opacity of the ViewCube when not hovered.',
    type: 'slider',
    defaultValue: 1,
    category: 'Editor/ViewCube',
    order: 3,
    min: 0.3,
    max: 1,
    step: 0.05,
  },
  {
    key: 'editor.viewcube.animationSpeed',
    label: 'Animation Speed',
    description: 'Duration of the camera snap animation in milliseconds.',
    type: 'number',
    defaultValue: 400,
    category: 'Editor/ViewCube',
    order: 4,
    min: 100,
    max: 1500,
    step: 50,
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

// ── Play Mode Settings ──

const playModeSettings: SettingDescriptor[] = [
  {
    key: 'editor.playMode.restoreSceneOnStop',
    label: 'Restore Scene on Stop',
    description: 'When stopping play mode, restore all entities and components to the state they were in before play was started.',
    type: 'boolean',
    defaultValue: true,
    category: 'Editor/PlayMode',
    order: 1,
  },
];

// ── Register All ──

export function registerDefaultSettings(): void {
  SettingsRegistry.registerMany(editorSettings);
  SettingsRegistry.registerMany(playModeSettings);
  SettingsRegistry.registerMany(viewCubeSettings);
  SettingsRegistry.registerMany(audioSettings);
}
