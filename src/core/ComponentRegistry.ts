// ============================================================
// FluxionJS V3 — Component Registry & Property Metadata
// Declarative property descriptors + central component registry.
// Adding a new component = define class + register here. Done.
// ============================================================

import { Component } from './ECS';
import {
  TransformComponent,
  MeshRendererComponent,
  CameraComponent,
  LightComponent,
  RigidbodyComponent,
  ColliderComponent,
  CharacterControllerComponent,
  ParticleEmitterComponent,
  AudioSourceComponent,
  SpriteComponent,
  FuiComponent,
  EnvironmentComponent,
  TextRendererComponent,
  CSGBrushComponent,
  ScriptComponent,
} from './Components';

// ── Property Descriptor ──────────────────────────────────────

export type PropertyType =
  | 'number'
  | 'slider'
  | 'boolean'
  | 'string'
  | 'select'
  | 'color'
  | 'vector3';

export interface PropertyDescriptor {
  /** Property key on the component instance */
  key: string;
  /** Display label in the inspector (defaults to key) */
  label?: string;
  /** Widget type for the inspector */
  type: PropertyType;
  /** Min value (number/slider) */
  min?: number;
  /** Max value (number/slider) */
  max?: number;
  /** Step increment (number/slider) */
  step?: number;
  /** Options list (select) */
  options?: { value: string; label: string }[];
}

// ── Component Definition ─────────────────────────────────────

export interface ComponentDefinition {
  /** Matches Component.type — unique identifier */
  type: string;
  /** Human-readable name shown in inspector header */
  displayName?: string;
  /** Icon character for inspector header */
  icon?: string;
  /** Whether the component can be removed from an entity (default: true) */
  removable?: boolean;
  /** Whether the component appears in the Add Component menu (default: true) */
  addable?: boolean;
  /** Property descriptors drive the auto-inspector UI */
  properties: PropertyDescriptor[];
  /** Factory — creates a default instance */
  create: () => Component;
}

// ── Registry Implementation ──────────────────────────────────

class ComponentRegistryImpl {
  private definitions = new Map<string, ComponentDefinition>();

  register(definition: ComponentDefinition): void {
    this.definitions.set(definition.type, definition);
  }

  get(type: string): ComponentDefinition | undefined {
    return this.definitions.get(type);
  }

  getAll(): ComponentDefinition[] {
    return [...this.definitions.values()];
  }

  /** Components that can be added via the Add Component menu */
  getAddable(): ComponentDefinition[] {
    return this.getAll().filter((d) => d.addable !== false);
  }

  /** Create a new default instance of a registered component */
  create(type: string): Component | undefined {
    return this.definitions.get(type)?.create();
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }
}

export const ComponentRegistry = new ComponentRegistryImpl();

// ── Built-in Registrations ───────────────────────────────────

ComponentRegistry.register({
  type: 'Transform',
  displayName: 'Transform',
  icon: '✥',
  removable: false,
  addable: false,
  properties: [
    { key: 'position', type: 'vector3', label: 'Position' },
    { key: 'rotation', type: 'vector3', label: 'Rotation' },
    { key: 'scale', type: 'vector3', label: 'Scale' },
  ],
  create: () => new TransformComponent(),
});

ComponentRegistry.register({
  type: 'MeshRenderer',
  displayName: 'Mesh Renderer',
  icon: '▣',
  addable: false, // created via scene primitives, not the add-component menu
  properties: [
    { key: 'castShadow', type: 'boolean', label: 'Cast Shadow' },
    { key: 'receiveShadow', type: 'boolean', label: 'Receive Shadow' },
    { key: 'layer', type: 'number', label: 'Layer', step: 1 },
  ],
  create: () => new MeshRendererComponent(),
});

ComponentRegistry.register({
  type: 'Camera',
  displayName: 'Camera',
  icon: '📷',
  properties: [
    { key: 'fov', type: 'number', label: 'FOV', min: 1, max: 179, step: 1 },
    { key: 'near', type: 'number', label: 'Near', min: 0.001, step: 0.01 },
    { key: 'far', type: 'number', label: 'Far', min: 1, step: 1 },
    { key: 'priority', type: 'number', label: 'Priority', step: 1 },
  ],
  create: () => new CameraComponent(),
});

ComponentRegistry.register({
  type: 'Light',
  displayName: 'Light',
  icon: '☀',
  properties: [
    {
      key: 'lightType', type: 'select', label: 'Type',
      options: [
        { value: 'directional', label: 'Directional' },
        { value: 'point', label: 'Point' },
        { value: 'spot', label: 'Spot' },
        { value: 'ambient', label: 'Ambient' },
      ],
    },
    { key: 'color', type: 'color', label: 'Color' },
    { key: 'intensity', type: 'slider', label: 'Intensity', min: 0, max: 10, step: 0.1 },
    { key: 'range', type: 'number', label: 'Range', step: 1 },
    { key: 'castShadow', type: 'boolean', label: 'Shadows' },
  ],
  create: () => new LightComponent(),
});

ComponentRegistry.register({
  type: 'Rigidbody',
  displayName: 'Rigidbody',
  icon: '⊛',
  properties: [
    {
      key: 'bodyType', type: 'select', label: 'Type',
      options: [
        { value: 'dynamic', label: 'Dynamic' },
        { value: 'static', label: 'Static' },
        { value: 'kinematic', label: 'Kinematic' },
      ],
    },
    { key: 'mass', type: 'number', label: 'Mass', step: 0.1 },
    { key: 'friction', type: 'slider', label: 'Friction', min: 0, max: 2, step: 0.1 },
    { key: 'restitution', type: 'slider', label: 'Bounce', min: 0, max: 1, step: 0.05 },
  ],
  create: () => new RigidbodyComponent(),
});

ComponentRegistry.register({
  type: 'Collider',
  displayName: 'Collider',
  icon: '🔲',
  properties: [
    {
      key: 'shape', type: 'select', label: 'Shape',
      options: [
        { value: 'box', label: 'Box' },
        { value: 'sphere', label: 'Sphere' },
        { value: 'capsule', label: 'Capsule' },
        { value: 'cylinder', label: 'Cylinder' },
        { value: 'mesh', label: 'Mesh' },
      ],
    },
    { key: 'isTrigger', type: 'boolean', label: 'Is Trigger' },
    { key: 'size', type: 'vector3', label: 'Size' },
    { key: 'offset', type: 'vector3', label: 'Offset' },
  ],
  create: () => new ColliderComponent(),
});

ComponentRegistry.register({
  type: 'CharacterController',
  displayName: 'Character Controller',
  icon: '🧍',
  properties: [
    { key: 'radius',         type: 'number', label: 'Radius',       step: 0.05 },
    { key: 'height',         type: 'number', label: 'Height',       step: 0.1 },
    { key: 'crouchHeight',   type: 'number', label: 'Crouch Height',step: 0.1 },
    { key: 'walkSpeed',      type: 'number', label: 'Walk Speed',   step: 0.5 },
    { key: 'runSpeed',       type: 'number', label: 'Run Speed',    step: 0.5 },
    { key: 'jumpImpulse',    type: 'number', label: 'Jump Impulse', step: 0.5 },
    { key: 'maxJumps',       type: 'number', label: 'Max Jumps',    step: 1   },
    { key: 'maxSlopeAngle',  type: 'slider', label: 'Max Slope °',  min: 0, max: 89, step: 1 },
    { key: 'gravityScale',   type: 'number', label: 'Gravity Scale',step: 0.1 },
  ],
  create: () => new CharacterControllerComponent(),
});

ComponentRegistry.register({
  type: 'ParticleEmitter',
  displayName: 'Particle Emitter',
  icon: '✦',
  properties: [
    { key: 'maxParticles', type: 'number', label: 'Max Particles', step: 100 },
    { key: 'emissionRate', type: 'number', label: 'Rate', step: 10 },
    { key: 'gravity', type: 'number', label: 'Gravity', step: 0.1 },
    { key: 'spread', type: 'slider', label: 'Spread', min: 0, max: Math.PI, step: 0.1 },
    { key: 'startColor', type: 'color', label: 'Start Color' },
    { key: 'endColor', type: 'color', label: 'End Color' },
    { key: 'worldSpace', type: 'boolean', label: 'World Space' },
  ],
  create: () => new ParticleEmitterComponent(),
});

ComponentRegistry.register({
  type: 'AudioSource',
  displayName: 'Audio Source',
  icon: '🔊',
  properties: [
    { key: 'clip', type: 'string', label: 'Clip' },
    { key: 'volume', type: 'slider', label: 'Volume', min: 0, max: 1, step: 0.01 },
    { key: 'pitch', type: 'slider', label: 'Pitch', min: 0.1, max: 3, step: 0.1 },
    { key: 'loop', type: 'boolean', label: 'Loop' },
    { key: 'playOnStart', type: 'boolean', label: 'Play On Start' },
    { key: 'spatial', type: 'boolean', label: 'Spatial' },
    { key: 'minDistance', type: 'number', label: 'Min Distance', step: 1 },
    { key: 'maxDistance', type: 'number', label: 'Max Distance', step: 1 },
  ],
  create: () => new AudioSourceComponent(),
});

ComponentRegistry.register({
  type: 'Sprite',
  displayName: 'Sprite',
  icon: '🖼',
  properties: [
    { key: 'color', type: 'color', label: 'Color' },
    { key: 'opacity', type: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.01 },
    { key: 'flipX', type: 'boolean', label: 'Flip X' },
    { key: 'flipY', type: 'boolean', label: 'Flip Y' },
    { key: 'pixelsPerUnit', type: 'number', label: 'Pixels/Unit', step: 1, min: 1 },
    { key: 'sortingLayer', type: 'number', label: 'Sorting Layer', step: 1 },
    { key: 'sortingOrder', type: 'number', label: 'Sorting Order', step: 1 },
  ],
  create: () => new SpriteComponent(),
});

ComponentRegistry.register({
  type: 'TextRenderer',
  displayName: 'Text Renderer',
  icon: '𝐓',
  properties: [],  // Custom inspector handles the UI
  create: () => new TextRendererComponent(),
});

ComponentRegistry.register({
  type: 'Environment',
  displayName: 'Environment',
  icon: '🌍',
  // Only one per scene — users add it manually via Add Component
  addable: true,
  properties: [],  // Custom inspector handles the UI
  create: () => new EnvironmentComponent(),
});

ComponentRegistry.register({
  type: 'Fui',
  displayName: 'UI (FUI)',
  icon: '▦',
  addable: true,
  properties: [
    {
      key: 'mode',
      type: 'select',
      label: 'Space',
      options: [
        { value: 'screen', label: 'Screen Space' },
        { value: 'world', label: 'World Space' },
      ],
    },
    { key: 'fuiPath', type: 'string', label: 'FUI Path' },

    // Screen
    { key: 'screenX', type: 'number', label: 'Screen X', step: 1, min: 0 },
    { key: 'screenY', type: 'number', label: 'Screen Y', step: 1, min: 0 },

    // World
    { key: 'worldWidth', type: 'number', label: 'World Width', step: 0.1, min: 0.01 },
    { key: 'worldHeight', type: 'number', label: 'World Height', step: 0.1, min: 0.01 },

    { key: 'billboard', type: 'boolean', label: 'Billboard (face camera)' },
  ],
  create: () => new FuiComponent(),
});

ComponentRegistry.register({
  type: 'CSGBrush',
  displayName: 'CSG Brush',
  icon: '🧊',
  addable: true,
  properties: [
    {
      key: 'shape', type: 'select', label: 'Shape',
      options: [
        { value: 'box', label: 'Box' },
        { value: 'cylinder', label: 'Cylinder' },
        { value: 'cone', label: 'Cone' },
        { value: 'sphere', label: 'Sphere' },
        { value: 'wedge', label: 'Wedge' },
        { value: 'stairs', label: 'Stairs' },
        { value: 'arch', label: 'Arch' },
      ],
    },
    {
      key: 'operation', type: 'select', label: 'Operation',
      options: [
        { value: 'additive', label: 'Additive' },
        { value: 'subtractive', label: 'Subtractive' },
      ],
    },
    { key: 'size', type: 'vector3', label: 'Size' },
    { key: 'radius', type: 'number', label: 'Radius', min: 0.01, step: 0.1 },
    { key: 'segments', type: 'number', label: 'Segments', min: 3, max: 64, step: 1 },
    { key: 'stairSteps', type: 'number', label: 'Stair Steps', min: 1, max: 32, step: 1 },
    { key: 'generateCollision', type: 'boolean', label: 'Generate Collision' },
    { key: 'castShadow', type: 'boolean', label: 'Cast Shadow' },
    { key: 'receiveShadow', type: 'boolean', label: 'Receive Shadow' },
    { key: 'materialPath', type: 'string', label: 'Material' },
  ],
  create: () => new CSGBrushComponent(),
});

ComponentRegistry.register({
  type: 'Script',
  displayName: 'Script',
  icon: '⌨',
  addable: true,
  removable: true,
  // Properties are dynamically shown by ScriptInspector — no static metadata needed.
  properties: [],
  create: () => new ScriptComponent(),
});
