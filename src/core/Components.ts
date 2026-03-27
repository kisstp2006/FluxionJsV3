// ============================================================
// FluxionJS V2 — Built-in Component Definitions
// Common components inspired by Nuake + s&box + LumixEngine
// ============================================================

import { Component, EntityId } from './ECS';
import * as THREE from 'three';

// ── Transform (every entity needs one) ──

export class TransformComponent implements Component {
  readonly type = 'Transform';
  entityId: EntityId = 0;
  enabled = true;

  position = new THREE.Vector3(0, 0, 0);
  rotation = new THREE.Euler(0, 0, 0);
  scale = new THREE.Vector3(1, 1, 1);
  quaternion = new THREE.Quaternion();

  private _matrix = new THREE.Matrix4();
  private _worldMatrix = new THREE.Matrix4();

  get localMatrix(): THREE.Matrix4 {
    this._matrix.compose(this.position, this.quaternion, this.scale);
    return this._matrix;
  }

  get worldMatrix(): THREE.Matrix4 {
    return this._worldMatrix;
  }

  set worldMatrix(m: THREE.Matrix4) {
    this._worldMatrix.copy(m);
  }

  lookAt(target: THREE.Vector3): void {
    const m = new THREE.Matrix4();
    m.lookAt(this.position, target, new THREE.Vector3(0, 1, 0));
    this.quaternion.setFromRotationMatrix(m);
    this.rotation.setFromQuaternion(this.quaternion);
  }
}

// ── Mesh Renderer ──

export class MeshRendererComponent implements Component {
  readonly type = 'MeshRenderer';
  entityId: EntityId = 0;
  enabled = true;

  mesh: THREE.Mesh | THREE.Group | null = null;
  castShadow = true;
  receiveShadow = true;
  layer = 0;
  /** Tracks the primitive type used to create this mesh (for serialization) */
  primitiveType?: string;
  /** Project-relative path to a 3D model asset (glTF/GLB). When set, mesh is loaded from the asset pipeline. */
  modelPath?: string;
  /** Project-relative path to a .fluxmat material asset. When set, material is loaded from the asset pipeline. */
  materialPath?: string;
  /** Per-slot material overrides for .fluxmesh models. Sparse — only non-default entries. */
  materialSlots?: Array<{ slotIndex: number; materialPath: string }>;
  /** UV tiling (repeat). Default {x:1, y:1}. Applied to all texture maps on the material. */
  uvScale = { x: 1, y: 1 };
  /** UV offset. Default {x:0, y:0}. Shifts texture coordinates. */
  uvOffset = { x: 0, y: 0 };
  /** UV rotation in degrees. Default 0. Rotates around center (0.5, 0.5). */
  uvRotation = 0;
}

// ── Camera ──

export class CameraComponent implements Component {
  readonly type = 'Camera';
  entityId: EntityId = 0;
  enabled = true;

  fov = 60;
  near = 0.1;
  far = 1000;
  isOrthographic = false;
  orthoSize = 10;
  clearColor = new THREE.Color(0x1a1a2e);
  priority = 0;
  isMain = false;

  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
}

// ── Lights (PBR lighting like Nuake) ──

export type LightType = 'directional' | 'point' | 'spot' | 'ambient';

export class LightComponent implements Component {
  readonly type = 'Light';
  entityId: EntityId = 0;
  enabled = true;

  lightType: LightType = 'point';
  color = new THREE.Color(1, 1, 1);
  intensity = 1;
  range = 10;
  spotAngle = 45;
  spotPenumbra = 0.1;
  castShadow = true;
  shadowMapSize = 2048;

  /** Project-relative path to a cookie/projection texture (spot lights only) */
  cookieTexturePath: string | null = null;
  /** Runtime cached cookie texture */
  cookieTexture: THREE.Texture | null = null;

  light: THREE.Light | null = null;
}

// ── Rigidbody (physics — inspired by Nuake's Jolt integration) ──

export type BodyType = 'dynamic' | 'static' | 'kinematic';

export class RigidbodyComponent implements Component {
  readonly type = 'Rigidbody';
  entityId: EntityId = 0;
  enabled = true;

  bodyType: BodyType = 'dynamic';
  mass = 1;
  linearDamping = 0;
  angularDamping = 0.05;
  gravityScale = 1;
  friction = 0.5;
  restitution = 0.3;
  isContinuous = false;

  // Runtime handle — set by physics system
  bodyHandle: any = null;
}

// ── Colliders ──

export type ColliderShape = 'box' | 'sphere' | 'capsule' | 'mesh' | 'convex';

export class ColliderComponent implements Component {
  readonly type = 'Collider';
  entityId: EntityId = 0;
  enabled = true;

  shape: ColliderShape = 'box';
  size = new THREE.Vector3(1, 1, 1);
  radius = 0.5;
  height = 2;
  isTrigger = false;
  offset = new THREE.Vector3(0, 0, 0);

  colliderHandle: any = null;
}

// ── Script Component (like s&box C# scripts) ──

export class ScriptComponent implements Component {
  readonly type = 'Script';
  entityId: EntityId = 0;
  enabled = true;

  scriptName = '';
  properties: Record<string, any> = {};

  onStart?: () => void;
  onUpdate?: (dt: number) => void;
  onFixedUpdate?: (dt: number) => void;
  onDestroy?: () => void;
}

// ── Particle Emitter (like Nuake particles) ──

export class ParticleEmitterComponent implements Component {
  readonly type = 'ParticleEmitter';
  entityId: EntityId = 0;
  enabled = true;

  maxParticles = 1000;
  emissionRate = 100;
  lifetime = new THREE.Vector2(1, 3);
  speed = new THREE.Vector2(1, 5);
  size = new THREE.Vector2(0.1, 0.5);
  startColor = new THREE.Color(1, 0.5, 0.1);
  endColor = new THREE.Color(1, 0.1, 0);
  gravity = -2;
  spread = 0.3;
  worldSpace = true;
  texture: string | null = null;

  // Soft particles: requires a separate opaque-depth pre-pass to avoid
  // framebuffer feedback loop — disabled by default until the pipeline
  // provides a pre-captured depth texture.
  softParticles = false;
  softDistance = 1.0;

  particleSystem: any = null;
}

// ── Audio Source (spatialized audio like Nuake) ──

export class AudioSourceComponent implements Component {
  readonly type = 'AudioSource';
  entityId: EntityId = 0;
  enabled = true;

  clip = '';
  volume = 1;
  pitch = 1;
  loop = false;
  playOnStart = false;
  spatial = true;
  minDistance = 1;
  maxDistance = 50;
  rolloffFactor = 1;

  source: AudioBufferSourceNode | null = null;
  gainNode: GainNode | null = null;
  pannerNode: PannerNode | null = null;
}

// ── 2D Sprite Component ──

export class SpriteComponent implements Component {
  readonly type = 'Sprite';
  entityId: EntityId = 0;
  enabled = true;

  /** Project-relative path to sprite texture image */
  texturePath: string | null = null;
  color = new THREE.Color(1, 1, 1);
  opacity = 1;
  flipX = false;
  flipY = false;
  pixelsPerUnit = 100;
  sortingLayer = 0;
  sortingOrder = 0;

  /** Runtime sprite mesh (billboard quad) */
  spriteMesh: THREE.Mesh | null = null;
  /** Runtime loaded texture */
  spriteTexture: THREE.Texture | null = null;
}

// ── 3D Text Renderer Component ──

export type TextAlignment = 'left' | 'center' | 'right';

export class TextRendererComponent implements Component {
  readonly type = 'TextRenderer';
  entityId: EntityId = 0;
  enabled = true;

  text = 'Hello World';
  /** Project-relative path to a font file (.ttf, .otf, .woff, .woff2) */
  fontPath: string | null = null;
  fontSize = 1;
  color = new THREE.Color(1, 1, 1);
  opacity = 1;
  alignment: TextAlignment = 'center';
  maxWidth = 0;
  billboard = false;

  /** Runtime mesh for the rendered text */
  textMesh: THREE.Mesh | null = null;
  /** Runtime canvas texture */
  textTexture: THREE.CanvasTexture | null = null;
  /** Cache key to detect when rebuild is needed */
  _cacheKey = '';
}

// ── Fluxion UI (.fui) ──

export type FuiMode = 'screen' | 'world';

/**
 * FUI runtime component.
 * The document is loaded from `fuiPath` and rendered either as:
 * - screen-space: DOM overlay canvas
 * - world-space: Three.js plane with CanvasTexture
 */
export class FuiComponent implements Component {
  readonly type = 'Fui';
  entityId: EntityId = 0;
  enabled = true;

  mode: FuiMode = 'screen';

  /**
   * Project-relative or absolute path to a `.fui` file.
   * (When project is loaded, project-relative resolves via ProjectManager.)
   */
  fuiPath = '';

  // ── Screen space ──
  screenX = 0;
  screenY = 0;

  // ── World space ──
  worldWidth = 1.6;
  worldHeight = 0.9;
  billboard = true;

  // ── Animation ──
  /** ID of the FuiAnimation to auto-play. Empty string = no animation. */
  playAnimation = '';
  /** Playback speed multiplier (1 = normal, 2 = double speed). */
  animationSpeed = 1.0;
}

// ── Animation Component (skeletal animation like Nuake) ──

export class AnimationComponent implements Component {
  readonly type = 'Animation';
  entityId: EntityId = 0;
  enabled = true;

  clips: Map<string, THREE.AnimationClip> = new Map();
  currentClip = '';
  speed = 1;
  loop = true;
  blendTime = 0.3;

  mixer: THREE.AnimationMixer | null = null;
  currentAction: THREE.AnimationAction | null = null;
}

// ── Environment (Godot WorldEnvironment-style per-scene overrides) ──

export type ToneMappingMode = 'None' | 'Linear' | 'Reinhard' | 'ACES' | 'AgX';
export type BackgroundMode = 'color' | 'skybox';
export type FogMode = 'exponential' | 'linear';
export type SkyboxMode = 'panorama' | 'cubemap' | 'procedural';

/** Face order matches THREE.CubeTextureLoader: +X, -X, +Y, -Y, +Z, -Z */
export interface CubemapFaces {
  right: string | null;   // +X
  left: string | null;    // -X
  top: string | null;     // +Y
  bottom: string | null;  // -Y
  front: string | null;   // +Z
  back: string | null;    // -Z
}

export class EnvironmentComponent implements Component {
  readonly type = 'Environment';
  entityId: EntityId = 0;
  enabled = true;

  // ── Background ──
  backgroundMode: BackgroundMode = 'color';
  backgroundColor = new THREE.Color(0x0a0e17);
  skyboxMode: SkyboxMode = 'panorama';
  /** Single equirectangular panorama image path (project-relative) */
  skyboxPath: string | null = null;
  /** 6-face cubemap paths (project-relative) */
  skyboxFaces: CubemapFaces = { right: null, left: null, top: null, bottom: null, front: null, back: null };

  // ── Ambient Light ──
  ambientColor = new THREE.Color(0.27, 0.27, 0.35);
  ambientIntensity = 0.5;

  // ── Fog ──
  fogEnabled = true;
  fogColor = new THREE.Color(0.1, 0.1, 0.15);
  fogMode: FogMode = 'exponential';
  fogDensity = 0.008;
  fogNear = 10;
  fogFar = 100;

  // ── Tone Mapping ──
  toneMapping: ToneMappingMode = 'ACES';
  exposure = 1.2;

  // ── Bloom ──
  bloomEnabled = true;
  bloomThreshold = 0.8;
  bloomStrength = 0.5;
  bloomRadius = 0.4;

  // ── SSAO ──
  ssaoEnabled = false;
  ssaoRadius = 0.5;
  ssaoBias = 0.025;
  ssaoIntensity = 1.0;

  // ── SSR ──
  ssrEnabled = false;
  ssrMaxDistance = 50;
  ssrThickness = 0.5;
  ssrStride = 0.3;
  ssrFresnel = 1.0;
  ssrOpacity = 0.5;
  ssrResolutionScale = 0.5;
  ssrInfiniteThick = false;
  ssrDistanceAttenuation = true;

  // ── SSGI ──
  ssgiEnabled = false;
  ssgiSliceCount = 2;
  ssgiStepCount = 8;
  ssgiRadius = 12;
  ssgiThickness = 1;
  ssgiExpFactor = 2;
  ssgiAoIntensity = 1;
  ssgiGiIntensity = 10;
  ssgiBackfaceLighting = 0;
  ssgiUseLinearThickness = false;
  ssgiScreenSpaceSampling = true;

  // ── Volumetric Clouds ──
  cloudsEnabled = false;
  cloudMinHeight = 200;
  cloudMaxHeight = 400;
  cloudCoverage = 0.5;
  cloudDensity = 0.3;
  cloudAbsorption = 1.0;
  cloudScatter = 1.0;
  cloudColor = new THREE.Color(1, 1, 1);
  cloudSpeed = 1.0;

  // ── Depth of Field ──
  dofEnabled = false;
  dofFocusDistance = 10;
  dofAperture = 0.025;
  dofMaxBlur = 10;

  // ── Procedural Sky ──
  skyTurbidity = 2;
  skyRayleigh = 1;
  skyMieCoefficient = 0.005;
  skyMieDirectionalG = 0.8;
  sunElevation = 45;
  sunAzimuth = 180;

  // ── Vignette ──
  vignetteEnabled = false;
  vignetteIntensity = 0.3;
  vignetteRoundness = 0.5;

  // ── Chromatic Aberration & Film Grain ──
  chromaticAberration = 0;
  filmGrain = 0;

  // ── Shadows (CSM) ──
  shadowCascades = 0;   // 0 = off; set ≥ 2 to enable CSM
  shadowDistance = 200;
}

// ── CSG Brush (Constructive Solid Geometry for level building) ──

export type CSGBrushShape = 'box' | 'cylinder' | 'sphere' | 'wedge' | 'stairs' | 'arch' | 'cone';
export type CSGOperation = 'additive' | 'subtractive';

export class CSGBrushComponent implements Component {
  readonly type = 'CSGBrush';
  entityId: EntityId = 0;
  enabled = true;

  /** Brush primitive shape */
  shape: CSGBrushShape = 'box';
  /** Boolean operation: additive adds geometry, subtractive carves a hole */
  operation: CSGOperation = 'additive';

  /** Size of the brush primitive (local space) */
  size = new THREE.Vector3(1, 1, 1);
  /** Radius for sphere / cylinder / cone / arch shapes */
  radius = 0.5;
  /** Subdivision segments for curved shapes */
  segments = 16;
  /** Number of steps (stairs only) */
  stairSteps = 4;
  /** Whether the brush generates a physics collider */
  generateCollision = true;
  /** Cast shadow */
  castShadow = true;
  /** Receive shadow */
  receiveShadow = true;
  /** Material asset path (.fluxmat) — if null, uses default gray */
  materialPath: string | null = null;

  // ── Runtime (managed by CSGSystem) ──
  /** Cached THREE mesh — set by CSGSystem, not serialized */
  _mesh: THREE.Mesh | null = null;
  /** Dirty flag — rebuild needed */
  _dirty = true;
  /** Version counter for change detection */
  _version = 0;
}
