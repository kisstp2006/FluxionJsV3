// ============================================================
// FluxionJS V2 — Main Renderer
// Three.js WebGPU-ready renderer with PBR pipeline
// Inspired by Nuake PBR + LumixEngine rendering
// ============================================================

import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { ECSManager, EntityId, System, clearDirty, isDirty } from '../core/ECS';
import { EngineEvents } from '../core/EventSystem';
import {
  TransformComponent,
  MeshRendererComponent,
  CameraComponent,
  LightComponent,
} from '../core/Components';
import { PostProcessingPipeline } from './PostProcessing';
import { DebugDraw } from './DebugDraw';

export interface RendererConfig {
  shadows?: boolean;
  shadowMapSize?: number;
  toneMapping?: THREE.ToneMapping;
  toneMappingExposure?: number;
  outputColorSpace?: THREE.ColorSpace;
  antialias?: boolean;
  pixelRatio?: number;
}

export class FluxionRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly gizmoScene: THREE.Scene;
  readonly postProcessing: PostProcessingPipeline;

  readonly engine: Engine;
  private activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private entityToObject: Map<EntityId, THREE.Object3D> = new Map();
  private objectToEntity: Map<THREE.Object3D, EntityId> = new Map();
  private config: Required<RendererConfig>;

  constructor(engine: Engine, config: RendererConfig = {}) {
    this.engine = engine;
    this.config = {
      shadows: config.shadows ?? true,
      shadowMapSize: config.shadowMapSize ?? 2048,
      toneMapping: config.toneMapping ?? THREE.ACESFilmicToneMapping,
      toneMappingExposure: config.toneMappingExposure ?? 1.0,
      outputColorSpace: config.outputColorSpace ?? THREE.SRGBColorSpace,
      antialias: config.antialias ?? engine.config.antialias,
      pixelRatio: config.pixelRatio ?? Math.min(window.devicePixelRatio, 2),
    };

    // Create WebGL renderer (WebGPU fallback when available)
    this.renderer = new THREE.WebGLRenderer({
      canvas: engine.config.canvas,
      antialias: this.config.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });

    this.renderer.setSize(engine.config.width, engine.config.height);
    this.renderer.setPixelRatio(this.config.pixelRatio);
    this.renderer.shadowMap.enabled = this.config.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = this.config.toneMapping;
    this.renderer.toneMappingExposure = this.config.toneMappingExposure;
    this.renderer.outputColorSpace = this.config.outputColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.005);

    // Gizmo overlay scene (rendered after post-processing, no bloom/tonemapping)
    this.gizmoScene = new THREE.Scene();

    // Default camera
    this.activeCamera = new THREE.PerspectiveCamera(
      60,
      engine.config.width / engine.config.height,
      0.1,
      1000
    );
    this.activeCamera.position.set(0, 5, 10);

    // Post-processing pipeline (Nuake-inspired)
    this.postProcessing = new PostProcessingPipeline(
      this.renderer,
      this.scene,
      this.activeCamera
    );

    // Hook into engine events
    engine.events.on(EngineEvents.RENDER, () => this.render());
    engine.events.on(EngineEvents.RESIZE, (data: { width: number; height: number }) => {
      this.onResize(data.width, data.height);
    });

    // Register ECS systems
    engine.ecs.addSystem(new TransformSyncSystem(this));
    engine.ecs.addSystem(new MeshRendererSystem(this));
    engine.ecs.addSystem(new CameraSystem(this));
    engine.ecs.addSystem(new LightSystem(this));

    // Debug drawing: overlay (gizmoScene) + world (main scene for depth test)
    DebugDraw.init(this.gizmoScene, this.scene);

    // Register as subsystem
    engine.registerSubsystem('renderer', this);
  }

  render(): void {
    this.postProcessing.render();
    DebugDraw.flush();
    this.postProcessing.renderOverlay(this.gizmoScene, this.activeCamera);
  }

  setActiveCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera): void {
    this.activeCamera = camera;
    this.postProcessing.setCamera(camera);
  }

  getActiveCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.activeCamera;
  }

  addObject(entity: EntityId, obj: THREE.Object3D): void {
    this.scene.add(obj);
    this.entityToObject.set(entity, obj);
    this.objectToEntity.set(obj, entity);
  }

  removeObject(entity: EntityId): void {
    const obj = this.entityToObject.get(entity);
    if (obj) {
      this.scene.remove(obj);
      this.entityToObject.delete(entity);
      this.objectToEntity.delete(obj);
    }
  }

  getObject(entity: EntityId): THREE.Object3D | undefined {
    return this.entityToObject.get(entity);
  }

  getEntity(obj: THREE.Object3D): EntityId | undefined {
    return this.objectToEntity.get(obj);
  }

  private onResize(width: number, height: number): void {
    this.renderer.setSize(width, height);

    if (this.activeCamera instanceof THREE.PerspectiveCamera) {
      this.activeCamera.aspect = width / height;
      this.activeCamera.updateProjectionMatrix();
    }

    this.postProcessing.setSize(width, height);
  }

  dispose(): void {
    this.postProcessing.dispose();
    this.renderer.dispose();
  }
}

// ── ECS Systems for Rendering ──

class TransformSyncSystem implements System {
  readonly name = 'TransformSync';
  readonly requiredComponents = ['Transform'];
  priority = -100; // Run first
  enabled = true;

  constructor(private renderer: FluxionRenderer) {}

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    for (const entity of entities) {
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      const obj = this.renderer.getObject(entity);
      if (!transform || !obj) continue;

      obj.position.copy(transform.position);
      obj.quaternion.copy(transform.quaternion);
      obj.scale.copy(transform.scale);

      // Sync world matrix for hierarchy
      const parent = ecs.getParent(entity);
      if (parent !== undefined) {
        const parentObj = this.renderer.getObject(parent);
        if (parentObj) {
          transform.worldMatrix = obj.matrixWorld;
        }
      }
    }
  }
}

class MeshRendererSystem implements System {
  readonly name = 'MeshRenderer';
  readonly requiredComponents = ['Transform', 'MeshRenderer'];
  priority = 0;
  enabled = true;
  private tracked: Set<EntityId> = new Set();

  constructor(private renderer: FluxionRenderer) {}

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    // Add new meshes
    for (const entity of entities) {
      const meshComp = ecs.getComponent<MeshRendererComponent>(entity, 'MeshRenderer');
      if (!meshComp?.mesh) continue;

      if (!this.tracked.has(entity)) {
        meshComp.mesh.castShadow = meshComp.castShadow;
        meshComp.mesh.receiveShadow = meshComp.receiveShadow;

        if (meshComp.mesh instanceof THREE.Group) {
          meshComp.mesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = meshComp.castShadow;
              child.receiveShadow = meshComp.receiveShadow;
            }
          });
        }

        this.renderer.addObject(entity, meshComp.mesh);
        this.tracked.add(entity);
      } else if (isDirty(meshComp)) {
        // Sync shadow properties when component is dirty (Stride processor pattern)
        meshComp.mesh.castShadow = meshComp.castShadow;
        meshComp.mesh.receiveShadow = meshComp.receiveShadow;

        if (meshComp.mesh instanceof THREE.Group) {
          meshComp.mesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = meshComp.castShadow;
              child.receiveShadow = meshComp.receiveShadow;
            }
          });
        }

        clearDirty(meshComp);
      }
    }

    // Remove deleted entities
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this.renderer.removeObject(entity);
        this.tracked.delete(entity);
      }
    }
  }
}

class CameraSystem implements System {
  readonly name = 'CameraSync';
  readonly requiredComponents = ['Transform', 'Camera'];
  priority = 10;
  enabled = true;
  private lastOrthographic: Map<EntityId, boolean> = new Map();

  constructor(private renderer: FluxionRenderer) {}

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    let bestPriority = -Infinity;
    let bestCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;

    for (const entity of entities) {
      const camComp = ecs.getComponent<CameraComponent>(entity, 'Camera');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!camComp || !transform || !camComp.enabled) continue;

      // Detect isOrthographic change → force recreation
      const lastOrtho = this.lastOrthographic.get(entity);
      if (camComp.camera && lastOrtho !== undefined && lastOrtho !== camComp.isOrthographic) {
        camComp.camera = null;
      }
      this.lastOrthographic.set(entity, camComp.isOrthographic);

      // Create camera if needed
      if (!camComp.camera) {
        if (camComp.isOrthographic) {
          camComp.camera = new THREE.OrthographicCamera(
            -camComp.orthoSize, camComp.orthoSize,
            camComp.orthoSize, -camComp.orthoSize,
            camComp.near, camComp.far
          );
        } else {
          camComp.camera = new THREE.PerspectiveCamera(
            camComp.fov, window.innerWidth / window.innerHeight,
            camComp.near, camComp.far
          );
        }
      }

      // Sync properties every frame (Stride EntityProcessor pattern)
      if (camComp.camera instanceof THREE.PerspectiveCamera) {
        camComp.camera.fov = camComp.fov;
        camComp.camera.near = camComp.near;
        camComp.camera.far = camComp.far;
        camComp.camera.updateProjectionMatrix();
      } else if (camComp.camera instanceof THREE.OrthographicCamera) {
        camComp.camera.left = -camComp.orthoSize;
        camComp.camera.right = camComp.orthoSize;
        camComp.camera.top = camComp.orthoSize;
        camComp.camera.bottom = -camComp.orthoSize;
        camComp.camera.near = camComp.near;
        camComp.camera.far = camComp.far;
        camComp.camera.updateProjectionMatrix();
      }

      // Sync transform
      camComp.camera.position.copy(transform.position);
      camComp.camera.quaternion.copy(transform.quaternion);

      if (isDirty(camComp)) clearDirty(camComp);

      if (camComp.priority > bestPriority) {
        bestPriority = camComp.priority;
        bestCamera = camComp.camera;
      }
    }

    // Cleanup removed
    for (const entity of this.lastOrthographic.keys()) {
      if (!entities.has(entity)) this.lastOrthographic.delete(entity);
    }

    if (bestCamera && !this.renderer.engine.simulationPaused) {
      this.renderer.setActiveCamera(bestCamera);
    }
  }
}

class LightSystem implements System {
  readonly name = 'LightSync';
  readonly requiredComponents = ['Transform', 'Light'];
  priority = 5;
  enabled = true;
  private tracked: Set<EntityId> = new Set();

  constructor(private renderer: FluxionRenderer) {}

  private lastLightType: Map<EntityId, string> = new Map();

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    for (const entity of entities) {
      const lightComp = ecs.getComponent<LightComponent>(entity, 'Light');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!lightComp || !transform) continue;

      // Detect lightType change → destroy old light and recreate
      const prevType = this.lastLightType.get(entity);
      if (lightComp.light && prevType !== undefined && prevType !== lightComp.lightType) {
        this.renderer.removeObject(entity);
        lightComp.light = null;
        this.tracked.delete(entity);
      }
      this.lastLightType.set(entity, lightComp.lightType);

      // Create light if needed
      if (!lightComp.light) {
        lightComp.light = this.createLight(lightComp);
        this.renderer.addObject(entity, lightComp.light);
        this.tracked.add(entity);
      }

      // Sync properties every frame (Stride EntityProcessor pattern)
      lightComp.light.color.copy(lightComp.color);
      lightComp.light.intensity = lightComp.intensity;

      if (lightComp.light instanceof THREE.PointLight) {
        lightComp.light.distance = lightComp.range;
        lightComp.light.castShadow = lightComp.castShadow;
      }
      if (lightComp.light instanceof THREE.SpotLight) {
        lightComp.light.distance = lightComp.range;
        lightComp.light.angle = THREE.MathUtils.degToRad(lightComp.spotAngle);
        lightComp.light.penumbra = lightComp.spotPenumbra;
        lightComp.light.castShadow = lightComp.castShadow;
      }
      if (lightComp.light instanceof THREE.DirectionalLight) {
        lightComp.light.castShadow = lightComp.castShadow;
      }

      if (isDirty(lightComp)) clearDirty(lightComp);
    }

    // Cleanup removed
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this.renderer.removeObject(entity);
        this.tracked.delete(entity);
        this.lastLightType.delete(entity);
      }
    }
  }

  private createLight(comp: LightComponent): THREE.Light {
    let light: THREE.Light;
    switch (comp.lightType) {
      case 'directional': {
        const dl = new THREE.DirectionalLight(comp.color, comp.intensity);
        dl.castShadow = comp.castShadow;
        dl.shadow.mapSize.set(comp.shadowMapSize, comp.shadowMapSize);
        dl.shadow.camera.near = 0.5;
        dl.shadow.camera.far = 500;
        const s = 50;
        dl.shadow.camera.left = -s;
        dl.shadow.camera.right = s;
        dl.shadow.camera.top = s;
        dl.shadow.camera.bottom = -s;
        dl.shadow.bias = -0.0001;
        light = dl;
        break;
      }
      case 'point': {
        const pl = new THREE.PointLight(comp.color, comp.intensity, comp.range);
        pl.castShadow = comp.castShadow;
        pl.shadow.mapSize.set(comp.shadowMapSize, comp.shadowMapSize);
        light = pl;
        break;
      }
      case 'spot': {
        const sl = new THREE.SpotLight(
          comp.color, comp.intensity, comp.range,
          THREE.MathUtils.degToRad(comp.spotAngle), comp.spotPenumbra
        );
        sl.castShadow = comp.castShadow;
        sl.shadow.mapSize.set(comp.shadowMapSize, comp.shadowMapSize);
        light = sl;
        break;
      }
      case 'ambient':
      default:
        light = new THREE.AmbientLight(comp.color, comp.intensity);
        break;
    }
    return light;
  }
}
