// ============================================================
// FluxionJS V3 — Built-in Component Definitions
// All components extend BaseComponent and use @component / @field
// decorators for automatic inspector generation and serialization.
// ============================================================

import * as THREE from 'three';
import { BaseComponent } from './BaseComponent';
import { component, field } from './ComponentDecorators';
import type { DeserializationContext } from './SerializationContext';

// ── Transform ────────────────────────────────────────────────────────────────

@component({
  typeId: 'Transform',
  displayName: 'Transform',
  icon: '✥',
  removable: false,
  showInAddMenu: false,
})
export class TransformComponent extends BaseComponent {
  readonly typeId = 'Transform';

  @field({ type: 'vector3', label: 'Position', defaultValue: [0, 0, 0] })
  position = new THREE.Vector3(0, 0, 0);

  @field({ type: 'vector3', label: 'Scale', uniformScale: true, defaultValue: [1, 1, 1] })
  scale = new THREE.Vector3(1, 1, 1);

  /**
   * Euler rotation — modifying .x/.y/.z automatically syncs `quaternion`.
   * Decorated as 'euler' so the inspector shows degrees.
   */
  @field({ type: 'euler', label: 'Rotation', defaultValue: [0, 0, 0] })
  readonly rotation: THREE.Euler;
  readonly quaternion: THREE.Quaternion;

  private _matrix = new THREE.Matrix4();
  private _worldMatrix = new THREE.Matrix4();

  constructor() {
    super();
    this.quaternion = new THREE.Quaternion();
    this.rotation    = new THREE.Euler(0, 0, 0);
    (this.rotation   as any)._onChange(() => { this.quaternion.setFromEuler(this.rotation, false); });
    (this.quaternion as any)._onChange(() => { this.rotation.setFromQuaternion(this.quaternion, undefined, false); });
  }

  get localMatrix(): THREE.Matrix4 {
    this._matrix.compose(this.position, this.quaternion, this.scale);
    return this._matrix;
  }

  get worldMatrix(): THREE.Matrix4 { return this._worldMatrix; }
  set worldMatrix(m: THREE.Matrix4) { this._worldMatrix.copy(m); }

  lookAt(target: THREE.Vector3): void {
    const m = new THREE.Matrix4();
    m.lookAt(this.position, target, new THREE.Vector3(0, 1, 0));
    this.quaternion.setFromRotationMatrix(m);
  }

  override serialize(): Record<string, any> {
    return {
      __v: 1,
      position: [this.position.x, this.position.y, this.position.z],
      rotation: [this.rotation.x, this.rotation.y, this.rotation.z],
      scale:    [this.scale.x, this.scale.y, this.scale.z],
    };
  }

  override deserialize(data: Record<string, any>, _ctx: DeserializationContext): void {
    if (data.position) this.position.set(data.position[0], data.position[1], data.position[2]);
    if (data.rotation) this.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
    if (data.scale)    this.scale.set(data.scale[0], data.scale[1], data.scale[2]);
    this.quaternion.setFromEuler(this.rotation);
  }
}

// ── Mesh Renderer ─────────────────────────────────────────────────────────────

@component({
  typeId: 'MeshRenderer',
  displayName: 'Mesh Renderer',
  icon: '▣',
  category: 'Rendering',
  showInAddMenu: false,
  hierarchyIcon: { icon: 'cube', color: 'var(--accent-purple)' },
  hierarchyIconPriority: 10,
})
export class MeshRendererComponent extends BaseComponent {
  readonly typeId = 'MeshRenderer';

  /** Runtime THREE.js mesh — NOT serialized */
  mesh: THREE.Mesh | THREE.Group | null = null;

  @field({ type: 'boolean', label: 'Cast Shadow' })
  castShadow = true;

  @field({ type: 'boolean', label: 'Receive Shadow' })
  receiveShadow = true;

  @field({ type: 'number', label: 'Layer', step: 1 })
  layer = 0;

  /** Tracks the primitive type used to create this mesh */
  primitiveType?: string;
  /** Project-relative path to a 3D model asset */
  modelPath?: string;
  /** Project-relative path to a .fluxmat material asset */
  materialPath?: string;
  /** Per-slot material overrides for .fluxmesh models */
  materialSlots?: Array<{ slotIndex: number; materialPath: string }>;

  @field({ type: 'vector2', label: 'UV Scale', group: 'UV Transform' })
  uvScale = { x: 1, y: 1 };

  @field({ type: 'vector2', label: 'UV Offset', group: 'UV Transform' })
  uvOffset = { x: 0, y: 0 };

  @field({ type: 'slider', label: 'UV Rotation', min: -180, max: 180, group: 'UV Transform' })
  uvRotation = 0;

  /** Custom serialize — mesh data is complex (geometry + material + asset refs) */
  override serialize(): Record<string, any> {
    const data: Record<string, any> = {
      __v: 1,
      castShadow: this.castShadow,
      receiveShadow: this.receiveShadow,
      layer: this.layer,
    };

    if (this.modelPath) {
      data.modelPath = this.modelPath;
    } else {
      data.primitiveType = this.primitiveType || 'cube';
      if (this.mesh instanceof THREE.Mesh) {
        const params = (this.mesh.geometry as any).parameters || {};
        const geom: Record<string, number> = {};
        if (params.width  !== undefined) geom.width  = params.width;
        if (params.height !== undefined) geom.height = params.height;
        if (params.depth  !== undefined) geom.depth  = params.depth;
        if (params.radius !== undefined) geom.radius = params.radius;
        if (params.radiusTop    !== undefined) geom.radiusTop    = params.radiusTop;
        if (params.radiusBottom !== undefined) geom.radiusBottom = params.radiusBottom;
        if (params.tube !== undefined) geom.tube = params.tube;
        if (Object.keys(geom).length) data.geometry = geom;
      }
    }

    if (this.materialPath) data.materialPath = this.materialPath;

    if (this.materialSlots?.length) {
      data.materialSlots = this.materialSlots.map(s => ({
        slotIndex: s.slotIndex,
        materialPath: s.materialPath,
      }));
    }

    if (this.uvScale.x !== 1 || this.uvScale.y !== 1)
      data.uvScale = [this.uvScale.x, this.uvScale.y];
    if (this.uvOffset.x !== 0 || this.uvOffset.y !== 0)
      data.uvOffset = [this.uvOffset.x, this.uvOffset.y];
    if (this.uvRotation !== 0)
      data.uvRotation = this.uvRotation;

    if (this.mesh instanceof THREE.Mesh) {
      const mat = this.mesh.material;
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
        const m: Record<string, any> = {
          color: [mat.color.r, mat.color.g, mat.color.b],
          roughness: mat.roughness,
          metalness: mat.metalness,
        };
        if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
          m.emissive = [mat.emissive.r, mat.emissive.g, mat.emissive.b];
          m.emissiveIntensity = mat.emissiveIntensity;
        }
        if (mat.transparent) { m.transparent = true; m.opacity = mat.opacity; }
        if (mat.side === THREE.DoubleSide) m.doubleSided = true;
        if (mat.wireframe) m.wireframe = true;
        if (mat.alphaTest > 0) m.alphaTest = mat.alphaTest;
        const mapKeys = ['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
        for (const key of mapKeys) {
          const texPath = (mat.userData as any)?.[key];
          if (texPath) m[key] = texPath;
        }
        if (mat.normalScale && (mat.normalScale.x !== 1 || mat.normalScale.y !== 1))
          m.normalScale = mat.normalScale.x;
        if (mat.aoMapIntensity !== undefined && mat.aoMapIntensity !== 1)
          m.aoIntensity = mat.aoMapIntensity;
        if (mat.envMapIntensity !== undefined && mat.envMapIntensity !== 1)
          m.envMapIntensity = mat.envMapIntensity;
        data.material = m;
      }
    }

    return data;
  }

  /** Custom deserialize — handles deferred async model/material loading */
  override deserialize(data: Record<string, any>, ctx: DeserializationContext): void {
    this.castShadow    = data.castShadow ?? true;
    this.receiveShadow = data.receiveShadow ?? true;
    this.layer         = data.layer ?? 0;

    if (data.materialPath) this.materialPath = data.materialPath;

    if (data.materialSlots && Array.isArray(data.materialSlots)) {
      this.materialSlots = (data.materialSlots as any[]).map((s: any) => ({
        slotIndex: s.slotIndex,
        materialPath: s.materialPath,
      }));
    }

    if (data.uvScale)  this.uvScale  = { x: data.uvScale[0],  y: data.uvScale[1] };
    if (data.uvOffset) this.uvOffset = { x: data.uvOffset[0], y: data.uvOffset[1] };
    if (data.uvRotation !== undefined) this.uvRotation = data.uvRotation;

    if (data.modelPath) {
      this.modelPath = data.modelPath;
      ctx.deferredModelLoads.push({ meshComp: this, modelPath: data.modelPath });
    } else {
      this.primitiveType = data.primitiveType || 'cube';
      const geom = data.geometry || {};
      this.mesh = new THREE.Mesh(
        buildGeometry(this.primitiveType ?? 'cube', geom),
        buildPrimitiveMaterial(data.material || {}),
      );
      this.mesh.castShadow    = this.castShadow;
      this.mesh.receiveShadow = this.receiveShadow;
    }

    if (this.materialPath) {
      ctx.deferredMaterialLoads.push({ meshComp: this, materialPath: this.materialPath });
    }
  }
}

// ── Camera ────────────────────────────────────────────────────────────────────

@component({
  typeId: 'Camera',
  displayName: 'Camera',
  icon: '📷',
  category: 'Rendering',
  hierarchyIcon: { icon: 'camera', color: 'var(--accent)' },
  hierarchyIconPriority: 30,
})
export class CameraComponent extends BaseComponent {
  readonly typeId = 'Camera';

  @field({ type: 'slider', label: 'FOV', min: 1, max: 179, step: 1 })
  fov = 60;

  @field({ type: 'number', label: 'Near', step: 0.01 })
  near = 0.1;

  @field({ type: 'number', label: 'Far' })
  far = 1000;

  @field({ type: 'boolean', label: 'Orthographic' })
  isOrthographic = false;

  @field({ type: 'number', label: 'Ortho Size', visibleIf: s => s.isOrthographic, dependsOn: ['isOrthographic'] })
  orthoSize = 10;

  @field({ type: 'number', label: 'Priority', step: 1 })
  priority = 0;

  @field({ type: 'boolean', label: 'Main Camera' })
  isMain = false;

  /** Runtime THREE.js camera — NOT serialized */
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
}

// ── Light ─────────────────────────────────────────────────────────────────────

export type LightType = 'directional' | 'point' | 'spot' | 'ambient';

@component({
  typeId: 'Light',
  displayName: 'Light',
  icon: '☀',
  category: 'Rendering',
  hierarchyIcon: { icon: 'light', color: 'var(--accent-yellow)' },
  hierarchyIconPriority: 50,
})
export class LightComponent extends BaseComponent {
  readonly typeId = 'Light';

  @field({
    type: 'select',
    label: 'Type',
    options: [
      { value: 'directional', label: 'Directional' },
      { value: 'point',       label: 'Point' },
      { value: 'spot',        label: 'Spot' },
      { value: 'ambient',     label: 'Ambient' },
    ],
  })
  lightType: LightType = 'point';

  @field({ type: 'color', label: 'Color' })
  color = new THREE.Color(1, 1, 1);

  @field({ type: 'slider', label: 'Intensity', min: 0, max: 20, step: 0.1 })
  intensity = 1;

  @field({ type: 'number', label: 'Range', step: 0.5, visibleIf: s => s.lightType !== 'ambient' && s.lightType !== 'directional', dependsOn: ['lightType'] })
  range = 10;

  @field({ type: 'slider', label: 'Spot Angle', min: 1, max: 180, step: 1, visibleIf: s => s.lightType === 'spot', dependsOn: ['lightType'] })
  spotAngle = 45;

  @field({ type: 'slider', label: 'Penumbra', min: 0, max: 1, step: 0.01, visibleIf: s => s.lightType === 'spot', dependsOn: ['lightType'] })
  spotPenumbra = 0.1;

  @field({ type: 'boolean', label: 'Cast Shadows', visibleIf: s => s.lightType !== 'ambient', dependsOn: ['lightType'] })
  castShadow = true;

  @field({ type: 'select', label: 'Shadow Map Size', options: [{ value: '512', label: '512' }, { value: '1024', label: '1024' }, { value: '2048', label: '2048' }, { value: '4096', label: '4096' }], visibleIf: s => s.castShadow && s.lightType !== 'ambient', dependsOn: ['castShadow', 'lightType'] })
  shadowMapSize = 2048;

  @field({ type: 'asset', label: 'Cookie Texture', assetType: 'texture', visibleIf: s => s.lightType !== 'ambient', dependsOn: ['lightType'] })
  cookieTexturePath: string | null = null;

  /** Runtime cached cookie texture — NOT serialized */
  cookieTexture: THREE.Texture | null = null;
  /** Runtime THREE.js light — NOT serialized */
  light: THREE.Light | null = null;
}

// ── Rigidbody ─────────────────────────────────────────────────────────────────

export type BodyType = 'dynamic' | 'static' | 'kinematic';

@component({
  typeId: 'Rigidbody',
  displayName: 'Rigidbody',
  icon: '⊛',
  category: 'Physics',
  hierarchyIcon: { icon: 'physics', color: 'var(--accent-red)' },
  hierarchyIconPriority: 40,
})
export class RigidbodyComponent extends BaseComponent {
  readonly typeId = 'Rigidbody';

  @field({ type: 'select', label: 'Body Type', options: [{ value: 'dynamic', label: 'Dynamic' }, { value: 'static', label: 'Static' }, { value: 'kinematic', label: 'Kinematic' }] })
  bodyType: BodyType = 'dynamic';

  @field({ type: 'number', label: 'Mass', step: 0.1, min: 0, visibleIf: s => s.bodyType === 'dynamic', dependsOn: ['bodyType'] })
  mass = 1;

  @field({ type: 'slider', label: 'Friction', min: 0, max: 1, step: 0.01 })
  friction = 0.5;

  @field({ type: 'slider', label: 'Restitution', min: 0, max: 1, step: 0.01 })
  restitution = 0.3;

  @field({ type: 'number', label: 'Gravity Scale', step: 0.1 })
  gravityScale = 1;

  @field({ type: 'slider', label: 'Linear Damping', min: 0, max: 1, step: 0.01 })
  linearDamping = 0;

  @field({ type: 'slider', label: 'Angular Damping', min: 0, max: 1, step: 0.01 })
  angularDamping = 0.05;

  @field({ type: 'boolean', label: 'Continuous Collision', visibleIf: s => s.bodyType === 'dynamic', dependsOn: ['bodyType'] })
  isContinuous = false;

  @field({ type: 'boolean', label: 'Freeze X', group: 'Freeze Position' })
  lockLinearX = false;
  @field({ type: 'boolean', label: 'Freeze Y', group: 'Freeze Position' })
  lockLinearY = false;
  @field({ type: 'boolean', label: 'Freeze Z', group: 'Freeze Position' })
  lockLinearZ = false;
  @field({ type: 'boolean', label: 'Freeze X', group: 'Freeze Rotation' })
  lockAngularX = false;
  @field({ type: 'boolean', label: 'Freeze Y', group: 'Freeze Rotation' })
  lockAngularY = false;
  @field({ type: 'boolean', label: 'Freeze Z', group: 'Freeze Rotation' })
  lockAngularZ = false;

  @field({ type: 'boolean', label: 'Can Sleep', group: 'Performance' })
  canSleep = true;

  /** Runtime Rapier body handle — NOT serialized */
  bodyHandle: any = null;
}

// ── Collider ──────────────────────────────────────────────────────────────────

export type ColliderShape = 'box' | 'sphere' | 'capsule' | 'mesh' | 'convex';

@component({
  typeId: 'Collider',
  displayName: 'Collider',
  icon: '⬡',
  category: 'Physics',
})
export class ColliderComponent extends BaseComponent {
  readonly typeId = 'Collider';

  @field({ type: 'select', label: 'Shape', options: [{ value: 'box', label: 'Box' }, { value: 'sphere', label: 'Sphere' }, { value: 'capsule', label: 'Capsule' }, { value: 'mesh', label: 'Mesh' }, { value: 'convex', label: 'Convex' }] })
  shape: ColliderShape = 'box';

  @field({ type: 'vector3', label: 'Size', visibleIf: s => s.shape === 'box', dependsOn: ['shape'] })
  size = new THREE.Vector3(1, 1, 1);

  @field({ type: 'number', label: 'Radius', step: 0.05, visibleIf: s => s.shape === 'sphere' || s.shape === 'capsule', dependsOn: ['shape'] })
  radius = 0.5;

  @field({ type: 'number', label: 'Height', step: 0.1, visibleIf: s => s.shape === 'capsule', dependsOn: ['shape'] })
  height = 2;

  @field({ type: 'boolean', label: 'Is Trigger' })
  isTrigger = false;

  @field({ type: 'vector3', label: 'Offset' })
  offset = new THREE.Vector3(0, 0, 0);

  /** Project-relative path to a model (.fbx, .glb, .fluxmesh) used as collision geometry.
   *  Only relevant when shape = 'mesh' or 'convex'. */
  @field({
    type: 'asset',
    label: 'Mesh Source',
    assetType: 'model',
    group: 'Shape',
    visibleIf: s => s.shape === 'mesh' || s.shape === 'convex',
    dependsOn: ['shape'],
  })
  meshPath: string = '';

  /** Bitmask — which collision groups this collider belongs to (bits 0-15). Default = group 1. */
  @field({ type: 'number', label: 'Collision Layer', step: 1, min: 0, max: 65535, group: 'Filtering' })
  collisionLayer = 0x0001;

  /** Bitmask — which collision groups this collider interacts with. Default = all groups. */
  @field({ type: 'number', label: 'Collision Mask', step: 1, min: 0, max: 65535, group: 'Filtering' })
  collisionMask = 0xFFFF;

  /** Runtime Rapier collider handle — NOT serialized */
  colliderHandle: any = null;
}

// ── Character Controller ──────────────────────────────────────────────────────

@component({
  typeId: 'CharacterController',
  displayName: 'Character Controller',
  icon: '👤',
  category: 'Physics',
})
export class CharacterControllerComponent extends BaseComponent {
  readonly typeId = 'CharacterController';

  @field({ type: 'number', label: 'Radius', step: 0.05, group: 'Shape' })
  radius = 0.25;
  @field({ type: 'number', label: 'Height', step: 0.1, group: 'Shape' })
  height = 1.8;
  @field({ type: 'number', label: 'Crouch Height', step: 0.1, group: 'Shape' })
  crouchHeight = 0.9;
  @field({ type: 'number', label: 'Center Offset Y', step: 0.05, group: 'Shape' })
  centerOffsetY = 0.9;

  @field({ type: 'number', label: 'Walk Speed', step: 0.5, group: 'Speeds' })
  walkSpeed = 5.0;
  @field({ type: 'number', label: 'Run Speed', step: 0.5, group: 'Speeds' })
  runSpeed = 8.0;
  @field({ type: 'number', label: 'Crouch Speed', step: 0.25, group: 'Speeds' })
  crouchSpeed = 2.5;
  @field({ type: 'number', label: 'Air Speed', step: 0.25, group: 'Speeds' })
  airSpeed = 3.0;

  @field({ type: 'number', label: 'Jump Impulse', step: 0.5, group: 'Jump' })
  jumpImpulse = 6.0;
  @field({ type: 'number', label: 'Max Jumps', step: 1, min: 1, group: 'Jump' })
  maxJumps = 1;

  @field({ type: 'slider', label: 'Max Slope Angle', min: 0, max: 90, group: 'Slope & Step' })
  maxSlopeAngle = 45;
  @field({ type: 'number', label: 'Max Step Height', step: 0.05, group: 'Slope & Step' })
  maxStepHeight = 0.3;
  @field({ type: 'number', label: 'Step Down Height', step: 0.05, group: 'Slope & Step' })
  stepDownHeight = 0.3;

  @field({ type: 'number', label: 'Gravity Scale', step: 0.1, group: 'Advanced' })
  gravityScale = 1.0;
  @field({ type: 'slider', label: 'Air Friction', min: 0, max: 2, step: 0.01, group: 'Advanced' })
  airFriction = 0.3;
  @field({ type: 'slider', label: 'Air Control', min: 0, max: 1, step: 0.01, group: 'Advanced' })
  airControl = 0.8;
  @field({ type: 'number', label: 'Push Force', step: 5, group: 'Advanced' })
  pushForce = 50.0;
  @field({ type: 'number', label: 'Mass (kg)', step: 5, group: 'Advanced' })
  mass = 70.0;

  /** Seconds after leaving ground during which jumping is still allowed. */
  @field({ type: 'number', label: 'Coyote Time', step: 0.01, min: 0, max: 0.5, group: 'Advanced' })
  coyoteTime = 0.12;

  /** Seconds before landing during which a queued jump is remembered. */
  @field({ type: 'number', label: 'Jump Buffer', step: 0.01, min: 0, max: 0.3, group: 'Advanced' })
  jumpBufferTime = 0.10;

  /** Draw capsule, ground contact and velocity in the viewport (dev only). */
  @field({ type: 'boolean', label: 'Debug Visualize', group: 'Debug' })
  debugVisualize = false;

  // ── Runtime state — NOT serialized ────────────────────────────────────────
  _isGrounded = false;
  _isCrouching = false;
  _isRunning = false;
  _velocityY = 0;
  _lateralVelocity = new THREE.Vector2(0, 0);
  _jumpCount = 0;
  _moveInput = new THREE.Vector2(0, 0);
  _wantsJump = false;
  _wantsCrouch = false;
  _wantsRun = false;
  /** Counts down: how many seconds of coyote-time remain after leaving ground. */
  _coyoteTimer = 0;
  /** Counts down: buffered jump request still pending. */
  _jumpBufferTimer = 0;
  _rapierController: any = null;
  _rapierBody: any = null;
  _rapierCollider: any = null;
}

// ── Script ────────────────────────────────────────────────────────────────────

/** One script attached to a ScriptComponent. */
export interface ScriptEntry {
  path: string;
  enabled: boolean;
  properties: Record<string, any>;
}

@component({
  typeId: 'Script',
  displayName: 'Script',
  icon: '{}',
  category: 'Scripting',
})
export class ScriptComponent extends BaseComponent {
  readonly typeId = 'Script';

  /** All scripts attached to this component. */
  scripts: ScriptEntry[] = [];

  /** Runtime: live instances keyed by script path — NOT serialized */
  _instances: Map<string, any> = new Map();
  /** Runtime: paths currently being loaded — NOT serialized */
  _loading: Set<string> = new Set();

  override serialize(): Record<string, any> {
    return {
      __v: 1,
      enabled: this.enabled,
      scripts: this.scripts.map(s => ({ path: s.path, enabled: s.enabled, properties: s.properties })),
    };
  }

  override deserialize(data: Record<string, any>, _ctx: DeserializationContext): void {
    this.enabled = data.enabled ?? true;
    if (data.scripts) {
      this.scripts = (data.scripts as any[]).map((e: any) => ({
        path:       e.path ?? '',
        enabled:    e.enabled ?? true,
        properties: e.properties ?? {},
      }));
    } else if (data.scriptName) {
      // Backward compat: old single-script format
      this.scripts = [{ path: data.scriptName, enabled: true, properties: data.properties ?? {} }];
    }
  }
}

// ── Particle Emitter ──────────────────────────────────────────────────────────

@component({
  typeId: 'ParticleEmitter',
  displayName: 'Particle Emitter',
  icon: '✦',
  category: 'Effects',
  hierarchyIcon: { icon: 'particle', color: 'var(--accent-yellow)' },
  hierarchyIconPriority: 20,
})
export class ParticleEmitterComponent extends BaseComponent {
  readonly typeId = 'ParticleEmitter';

  @field({ type: 'number', label: 'Max Particles', step: 100, min: 1 })
  maxParticles = 1000;

  @field({ type: 'number', label: 'Emission Rate', step: 10, min: 0 })
  emissionRate = 100;

  @field({ type: 'vector2', label: 'Lifetime (min/max)', group: 'Particle' })
  lifetime = new THREE.Vector2(1, 3);

  @field({ type: 'vector2', label: 'Speed (min/max)', group: 'Particle' })
  speed = new THREE.Vector2(1, 5);

  @field({ type: 'vector2', label: 'Size (min/max)', group: 'Particle' })
  size = new THREE.Vector2(0.1, 0.5);

  @field({ type: 'color', label: 'Start Color', group: 'Color' })
  startColor = new THREE.Color(1, 0.5, 0.1);

  @field({ type: 'color', label: 'End Color', group: 'Color' })
  endColor = new THREE.Color(1, 0.1, 0);

  @field({ type: 'number', label: 'Gravity', step: 0.5 })
  gravity = -2;

  @field({ type: 'slider', label: 'Spread', min: 0, max: 3.14, step: 0.01 })
  spread = 0.3;

  @field({ type: 'boolean', label: 'World Space' })
  worldSpace = true;

  @field({ type: 'asset', label: 'Texture', assetType: 'texture' })
  texture: string | null = null;

  @field({ type: 'boolean', label: 'Soft Particles', group: 'Rendering' })
  softParticles = false;

  @field({ type: 'slider', label: 'Soft Distance', min: 0.1, max: 10, step: 0.1, group: 'Rendering', visibleIf: s => s.softParticles, dependsOn: ['softParticles'] })
  softDistance = 1.0;

  /** Runtime particle system — NOT serialized */
  particleSystem: any = null;
}

// ── Audio Source ──────────────────────────────────────────────────────────────

@component({
  typeId: 'AudioSource',
  displayName: 'Audio Source',
  icon: '♪',
  category: 'Audio',
})
export class AudioSourceComponent extends BaseComponent {
  readonly typeId = 'AudioSource';

  @field({ type: 'asset', label: 'Clip', assetType: 'audio' })
  clip = '';

  @field({ type: 'slider', label: 'Volume', min: 0, max: 1, step: 0.01 })
  volume = 1;

  @field({ type: 'slider', label: 'Pitch', min: 0.1, max: 3, step: 0.05 })
  pitch = 1;

  @field({ type: 'boolean', label: 'Loop' })
  loop = false;

  @field({ type: 'boolean', label: 'Play On Start' })
  playOnStart = false;

  @field({ type: 'boolean', label: 'Spatial' })
  spatial = true;

  @field({ type: 'number', label: 'Min Distance', step: 0.5, visibleIf: s => s.spatial, dependsOn: ['spatial'] })
  minDistance = 1;

  @field({ type: 'number', label: 'Max Distance', step: 5, visibleIf: s => s.spatial, dependsOn: ['spatial'] })
  maxDistance = 50;

  @field({ type: 'slider', label: 'Rolloff Factor', min: 0, max: 5, step: 0.1, visibleIf: s => s.spatial, dependsOn: ['spatial'] })
  rolloffFactor = 1;

  /** Runtime audio nodes — NOT serialized */
  source:     AudioBufferSourceNode | null = null;
  gainNode:   GainNode | null = null;
  pannerNode: PannerNode | null = null;
}

// ── Sprite ────────────────────────────────────────────────────────────────────

@component({
  typeId: 'Sprite',
  displayName: 'Sprite',
  icon: '🖼',
  category: 'Rendering',
  hierarchyIcon: { icon: '🖼', color: 'var(--accent-purple)' },
  hierarchyIconPriority: 5,
})
export class SpriteComponent extends BaseComponent {
  readonly typeId = 'Sprite';

  @field({ type: 'asset', label: 'Texture', assetType: 'texture' })
  texturePath: string | null = null;

  @field({ type: 'color', label: 'Color' })
  color = new THREE.Color(1, 1, 1);

  @field({ type: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.01 })
  opacity = 1;

  @field({ type: 'boolean', label: 'Flip X' })
  flipX = false;

  @field({ type: 'boolean', label: 'Flip Y' })
  flipY = false;

  @field({ type: 'number', label: 'Pixels Per Unit', step: 10, min: 1 })
  pixelsPerUnit = 100;

  @field({ type: 'number', label: 'Sorting Layer', step: 1, group: 'Sorting' })
  sortingLayer = 0;

  @field({ type: 'number', label: 'Sorting Order', step: 1, group: 'Sorting' })
  sortingOrder = 0;

  @field({ type: 'number', label: 'SVG Render Size', step: 64, min: 64 })
  svgRenderSize = 512;

  /** Runtime sprite mesh — NOT serialized */
  spriteMesh: THREE.Mesh | null = null;
  spriteTexture: THREE.Texture | null = null;
}

// ── Text Renderer ─────────────────────────────────────────────────────────────

export type TextAlignment = 'left' | 'center' | 'right';

@component({
  typeId: 'TextRenderer',
  displayName: 'Text Renderer',
  icon: '𝐓',
  category: 'Rendering',
  hierarchyIcon: { icon: '𝐓', color: 'var(--accent)' },
  hierarchyIconPriority: 15,
})
export class TextRendererComponent extends BaseComponent {
  readonly typeId = 'TextRenderer';

  @field({ type: 'string', label: 'Text' })
  text = 'Hello World';

  @field({ type: 'asset', label: 'Font', assetType: 'font' })
  fontPath: string | null = null;

  @field({ type: 'number', label: 'Font Size', step: 0.1, min: 0.1 })
  fontSize = 1;

  @field({ type: 'color', label: 'Color' })
  color = new THREE.Color(1, 1, 1);

  @field({ type: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.01 })
  opacity = 1;

  @field({ type: 'select', label: 'Alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] })
  alignment: TextAlignment = 'center';

  @field({ type: 'number', label: 'Max Width', step: 0.5 })
  maxWidth = 0;

  @field({ type: 'boolean', label: 'Billboard' })
  billboard = false;

  /** Runtime — NOT serialized */
  textMesh:    THREE.Mesh | null = null;
  textTexture: THREE.CanvasTexture | null = null;
  _cacheKey = '';
}

// ── FUI (Fluxion UI) ──────────────────────────────────────────────────────────

export type FuiMode = 'screen' | 'world';

@component({
  typeId: 'Fui',
  displayName: 'FUI',
  icon: '◫',
  category: 'UI',
})
export class FuiComponent extends BaseComponent {
  readonly typeId = 'Fui';

  @field({ type: 'select', label: 'Mode', options: [{ value: 'screen', label: 'Screen' }, { value: 'world', label: 'World' }] })
  mode: FuiMode = 'screen';

  @field({ type: 'asset', label: 'FUI File', assetType: 'fui' })
  fuiPath = '';

  @field({ type: 'number', label: 'Screen X', group: 'Screen Space', visibleIf: s => s.mode === 'screen', dependsOn: ['mode'] })
  screenX = 0;

  @field({ type: 'number', label: 'Screen Y', group: 'Screen Space', visibleIf: s => s.mode === 'screen', dependsOn: ['mode'] })
  screenY = 0;

  @field({ type: 'number', label: 'World Width', step: 0.1, group: 'World Space', visibleIf: s => s.mode === 'world', dependsOn: ['mode'] })
  worldWidth = 1.6;

  @field({ type: 'number', label: 'World Height', step: 0.1, group: 'World Space', visibleIf: s => s.mode === 'world', dependsOn: ['mode'] })
  worldHeight = 0.9;

  @field({ type: 'boolean', label: 'Billboard', group: 'World Space', visibleIf: s => s.mode === 'world', dependsOn: ['mode'] })
  billboard = true;

  @field({ type: 'string', label: 'Play Animation', group: 'Animation' })
  playAnimation = '';

  @field({ type: 'slider', label: 'Animation Speed', min: 0.1, max: 5, step: 0.1, group: 'Animation' })
  animationSpeed = 1.0;

  /** @internal — set by FuiScriptApi — NOT serialized */
  _inlineDoc: unknown = undefined;
}

// ── Animation ─────────────────────────────────────────────────────────────────

@component({
  typeId: 'Animation',
  displayName: 'Animation',
  icon: '▶',
  category: 'Animation',
})
export class AnimationComponent extends BaseComponent {
  readonly typeId = 'Animation';

  /** Runtime animation clips — NOT serialized (loaded from model) */
  clips: Map<string, THREE.AnimationClip> = new Map();

  @field({ type: 'string', label: 'Current Clip' })
  currentClip = '';

  @field({ type: 'slider', label: 'Speed', min: 0, max: 5, step: 0.05 })
  speed = 1;

  @field({ type: 'boolean', label: 'Loop' })
  loop = true;

  @field({ type: 'slider', label: 'Blend Time', min: 0, max: 2, step: 0.05 })
  blendTime = 0.3;

  /** Runtime — NOT serialized */
  mixer:         THREE.AnimationMixer | null = null;
  currentAction: THREE.AnimationAction | null = null;
}

// ── Environment ───────────────────────────────────────────────────────────────

export type ToneMappingMode = 'None' | 'Linear' | 'Reinhard' | 'ACES' | 'AgX';
export type BackgroundMode  = 'color' | 'skybox';
export type FogMode         = 'exponential' | 'linear';
export type SkyboxMode      = 'panorama' | 'cubemap' | 'procedural';

export interface CubemapFaces {
  right: string | null;
  left: string | null;
  top: string | null;
  bottom: string | null;
  front: string | null;
  back: string | null;
}

@component({
  typeId: 'Environment',
  displayName: 'Environment',
  icon: '🌍',
  category: 'Rendering',
  showInAddMenu: true,
  allowMultiple: false,
})
export class EnvironmentComponent extends BaseComponent {
  readonly typeId = 'Environment';

  // ── Background ──
  @field({ type: 'select', label: 'Mode', options: [{ value: 'color', label: 'Color' }, { value: 'skybox', label: 'Skybox' }], group: 'Background' })
  backgroundMode: BackgroundMode = 'color';
  @field({ type: 'color', label: 'Color', group: 'Background', visibleIf: s => s.backgroundMode === 'color', dependsOn: ['backgroundMode'] })
  backgroundColor = new THREE.Color(0x0a0e17);
  @field({ type: 'select', label: 'Skybox Mode', group: 'Background', options: [{ value: 'panorama', label: 'Panorama' }, { value: 'cubemap', label: 'Cubemap' }, { value: 'procedural', label: 'Procedural' }], visibleIf: s => s.backgroundMode === 'skybox', dependsOn: ['backgroundMode'] })
  skyboxMode: SkyboxMode = 'panorama';
  @field({ type: 'asset', label: 'Skybox Panorama', assetType: 'texture', group: 'Background', visibleIf: s => s.backgroundMode === 'skybox' && s.skyboxMode === 'panorama', dependsOn: ['backgroundMode', 'skyboxMode'] })
  skyboxPath: string | null = null;
  skyboxFaces: CubemapFaces = { right: null, left: null, top: null, bottom: null, front: null, back: null };

  // ── Ambient ──
  @field({ type: 'color', label: 'Color', group: 'Ambient' })
  ambientColor = new THREE.Color(0.27, 0.27, 0.35);
  @field({ type: 'slider', label: 'Intensity', min: 0, max: 5, step: 0.05, group: 'Ambient' })
  ambientIntensity = 0.5;

  // ── Fog ──
  @field({ type: 'boolean', label: 'Enabled', group: 'Fog' })
  fogEnabled = true;
  @field({ type: 'color', label: 'Color', group: 'Fog', visibleIf: s => s.fogEnabled, dependsOn: ['fogEnabled'] })
  fogColor = new THREE.Color(0.1, 0.1, 0.15);
  @field({ type: 'select', label: 'Mode', group: 'Fog', options: [{ value: 'exponential', label: 'Exponential' }, { value: 'linear', label: 'Linear' }], visibleIf: s => s.fogEnabled, dependsOn: ['fogEnabled'] })
  fogMode: FogMode = 'exponential';
  @field({ type: 'slider', label: 'Density', min: 0, max: 0.1, step: 0.001, group: 'Fog', visibleIf: s => s.fogEnabled && s.fogMode === 'exponential', dependsOn: ['fogEnabled', 'fogMode'] })
  fogDensity = 0.008;
  @field({ type: 'number', label: 'Near', group: 'Fog', visibleIf: s => s.fogEnabled && s.fogMode === 'linear', dependsOn: ['fogEnabled', 'fogMode'] })
  fogNear = 10;
  @field({ type: 'number', label: 'Far', group: 'Fog', visibleIf: s => s.fogEnabled && s.fogMode === 'linear', dependsOn: ['fogEnabled', 'fogMode'] })
  fogFar = 100;

  // ── Tone Mapping ──
  @field({ type: 'select', label: 'Tone Mapping', group: 'Tone Mapping', options: [{ value: 'None', label: 'None' }, { value: 'Linear', label: 'Linear' }, { value: 'Reinhard', label: 'Reinhard' }, { value: 'ACES', label: 'ACES' }, { value: 'AgX', label: 'AgX' }] })
  toneMapping: ToneMappingMode = 'ACES';
  @field({ type: 'slider', label: 'Exposure', min: 0, max: 5, step: 0.05, group: 'Tone Mapping' })
  exposure = 1.2;

  // ── Bloom ──
  @field({ type: 'boolean', label: 'Enabled', group: 'Bloom' })
  bloomEnabled = true;
  @field({ type: 'slider', label: 'Threshold', min: 0, max: 3, step: 0.05, group: 'Bloom', visibleIf: s => s.bloomEnabled, dependsOn: ['bloomEnabled'] })
  bloomThreshold = 0.8;
  @field({ type: 'slider', label: 'Strength', min: 0, max: 3, step: 0.05, group: 'Bloom', visibleIf: s => s.bloomEnabled, dependsOn: ['bloomEnabled'] })
  bloomStrength = 0.5;
  @field({ type: 'slider', label: 'Radius', min: 0, max: 1, step: 0.05, group: 'Bloom', visibleIf: s => s.bloomEnabled, dependsOn: ['bloomEnabled'] })
  bloomRadius = 0.4;

  // ── SSAO ──
  @field({ type: 'boolean', label: 'Enabled', group: 'SSAO' })
  ssaoEnabled = false;
  @field({ type: 'slider', label: 'Radius', min: 0.1, max: 5, step: 0.05, group: 'SSAO', visibleIf: s => s.ssaoEnabled, dependsOn: ['ssaoEnabled'] })
  ssaoRadius = 0.5;
  @field({ type: 'slider', label: 'Bias', min: 0, max: 0.5, step: 0.001, group: 'SSAO', visibleIf: s => s.ssaoEnabled, dependsOn: ['ssaoEnabled'] })
  ssaoBias = 0.025;
  @field({ type: 'slider', label: 'Intensity', min: 0, max: 5, step: 0.1, group: 'SSAO', visibleIf: s => s.ssaoEnabled, dependsOn: ['ssaoEnabled'] })
  ssaoIntensity = 1.0;

  // ── SSR ──
  @field({ type: 'boolean', label: 'Enabled', group: 'SSR' })
  ssrEnabled = false;
  @field({ type: 'number', label: 'Max Distance', group: 'SSR', visibleIf: s => s.ssrEnabled, dependsOn: ['ssrEnabled'] })
  ssrMaxDistance = 50;
  @field({ type: 'slider', label: 'Thickness', min: 0, max: 5, step: 0.05, group: 'SSR', visibleIf: s => s.ssrEnabled, dependsOn: ['ssrEnabled'] })
  ssrThickness = 0.5;
  @field({ type: 'slider', label: 'Stride', min: 0, max: 5, step: 0.05, group: 'SSR', visibleIf: s => s.ssrEnabled, dependsOn: ['ssrEnabled'] })
  ssrStride = 0.3;
  @field({ type: 'slider', label: 'Fresnel', min: 0, max: 3, step: 0.05, group: 'SSR', visibleIf: s => s.ssrEnabled, dependsOn: ['ssrEnabled'] })
  ssrFresnel = 1.0;
  @field({ type: 'slider', label: 'Opacity', min: 0, max: 1, step: 0.05, group: 'SSR', visibleIf: s => s.ssrEnabled, dependsOn: ['ssrEnabled'] })
  ssrOpacity = 0.5;
  ssrResolutionScale = 0.5;
  ssrInfiniteThick = false;
  ssrDistanceAttenuation = true;

  // ── SSGI ──
  @field({ type: 'boolean', label: 'Enabled', group: 'SSGI' })
  ssgiEnabled = false;
  @field({ type: 'number', label: 'Slice Count', step: 1, group: 'SSGI', visibleIf: s => s.ssgiEnabled, dependsOn: ['ssgiEnabled'] })
  ssgiSliceCount = 2;
  @field({ type: 'number', label: 'Step Count', step: 1, group: 'SSGI', visibleIf: s => s.ssgiEnabled, dependsOn: ['ssgiEnabled'] })
  ssgiStepCount = 8;
  @field({ type: 'number', label: 'Radius', group: 'SSGI', visibleIf: s => s.ssgiEnabled, dependsOn: ['ssgiEnabled'] })
  ssgiRadius = 12;
  @field({ type: 'number', label: 'Thickness', group: 'SSGI', visibleIf: s => s.ssgiEnabled, dependsOn: ['ssgiEnabled'] })
  ssgiThickness = 1;
  ssgiExpFactor = 2;
  ssgiAoIntensity = 1;
  ssgiGiIntensity = 10;
  ssgiBackfaceLighting = 0;
  ssgiUseLinearThickness = false;
  ssgiScreenSpaceSampling = true;

  // ── Volumetric Clouds ──
  @field({ type: 'boolean', label: 'Enabled', group: 'Clouds' })
  cloudsEnabled = false;
  @field({ type: 'number', label: 'Min Height', group: 'Clouds', visibleIf: s => s.cloudsEnabled, dependsOn: ['cloudsEnabled'] })
  cloudMinHeight = 200;
  @field({ type: 'number', label: 'Max Height', group: 'Clouds', visibleIf: s => s.cloudsEnabled, dependsOn: ['cloudsEnabled'] })
  cloudMaxHeight = 400;
  @field({ type: 'slider', label: 'Coverage', min: 0, max: 1, step: 0.05, group: 'Clouds', visibleIf: s => s.cloudsEnabled, dependsOn: ['cloudsEnabled'] })
  cloudCoverage = 0.5;
  @field({ type: 'slider', label: 'Density', min: 0, max: 1, step: 0.05, group: 'Clouds', visibleIf: s => s.cloudsEnabled, dependsOn: ['cloudsEnabled'] })
  cloudDensity = 0.3;
  @field({ type: 'slider', label: 'Absorption', min: 0, max: 5, step: 0.1, group: 'Clouds', visibleIf: s => s.cloudsEnabled, dependsOn: ['cloudsEnabled'] })
  cloudAbsorption = 1.0;
  @field({ type: 'slider', label: 'Scatter', min: 0, max: 5, step: 0.1, group: 'Clouds', visibleIf: s => s.cloudsEnabled, dependsOn: ['cloudsEnabled'] })
  cloudScatter = 1.0;
  @field({ type: 'color', label: 'Color', group: 'Clouds', visibleIf: s => s.cloudsEnabled, dependsOn: ['cloudsEnabled'] })
  cloudColor = new THREE.Color(1, 1, 1);
  @field({ type: 'slider', label: 'Speed', min: 0, max: 10, step: 0.1, group: 'Clouds', visibleIf: s => s.cloudsEnabled, dependsOn: ['cloudsEnabled'] })
  cloudSpeed = 1.0;

  // ── Depth of Field ──
  @field({ type: 'boolean', label: 'Enabled', group: 'Depth of Field' })
  dofEnabled = false;
  @field({ type: 'number', label: 'Focus Distance', step: 0.5, group: 'Depth of Field', visibleIf: s => s.dofEnabled, dependsOn: ['dofEnabled'] })
  dofFocusDistance = 10;
  @field({ type: 'slider', label: 'Aperture', min: 0, max: 0.5, step: 0.001, group: 'Depth of Field', visibleIf: s => s.dofEnabled, dependsOn: ['dofEnabled'] })
  dofAperture = 0.025;
  @field({ type: 'slider', label: 'Max Blur', min: 0, max: 30, step: 0.5, group: 'Depth of Field', visibleIf: s => s.dofEnabled, dependsOn: ['dofEnabled'] })
  dofMaxBlur = 10;

  // ── Procedural Sky ──
  @field({ type: 'slider', label: 'Turbidity', min: 0, max: 20, step: 0.1, group: 'Procedural Sky', visibleIf: s => s.backgroundMode === 'skybox' && s.skyboxMode === 'procedural', dependsOn: ['backgroundMode', 'skyboxMode'] })
  skyTurbidity = 2;
  @field({ type: 'slider', label: 'Rayleigh', min: 0, max: 5, step: 0.1, group: 'Procedural Sky', visibleIf: s => s.backgroundMode === 'skybox' && s.skyboxMode === 'procedural', dependsOn: ['backgroundMode', 'skyboxMode'] })
  skyRayleigh = 1;
  @field({ type: 'slider', label: 'Mie Coefficient', min: 0, max: 0.1, step: 0.001, group: 'Procedural Sky', visibleIf: s => s.backgroundMode === 'skybox' && s.skyboxMode === 'procedural', dependsOn: ['backgroundMode', 'skyboxMode'] })
  skyMieCoefficient = 0.005;
  @field({ type: 'slider', label: 'Mie Directional G', min: 0, max: 1, step: 0.01, group: 'Procedural Sky', visibleIf: s => s.backgroundMode === 'skybox' && s.skyboxMode === 'procedural', dependsOn: ['backgroundMode', 'skyboxMode'] })
  skyMieDirectionalG = 0.8;
  @field({ type: 'slider', label: 'Sun Elevation', min: -90, max: 90, step: 1, group: 'Procedural Sky', visibleIf: s => s.backgroundMode === 'skybox' && s.skyboxMode === 'procedural', dependsOn: ['backgroundMode', 'skyboxMode'] })
  sunElevation = 45;
  @field({ type: 'slider', label: 'Sun Azimuth', min: 0, max: 360, step: 1, group: 'Procedural Sky', visibleIf: s => s.backgroundMode === 'skybox' && s.skyboxMode === 'procedural', dependsOn: ['backgroundMode', 'skyboxMode'] })
  sunAzimuth = 180;

  // ── Vignette ──
  @field({ type: 'boolean', label: 'Enabled', group: 'Vignette' })
  vignetteEnabled = false;
  @field({ type: 'slider', label: 'Intensity', min: 0, max: 2, step: 0.05, group: 'Vignette', visibleIf: s => s.vignetteEnabled, dependsOn: ['vignetteEnabled'] })
  vignetteIntensity = 0.3;
  @field({ type: 'slider', label: 'Roundness', min: 0, max: 1, step: 0.05, group: 'Vignette', visibleIf: s => s.vignetteEnabled, dependsOn: ['vignetteEnabled'] })
  vignetteRoundness = 0.5;

  // ── Film Effects ──
  @field({ type: 'slider', label: 'Chromatic Aberration', min: 0, max: 5, step: 0.05, group: 'Film Effects' })
  chromaticAberration = 0;
  @field({ type: 'slider', label: 'Film Grain', min: 0, max: 1, step: 0.01, group: 'Film Effects' })
  filmGrain = 0;

  // ── Volumetric Fog ──
  @field({ type: 'boolean', label: 'Enabled', group: 'Volumetric Fog' })
  vfogEnabled = false;
  @field({ type: 'slider', label: 'Density', min: 0, max: 1, step: 0.005, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogDensity = 0.05;
  @field({ type: 'color', label: 'Albedo', group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogAlbedo = new THREE.Color(0.8, 0.85, 0.9);
  @field({ type: 'slider', label: 'Scatter', min: 0, max: 1, step: 0.01, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogScatter = 0.2;
  @field({ type: 'slider', label: 'Absorption', min: 0, max: 5, step: 0.05, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogAbsorption = 1.0;
  @field({ type: 'number', label: 'Height Base', step: 1, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogHeightBase = 0;
  @field({ type: 'slider', label: 'Height Falloff', min: 0, max: 1, step: 0.01, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogHeightFalloff = 0.1;
  @field({ type: 'color', label: 'Emission', group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogEmission = new THREE.Color(0, 0, 0);
  @field({ type: 'slider', label: 'Emission Energy', min: 0, max: 10, step: 0.1, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogEmissionEnergy = 0;
  @field({ type: 'slider', label: 'Affect Sky', min: 0, max: 1, step: 0.05, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogAffectSky = 0.5;
  @field({ type: 'number', label: 'Steps', step: 8, min: 8, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogSteps = 32;
  @field({ type: 'number', label: 'Max Distance', step: 10, group: 'Volumetric Fog', visibleIf: s => s.vfogEnabled, dependsOn: ['vfogEnabled'] })
  vfogMaxDistance = 200;

  // ── Shadows ──
  @field({ type: 'number', label: 'Cascades', step: 1, min: 0, max: 4, group: 'Shadows' })
  shadowCascades = 0;
  @field({ type: 'number', label: 'Shadow Distance', step: 10, group: 'Shadows', visibleIf: s => s.shadowCascades > 0, dependsOn: ['shadowCascades'] })
  shadowDistance = 200;

  /** Custom serialize — too many fields to rely on auto-serialize for skyboxFaces object */
  override serialize(): Record<string, any> {
    // Use auto-serialize from BaseComponent for all @field properties
    const base = super.serialize();
    // Add skyboxFaces (object with nullable strings — not a standard FieldType)
    base.skyboxFaces = { ...this.skyboxFaces };
    return base;
  }

  override deserialize(data: Record<string, any>, ctx: DeserializationContext): void {
    super.deserialize(data, ctx);
    // Restore skyboxFaces separately (object, not handled by auto-deserialize)
    if (data.skyboxFaces) {
      this.skyboxFaces = {
        right:  data.skyboxFaces.right  ?? null,
        left:   data.skyboxFaces.left   ?? null,
        top:    data.skyboxFaces.top    ?? null,
        bottom: data.skyboxFaces.bottom ?? null,
        front:  data.skyboxFaces.front  ?? null,
        back:   data.skyboxFaces.back   ?? null,
      };
    }
    // Fix shadowCascades default (old scenes may not have it)
    if (!('shadowCascades' in data) && 'shadowDistance' in data) {
      this.shadowCascades = 4; // Migration: old scenes with shadowDistance had cascades on
    }
  }
}

// ── CSG Brush ─────────────────────────────────────────────────────────────────

export type CSGBrushShape = 'box' | 'cylinder' | 'sphere' | 'wedge' | 'stairs' | 'arch' | 'cone';
export type CSGOperation  = 'additive' | 'subtractive';

@component({
  typeId: 'CSGBrush',
  displayName: 'CSG Brush',
  icon: '⬜',
  category: 'Geometry',
})
export class CSGBrushComponent extends BaseComponent {
  readonly typeId = 'CSGBrush';

  @field({ type: 'select', label: 'Shape', options: [{ value: 'box', label: 'Box' }, { value: 'cylinder', label: 'Cylinder' }, { value: 'sphere', label: 'Sphere' }, { value: 'wedge', label: 'Wedge' }, { value: 'stairs', label: 'Stairs' }, { value: 'arch', label: 'Arch' }, { value: 'cone', label: 'Cone' }] })
  shape: CSGBrushShape = 'box';

  @field({ type: 'select', label: 'Operation', options: [{ value: 'additive', label: 'Additive' }, { value: 'subtractive', label: 'Subtractive' }] })
  operation: CSGOperation = 'additive';

  @field({ type: 'vector3', label: 'Size', visibleIf: s => s.shape !== 'sphere', dependsOn: ['shape'] })
  size = new THREE.Vector3(1, 1, 1);

  @field({ type: 'number', label: 'Radius', step: 0.05, visibleIf: s => s.shape === 'sphere' || s.shape === 'cylinder' || s.shape === 'arch' || s.shape === 'cone', dependsOn: ['shape'] })
  radius = 0.5;

  @field({ type: 'number', label: 'Segments', step: 4, min: 3 })
  segments = 16;

  @field({ type: 'number', label: 'Stair Steps', step: 1, min: 2, visibleIf: s => s.shape === 'stairs', dependsOn: ['shape'] })
  stairSteps = 4;

  @field({ type: 'boolean', label: 'Generate Collision' })
  generateCollision = true;

  @field({ type: 'boolean', label: 'Cast Shadow' })
  castShadow = true;

  @field({ type: 'boolean', label: 'Receive Shadow' })
  receiveShadow = true;

  @field({ type: 'asset', label: 'Material', assetType: ['material', 'visual_material'] })
  materialPath: string | null = null;

  /** Runtime — NOT serialized */
  _mesh:    THREE.Mesh | null = null;
  _dirty    = true;
  _version  = 0;

  override deserialize(data: Record<string, any>, ctx: DeserializationContext): void {
    super.deserialize(data, ctx);
    this._dirty = true; // Always rebuild mesh on load
  }
}

// ── Fog Volume ────────────────────────────────────────────────────────────────

export type FogVolumeShape = 'box' | 'ellipsoid' | 'world';

@component({
  typeId: 'FogVolume',
  displayName: 'Fog Volume',
  icon: '☁',
  category: 'Effects',
})
export class FogVolumeComponent extends BaseComponent {
  readonly typeId = 'FogVolume';

  @field({ type: 'select', label: 'Shape', options: [{ value: 'box', label: 'Box' }, { value: 'ellipsoid', label: 'Ellipsoid' }, { value: 'world', label: 'World' }] })
  shape: FogVolumeShape = 'box';

  @field({ type: 'slider', label: 'Density', min: 0, max: 1, step: 0.005 })
  density = 0.1;

  @field({ type: 'color', label: 'Albedo' })
  albedo = new THREE.Color(0.8, 0.85, 0.9);

  @field({ type: 'color', label: 'Emission' })
  emission = new THREE.Color(0, 0, 0);

  @field({ type: 'slider', label: 'Emission Energy', min: 0, max: 10, step: 0.1 })
  emissionEnergy = 0;

  @field({ type: 'boolean', label: 'Negative (Remove Fog)' })
  negative = false;
}

// ── Helper: Geometry builder (used by MeshRenderer deserialize) ───────────────

function buildGeometry(primitiveType: string, params: any): THREE.BufferGeometry {
  switch (primitiveType) {
    case 'cube':
      return new THREE.BoxGeometry(params.width ?? 1, params.height ?? 1, params.depth ?? 1);
    case 'sphere':
      return new THREE.SphereGeometry(params.radius ?? 0.5, 32, 32);
    case 'cylinder':
      return new THREE.CylinderGeometry(params.radiusTop ?? 0.5, params.radiusBottom ?? 0.5, params.height ?? 1, 32);
    case 'cone':
      return new THREE.ConeGeometry(params.radius ?? 0.5, params.height ?? 1, 32);
    case 'plane':
      return new THREE.PlaneGeometry(params.width ?? 1, params.height ?? 1).rotateX(-Math.PI / 2);
    case 'capsule':
      return new THREE.CapsuleGeometry(params.radius ?? 0.3, params.height ?? 0.6, 8, 16);
    case 'torus':
      return new THREE.TorusGeometry(params.radius ?? 0.5, params.tube ?? 0.15, 16, 48);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function buildPrimitiveMaterial(matData: any): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: matData.color ? new THREE.Color(matData.color[0], matData.color[1], matData.color[2]) : 0x888888,
    roughness: matData.roughness ?? 0.6,
    metalness: matData.metalness ?? 0.1,
  });
  if (matData.emissive) {
    material.emissive = new THREE.Color(matData.emissive[0], matData.emissive[1], matData.emissive[2]);
    material.emissiveIntensity = matData.emissiveIntensity ?? 1;
  }
  if (matData.transparent) { material.transparent = true; material.opacity = matData.opacity ?? 1; }
  if (matData.doubleSided) material.side = THREE.DoubleSide;
  if (matData.wireframe)   material.wireframe = true;
  if (matData.alphaTest)   material.alphaTest = matData.alphaTest;
  if (matData.normalScale !== undefined)
    material.normalScale = new THREE.Vector2(matData.normalScale, matData.normalScale);
  if (matData.aoIntensity !== undefined)    material.aoMapIntensity  = matData.aoIntensity;
  if (matData.envMapIntensity !== undefined) material.envMapIntensity = matData.envMapIntensity;
  const mapKeys = ['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
  for (const key of mapKeys) {
    if (matData[key]) {
      if (!material.userData) material.userData = {};
      material.userData[key] = matData[key];
    }
  }
  return material;
}
