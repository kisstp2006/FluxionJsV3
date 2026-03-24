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
  startColor = new THREE.Color(1, 1, 1);
  endColor = new THREE.Color(1, 1, 1);
  gravity = -9.81;
  spread = 0.5;
  worldSpace = true;
  texture: string | null = null;

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

  texture = '';
  color = new THREE.Color(1, 1, 1);
  opacity = 1;
  flipX = false;
  flipY = false;
  pixelsPerUnit = 100;
  sortingLayer = 0;
  sortingOrder = 0;

  spriteMesh: THREE.Mesh | null = null;
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
