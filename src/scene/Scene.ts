// ============================================================
// FluxionJS V2 — Scene System
// LumixEngine-style scene management with serialization
// ============================================================

import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { EntityId } from '../core/ECS';
import { EngineEvents } from '../core/EventSystem';
import {
  TransformComponent,
  MeshRendererComponent,
  CameraComponent,
  LightComponent,
  RigidbodyComponent,
  ColliderComponent,
  ScriptComponent,
  SpriteComponent,
  EnvironmentComponent,
  TextRendererComponent,
  FuiComponent,
} from '../core/Components';
import { AssetManager } from '../assets/AssetManager';

export interface SceneData {
  name: string;
  version: number;
  settings: SceneSettings;
  entities: SerializedEntity[];
}

export interface SceneSettings {
  ambientColor: [number, number, number];
  ambientIntensity: number;
  fogEnabled: boolean;
  fogColor: [number, number, number];
  fogDensity: number;
  skybox: string | null;
  physicsGravity: [number, number, number];
}

export interface SerializedEntity {
  id: number;
  name: string;
  parent: number | null;
  tags: string[];
  components: SerializedComponent[];
}

export interface SerializedComponent {
  type: string;
  data: Record<string, any>;
}

export class Scene {
  name: string;
  settings: SceneSettings;
  private engine: Engine;

  /** File path of this scene on disk (project-relative) */
  path: string | null = null;
  /** Whether the scene has unsaved changes */
  isDirty = false;

  constructor(engine: Engine, name = 'Untitled Scene') {
    this.engine = engine;
    this.name = name;
    this.settings = {
      ambientColor: [0.2, 0.2, 0.3],
      ambientIntensity: 0.5,
      fogEnabled: true,
      fogColor: [0.1, 0.1, 0.15],
      fogDensity: 0.005,
      skybox: null,
      physicsGravity: [0, -9.81, 0],
    };
  }

  // ── Helper: create common entities ──

  createEmpty(name: string): EntityId {
    const entity = this.engine.ecs.createEntity(name);
    this.engine.ecs.addComponent(entity, new TransformComponent());
    return entity;
  }

  /** Create a primitive mesh entity by type name */
  createPrimitive(
    name: string,
    primitiveType: 'cube' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'capsule' | 'torus',
    material?: THREE.Material
  ): EntityId {
    const geometries: Record<string, () => THREE.BufferGeometry> = {
      cube: () => new THREE.BoxGeometry(1, 1, 1),
      sphere: () => new THREE.SphereGeometry(0.5, 32, 32),
      cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
      cone: () => new THREE.ConeGeometry(0.5, 1, 32),
      plane: () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      capsule: () => new THREE.CapsuleGeometry(0.3, 0.6, 8, 16),
      torus: () => new THREE.TorusGeometry(0.5, 0.15, 16, 48),
    };
    const geomFactory = geometries[primitiveType] || geometries.cube;
    const mat = material || new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.1 });
    const entity = this.createMesh(name, geomFactory(), mat);
    const meshComp = this.engine.ecs.getComponent<MeshRendererComponent>(entity, 'MeshRenderer');
    if (meshComp) meshComp.primitiveType = primitiveType;
    return entity;
  }

  /** Deep-clone an entity with all components, returns new entity */
  cloneEntity(entityId: EntityId, offset = new THREE.Vector3(1, 0, 0)): EntityId | null {
    const ecs = this.engine.ecs;
    const name = ecs.getEntityName(entityId);
    const clone = ecs.createEntity(`${name} (copy)`);
    ecs.addComponent(clone, new TransformComponent());

    // Copy transform
    const srcT = ecs.getComponent<TransformComponent>(entityId, 'Transform');
    const dstT = ecs.getComponent<TransformComponent>(clone, 'Transform');
    if (srcT && dstT) {
      dstT.position.copy(srcT.position).add(offset);
      dstT.rotation.copy(srcT.rotation);
      dstT.quaternion.copy(srcT.quaternion);
      dstT.scale.copy(srcT.scale);
    }

    // Copy MeshRenderer
    const mesh = ecs.getComponent<MeshRendererComponent>(entityId, 'MeshRenderer');
    if (mesh && mesh.mesh) {
      const meshComp = new MeshRendererComponent();
      meshComp.modelPath = mesh.modelPath;
      meshComp.materialPath = mesh.materialPath;
      meshComp.materialSlots = mesh.materialSlots ? mesh.materialSlots.map(s => ({ ...s })) : undefined;
      meshComp.castShadow = mesh.castShadow;
      meshComp.receiveShadow = mesh.receiveShadow;
      const srcMesh = mesh.mesh;
      if (srcMesh instanceof THREE.Mesh) {
        meshComp.mesh = new THREE.Mesh(srcMesh.geometry, srcMesh.material);
      } else if (srcMesh instanceof THREE.Group) {
        meshComp.mesh = srcMesh.clone();
      }
      ecs.addComponent(clone, meshComp);
    }

    // Copy Camera
    const cam = ecs.getComponent<CameraComponent>(entityId, 'Camera');
    if (cam) {
      const camComp = new CameraComponent();
      camComp.fov = cam.fov;
      camComp.near = cam.near;
      camComp.far = cam.far;
      camComp.isOrthographic = cam.isOrthographic;
      camComp.orthoSize = cam.orthoSize;
      camComp.priority = cam.priority;
      ecs.addComponent(clone, camComp);
    }

    // Copy Light
    const light = ecs.getComponent<LightComponent>(entityId, 'Light');
    if (light) {
      const lightComp = new LightComponent();
      lightComp.lightType = light.lightType;
      lightComp.color.copy(light.color);
      lightComp.intensity = light.intensity;
      lightComp.range = light.range;
      lightComp.castShadow = light.castShadow;
      ecs.addComponent(clone, lightComp);
    }

    // Copy Rigidbody
    const rb = ecs.getComponent<RigidbodyComponent>(entityId, 'Rigidbody');
    if (rb) {
      const rbComp = new RigidbodyComponent();
      rbComp.bodyType = rb.bodyType;
      rbComp.mass = rb.mass;
      rbComp.friction = rb.friction;
      rbComp.restitution = rb.restitution;
      rbComp.gravityScale = rb.gravityScale;
      ecs.addComponent(clone, rbComp);
    }

    // Copy Collider
    const col = ecs.getComponent<ColliderComponent>(entityId, 'Collider');
    if (col) {
      const colComp = new ColliderComponent();
      colComp.shape = col.shape;
      colComp.size.copy(col.size);
      colComp.radius = col.radius;
      colComp.height = col.height;
      colComp.isTrigger = col.isTrigger;
      ecs.addComponent(clone, colComp);
    }

    // Copy Sprite
    const spr = ecs.getComponent<SpriteComponent>(entityId, 'Sprite');
    if (spr) {
      const sprComp = new SpriteComponent();
      sprComp.texturePath = spr.texturePath;
      sprComp.color.copy(spr.color);
      sprComp.opacity = spr.opacity;
      sprComp.flipX = spr.flipX;
      sprComp.flipY = spr.flipY;
      sprComp.pixelsPerUnit = spr.pixelsPerUnit;
      sprComp.sortingLayer = spr.sortingLayer;
      sprComp.sortingOrder = spr.sortingOrder;
      ecs.addComponent(clone, sprComp);
    }

    // Copy TextRenderer
    const txt = ecs.getComponent<TextRendererComponent>(entityId, 'TextRenderer');
    if (txt) {
      const txtComp = new TextRendererComponent();
      txtComp.text = txt.text;
      txtComp.fontPath = txt.fontPath;
      txtComp.fontSize = txt.fontSize;
      txtComp.color.copy(txt.color);
      txtComp.opacity = txt.opacity;
      txtComp.alignment = txt.alignment;
      txtComp.maxWidth = txt.maxWidth;
      txtComp.billboard = txt.billboard;
      ecs.addComponent(clone, txtComp);
    }

    // Copy FUI
    const fui = ecs.getComponent<FuiComponent>(entityId, 'Fui');
    if (fui) {
      const fComp = new FuiComponent();
      fComp.mode = fui.mode;
      fComp.fuiPath = fui.fuiPath;
      fComp.screenX = fui.screenX;
      fComp.screenY = fui.screenY;
      fComp.worldWidth = fui.worldWidth;
      fComp.worldHeight = fui.worldHeight;
      fComp.billboard = fui.billboard;
      ecs.addComponent(clone, fComp);
    }

    // Copy parent
    const parent = ecs.getParent(entityId);
    if (parent !== undefined) ecs.setParent(clone, parent);

    return clone;
  }

  createMesh(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material
  ): EntityId {
    const entity = this.createEmpty(name);
    const meshComp = new MeshRendererComponent();
    meshComp.mesh = new THREE.Mesh(geometry, material);
    this.engine.ecs.addComponent(entity, meshComp);
    return entity;
  }

  /**
   * Create an entity from a 3D model asset (glTF/GLB).
   * The model is loaded asynchronously via the AssetManager.
   * @param name Entity display name
   * @param modelPath Project-relative path to the model asset
   * @param absolutePath Optional absolute path for loading (if known)
   * @returns EntityId — mesh is attached once loading completes
   */
  async createModelEntity(
    name: string,
    modelPath: string,
    absolutePath?: string,
  ): Promise<EntityId> {
    const entity = this.createEmpty(name);
    const meshComp = new MeshRendererComponent();
    meshComp.modelPath = modelPath;
    this.engine.ecs.addComponent(entity, meshComp);

    // Resolve absolute path for loading
    let loadPath = absolutePath;
    if (!loadPath) {
      try {
        const { projectManager } = await import('../project/ProjectManager');
        loadPath = projectManager.resolvePath(modelPath);
      } catch {
        loadPath = modelPath;
      }
    }

    // Load model via AssetManager
    try {
      const assets = this.engine.getSubsystem('assets') as AssetManager;

      if (modelPath.endsWith('.fluxmesh')) {
        // .fluxmesh — load with multi-material support
        const result = await assets.loadFluxMesh(loadPath!);
        const scene = result.scene.clone();
        scene.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = meshComp.castShadow;
            child.receiveShadow = meshComp.receiveShadow;
          }
        });

        // Load and apply default materials
        const materials = this.engine.getSubsystem('materials') as any;
        if (materials) {
          const matPromises = result.slots.map(async (slot) => {
            try {
              const matData = await assets.loadAsset(slot.defaultMaterial, 'material');
              if (!matData) return null;
              // Resolve texture paths relative to the .fluxmat's directory, with project-relative fallback
              const matDir = slot.defaultMaterial.substring(0, slot.defaultMaterial.lastIndexOf('/'));
              const slotLoadTexture = async (relPath: string): Promise<THREE.Texture> => {
                let texAbsPath: string;
                if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
                  texAbsPath = relPath;
                } else {
                  texAbsPath = `${matDir}/${relPath}`;
                  try {
                    const { projectManager: pm } = await import('../project/ProjectManager');
                    const { getFileSystem: getFs } = await import('../filesystem');
                    const projResolved = pm.resolvePath(relPath);
                    if (!(await getFs().exists(texAbsPath)) && await getFs().exists(projResolved)) {
                      texAbsPath = projResolved;
                    }
                  } catch { /* keep matDir-relative */ }
                }
                const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
                return assets.loadTexture(texUrl);
              };
              return materials.createFromFluxMat(matData, slotLoadTexture, slot.defaultMaterial);
            } catch { return null; }
          });
          const loadedMats = await Promise.all(matPromises);
          const { applyMaterialsToModel } = await import('../assets/FluxMeshData');
          applyMaterialsToModel(scene, result.slots, loadedMats);
        }

        meshComp.mesh = scene;
      } else {
        // Raw model — legacy flow
        const fileUrl = loadPath!.startsWith('file://') ? loadPath! : `file:///${loadPath!.replace(/\\/g, '/')}`;
        const gltf = await assets.loadModel(fileUrl);
        const scene = gltf.scene.clone();
        scene.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = meshComp.castShadow;
            child.receiveShadow = meshComp.receiveShadow;
          }
        });
        meshComp.mesh = scene;
      }
    } catch (err) {
      console.error(`[Scene] Failed to load model "${modelPath}":`, err);
    }

    return entity;
  }

  createCamera(name: string, fov = 60, near = 0.1, far = 1000): EntityId {
    const entity = this.createEmpty(name);
    const camComp = new CameraComponent();
    camComp.fov = fov;
    camComp.near = near;
    camComp.far = far;
    this.engine.ecs.addComponent(entity, camComp);
    return entity;
  }

  /** Create a 3D text entity */
  createText(name: string, text = 'Hello World'): EntityId {
    const entity = this.createEmpty(name);
    const tc = new TextRendererComponent();
    tc.text = text;
    this.engine.ecs.addComponent(entity, tc);
    return entity;
  }

  /** Create a sprite entity (billboard quad) */
  createSprite(name: string, texturePath?: string): EntityId {
    const entity = this.createEmpty(name);
    const sc = new SpriteComponent();
    if (texturePath) sc.texturePath = texturePath;
    this.engine.ecs.addComponent(entity, sc);
    return entity;
  }

  createLight(
    name: string,
    type: 'directional' | 'point' | 'spot' | 'ambient',
    color = 0xffffff,
    intensity = 1
  ): EntityId {
    const entity = this.createEmpty(name);
    const lightComp = new LightComponent();
    lightComp.lightType = type;
    lightComp.color = new THREE.Color(color);
    lightComp.intensity = intensity;
    this.engine.ecs.addComponent(entity, lightComp);
    return entity;
  }

  createPhysicsBox(
    name: string,
    size: THREE.Vector3,
    material: THREE.Material,
    bodyType: 'dynamic' | 'static' | 'kinematic' = 'dynamic'
  ): EntityId {
    const entity = this.createMesh(
      name,
      new THREE.BoxGeometry(size.x, size.y, size.z),
      material
    );

    const rb = new RigidbodyComponent();
    rb.bodyType = bodyType;
    this.engine.ecs.addComponent(entity, rb);

    const collider = new ColliderComponent();
    collider.shape = 'box';
    collider.size.copy(size);
    this.engine.ecs.addComponent(entity, collider);

    return entity;
  }

  createPhysicsSphere(
    name: string,
    radius: number,
    material: THREE.Material,
    bodyType: 'dynamic' | 'static' | 'kinematic' = 'dynamic'
  ): EntityId {
    const entity = this.createMesh(
      name,
      new THREE.SphereGeometry(radius, 32, 32),
      material
    );

    const rb = new RigidbodyComponent();
    rb.bodyType = bodyType;
    this.engine.ecs.addComponent(entity, rb);

    const collider = new ColliderComponent();
    collider.shape = 'sphere';
    collider.radius = radius;
    this.engine.ecs.addComponent(entity, collider);

    return entity;
  }

  // ── Serialization (s&box / LumixEngine style) ──

  serialize(): SceneData {
    const entities: SerializedEntity[] = [];

    for (const entityId of this.engine.ecs.getAllEntities()) {
      const components: SerializedComponent[] = [];

      const transform = this.engine.ecs.getComponent<TransformComponent>(entityId, 'Transform');
      if (transform) {
        components.push({
          type: 'Transform',
          data: {
            position: [transform.position.x, transform.position.y, transform.position.z],
            rotation: [transform.rotation.x, transform.rotation.y, transform.rotation.z],
            scale: [transform.scale.x, transform.scale.y, transform.scale.z],
          },
        });
      }

      const cam = this.engine.ecs.getComponent<CameraComponent>(entityId, 'Camera');
      if (cam) {
        components.push({
          type: 'Camera',
          data: {
            fov: cam.fov,
            near: cam.near,
            far: cam.far,
            isOrthographic: cam.isOrthographic,
            orthoSize: cam.orthoSize,
            priority: cam.priority,
          },
        });
      }

      const light = this.engine.ecs.getComponent<LightComponent>(entityId, 'Light');
      if (light) {
        components.push({
          type: 'Light',
          data: {
            lightType: light.lightType,
            color: [light.color.r, light.color.g, light.color.b],
            intensity: light.intensity,
            range: light.range,
            castShadow: light.castShadow,
          },
        });
      }

      const rb = this.engine.ecs.getComponent<RigidbodyComponent>(entityId, 'Rigidbody');
      if (rb) {
        components.push({
          type: 'Rigidbody',
          data: {
            bodyType: rb.bodyType,
            mass: rb.mass,
            friction: rb.friction,
            restitution: rb.restitution,
            gravityScale: rb.gravityScale,
          },
        });
      }

      const collider = this.engine.ecs.getComponent<ColliderComponent>(entityId, 'Collider');
      if (collider) {
        components.push({
          type: 'Collider',
          data: {
            shape: collider.shape,
            size: [collider.size.x, collider.size.y, collider.size.z],
            radius: collider.radius,
            height: collider.height,
            isTrigger: collider.isTrigger,
          },
        });
      }

      const script = this.engine.ecs.getComponent<ScriptComponent>(entityId, 'Script');
      if (script) {
        components.push({
          type: 'Script',
          data: {
            enabled: script.enabled,
            scripts: script.scripts.map(s => ({ path: s.path, enabled: s.enabled, properties: s.properties })),
          },
        });
      }

      const env = this.engine.ecs.getComponent<EnvironmentComponent>(entityId, 'Environment');
      if (env) {
        components.push({
          type: 'Environment',
          data: {
            enabled: env.enabled,
            backgroundMode: env.backgroundMode,
            backgroundColor: [env.backgroundColor.r, env.backgroundColor.g, env.backgroundColor.b],
            skyboxMode: env.skyboxMode,
            skyboxPath: env.skyboxPath,
            skyboxFaces: { ...env.skyboxFaces },
            ambientColor: [env.ambientColor.r, env.ambientColor.g, env.ambientColor.b],
            ambientIntensity: env.ambientIntensity,
            fogEnabled: env.fogEnabled,
            fogColor: [env.fogColor.r, env.fogColor.g, env.fogColor.b],
            fogMode: env.fogMode,
            fogDensity: env.fogDensity,
            fogNear: env.fogNear,
            fogFar: env.fogFar,
            toneMapping: env.toneMapping,
            exposure: env.exposure,
            bloomEnabled: env.bloomEnabled,
            bloomThreshold: env.bloomThreshold,
            bloomStrength: env.bloomStrength,
            bloomRadius: env.bloomRadius,
            ssaoEnabled: env.ssaoEnabled,
            ssaoRadius: env.ssaoRadius,
            ssaoBias: env.ssaoBias,
            ssaoIntensity: env.ssaoIntensity,
            ssrEnabled: env.ssrEnabled,
            ssrMaxDistance: env.ssrMaxDistance,
            ssrThickness: env.ssrThickness,
            ssrStride: env.ssrStride,
            ssrFresnel: env.ssrFresnel,
            ssrOpacity: env.ssrOpacity,
            ssgiEnabled: env.ssgiEnabled,
            ssgiSliceCount: env.ssgiSliceCount,
            ssgiStepCount: env.ssgiStepCount,
            ssgiRadius: env.ssgiRadius,
            ssgiThickness: env.ssgiThickness,
            ssgiExpFactor: env.ssgiExpFactor,
            ssgiAoIntensity: env.ssgiAoIntensity,
            ssgiGiIntensity: env.ssgiGiIntensity,
            cloudsEnabled: env.cloudsEnabled,
            cloudMinHeight: env.cloudMinHeight,
            cloudMaxHeight: env.cloudMaxHeight,
            cloudCoverage: env.cloudCoverage,
            cloudDensity: env.cloudDensity,
            cloudAbsorption: env.cloudAbsorption,
            cloudScatter: env.cloudScatter,
            cloudColor: [env.cloudColor.r, env.cloudColor.g, env.cloudColor.b],
            cloudSpeed: env.cloudSpeed,
            skyTurbidity: env.skyTurbidity,
            skyRayleigh: env.skyRayleigh,
            skyMieCoefficient: env.skyMieCoefficient,
            skyMieDirectionalG: env.skyMieDirectionalG,
            sunElevation: env.sunElevation,
            sunAzimuth: env.sunAzimuth,
            vignetteEnabled: env.vignetteEnabled,
            vignetteIntensity: env.vignetteIntensity,
            vignetteRoundness: env.vignetteRoundness,
          },
        });
      }

      entities.push({
        id: entityId,
        name: this.engine.ecs.getEntityName(entityId),
        parent: this.engine.ecs.getParent(entityId) ?? null,
        tags: [],
        components,
      });
    }

    return {
      name: this.name,
      version: 1,
      settings: { ...this.settings },
      entities,
    };
  }

  toJSON(): string {
    return JSON.stringify(this.serialize(), null, 2);
  }

  // Clear the scene
  clear(): void {
    this.engine.ecs.clear();
    this.engine.events.emit(EngineEvents.SCENE_UNLOADED);
  }
}

// ── Prefab System (like s&box prefabs) ──

export interface PrefabData {
  name: string;
  entities: SerializedEntity[];
}

export class PrefabManager {
  private prefabs: Map<string, PrefabData> = new Map();

  register(name: string, data: PrefabData): void {
    this.prefabs.set(name, data);
  }

  get(name: string): PrefabData | undefined {
    return this.prefabs.get(name);
  }

  createFromScene(scene: Scene, entities: EntityId[], name: string): PrefabData {
    const sceneData = scene.serialize();
    const entitySet = new Set(entities);
    const filteredEntities = sceneData.entities.filter(e => entitySet.has(e.id));

    const prefab: PrefabData = { name, entities: filteredEntities };
    this.register(name, prefab);
    return prefab;
  }
}
