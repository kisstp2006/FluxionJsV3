// ============================================================
// FluxionJS V2 — Scene Serializer
// Full round-trip: ECS ↔ JSON ↔ Disk
// Nuake-style entity serialization with geometry/material reconstruction
// ============================================================

import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { ECSManager, EntityId } from '../core/ECS';
import {
  TransformComponent,
  MeshRendererComponent,
  CameraComponent,
  LightComponent,
  RigidbodyComponent,
  ColliderComponent,
  ScriptComponent,
  ParticleEmitterComponent,
  AudioSourceComponent,
  EnvironmentComponent,
  SpriteComponent,
  TextRendererComponent,
  CSGBrushComponent,
} from '../core/Components';
import { Scene, SceneData, SceneSettings, SerializedEntity, SerializedComponent } from '../scene/Scene';
import { AssetManager } from '../assets/AssetManager';
import { MaterialSystem, FluxMatData } from '../renderer/MaterialSystem';
import { buildVisualMaterial } from '../materials/VisualMaterialCompiler';
import type { VisualMaterialFile } from '../materials/VisualMaterialGraph';
import { projectManager } from './ProjectManager';
import { applyMaterialsToModel } from '../assets/FluxMeshData';
import type { FluxMeshLoadResult } from '../assets/FluxMeshData';

// ── Material serialization data ──

export interface SerializedMaterial {
  color: [number, number, number];
  roughness: number;
  metalness: number;
  emissive?: [number, number, number];
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  wireframe?: boolean;
  doubleSided?: boolean;
  alphaTest?: number;
  normalScale?: number;
  aoIntensity?: number;
  envMapIntensity?: number;
  albedoMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  aoMap?: string;
  emissiveMap?: string;
}

export interface SerializedGeometry {
  // Box
  width?: number;
  height?: number;
  depth?: number;
  // Sphere
  radius?: number;
  // Cylinder / Cone / Capsule
  radiusTop?: number;
  radiusBottom?: number;
  // Torus
  tube?: number;
}

export interface SceneFileData {
  name: string;
  version: number;
  settings: SceneSettings & { backgroundColor?: [number, number, number] };
  editorCamera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  entities: SerializedEntity[];
}

// ── Serialize from ECS to JSON ──

export function serializeScene(scene: Scene, engine: Engine, editorCamera?: THREE.PerspectiveCamera, orbitTarget?: THREE.Vector3): SceneFileData {
  const entities: SerializedEntity[] = [];

  for (const entityId of engine.ecs.getAllEntities()) {
    const components: SerializedComponent[] = [];

    const transform = engine.ecs.getComponent<TransformComponent>(entityId, 'Transform');
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

    const meshComp = engine.ecs.getComponent<MeshRendererComponent>(entityId, 'MeshRenderer');
    if (meshComp) {
      const data: Record<string, any> = {
        castShadow: meshComp.castShadow,
        receiveShadow: meshComp.receiveShadow,
      };

      if (meshComp.modelPath) {
        // Model asset — store path reference only
        data.modelPath = meshComp.modelPath;
      } else {
        // Primitive — store type + geometry + material
        data.primitiveType = meshComp.primitiveType || 'cube';

        // Serialize geometry dimensions
        if (meshComp.mesh instanceof THREE.Mesh) {
          const geom = meshComp.mesh.geometry;
          const params = (geom as any).parameters || {};
          data.geometry = {};
          if (params.width !== undefined) data.geometry.width = params.width;
          if (params.height !== undefined) data.geometry.height = params.height;
          if (params.depth !== undefined) data.geometry.depth = params.depth;
          if (params.radius !== undefined) data.geometry.radius = params.radius;
          if (params.radiusTop !== undefined) data.geometry.radiusTop = params.radiusTop;
          if (params.radiusBottom !== undefined) data.geometry.radiusBottom = params.radiusBottom;
          if (params.tube !== undefined) data.geometry.tube = params.tube;
        }
      }

      // Store materialPath if the entity references a .fluxmat asset
      if (meshComp.materialPath) {
        data.materialPath = meshComp.materialPath;
      }

      // Store per-slot material overrides for .fluxmesh models
      if (meshComp.materialSlots && meshComp.materialSlots.length > 0) {
        data.materialSlots = meshComp.materialSlots.map(s => ({
          slotIndex: s.slotIndex,
          materialPath: s.materialPath,
        }));
      }

      // Store UV transform (only if non-default)
      if (meshComp.uvScale.x !== 1 || meshComp.uvScale.y !== 1) {
        data.uvScale = [meshComp.uvScale.x, meshComp.uvScale.y];
      }
      if (meshComp.uvOffset.x !== 0 || meshComp.uvOffset.y !== 0) {
        data.uvOffset = [meshComp.uvOffset.x, meshComp.uvOffset.y];
      }
      if (meshComp.uvRotation !== 0) {
        data.uvRotation = meshComp.uvRotation;
      }

      // Serialize material (both primitives and models can have overridden materials)
      if (meshComp.mesh instanceof THREE.Mesh) {
        const mat = meshComp.mesh.material;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          data.material = {
            color: [mat.color.r, mat.color.g, mat.color.b],
            roughness: mat.roughness,
            metalness: mat.metalness,
          };
          if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
            data.material.emissive = [mat.emissive.r, mat.emissive.g, mat.emissive.b];
            data.material.emissiveIntensity = mat.emissiveIntensity;
          }
          if (mat.transparent) {
            data.material.transparent = true;
            data.material.opacity = mat.opacity;
          }
          if (mat.side === THREE.DoubleSide) {
            data.material.doubleSided = true;
          }
          if (mat.wireframe) {
            data.material.wireframe = true;
          }
          if (mat.alphaTest > 0) {
            data.material.alphaTest = mat.alphaTest;
          }
          // Serialize texture map paths (stored on userData by the loader)
          const mapKeys = ['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
          for (const key of mapKeys) {
            const texPath = (mat.userData as any)?.[key];
            if (texPath) data.material[key] = texPath;
          }
          if (mat.normalScale && (mat.normalScale.x !== 1 || mat.normalScale.y !== 1)) {
            data.material.normalScale = mat.normalScale.x;
          }
          if (mat.aoMapIntensity !== undefined && mat.aoMapIntensity !== 1) {
            data.material.aoIntensity = mat.aoMapIntensity;
          }
          if (mat.envMapIntensity !== undefined && mat.envMapIntensity !== 1) {
            data.material.envMapIntensity = mat.envMapIntensity;
          }
        }
      }

      components.push({ type: 'MeshRenderer', data });
    }

    const cam = engine.ecs.getComponent<CameraComponent>(entityId, 'Camera');
    if (cam) {
      components.push({
        type: 'Camera',
        data: {
          enabled: cam.enabled,
          fov: cam.fov, near: cam.near, far: cam.far,
          isOrthographic: cam.isOrthographic, orthoSize: cam.orthoSize, priority: cam.priority,
          isMain: cam.isMain,
        },
      });
    }

    const light = engine.ecs.getComponent<LightComponent>(entityId, 'Light');
    if (light) {
      components.push({
        type: 'Light',
        data: {
          enabled: light.enabled,
          lightType: light.lightType,
          color: [light.color.r, light.color.g, light.color.b],
          intensity: light.intensity,
          range: light.range,
          castShadow: light.castShadow,
          shadowMapSize: light.shadowMapSize,
          spotAngle: light.spotAngle,
          spotPenumbra: light.spotPenumbra,
          cookieTexturePath: light.cookieTexturePath,
        },
      });
    }

    const rb = engine.ecs.getComponent<RigidbodyComponent>(entityId, 'Rigidbody');
    if (rb) {
      components.push({
        type: 'Rigidbody',
        data: {
          bodyType: rb.bodyType, mass: rb.mass, friction: rb.friction,
          restitution: rb.restitution, gravityScale: rb.gravityScale,
          linearDamping: rb.linearDamping, angularDamping: rb.angularDamping,
        },
      });
    }

    const col = engine.ecs.getComponent<ColliderComponent>(entityId, 'Collider');
    if (col) {
      components.push({
        type: 'Collider',
        data: {
          shape: col.shape,
          size: [col.size.x, col.size.y, col.size.z],
          radius: col.radius, height: col.height, isTrigger: col.isTrigger,
          offset: [col.offset.x, col.offset.y, col.offset.z],
        },
      });
    }

    const script = engine.ecs.getComponent<ScriptComponent>(entityId, 'Script');
    if (script) {
      components.push({
        type: 'Script',
        data: { scriptName: script.scriptName, properties: script.properties },
      });
    }

    const particle = engine.ecs.getComponent<ParticleEmitterComponent>(entityId, 'ParticleEmitter');
    if (particle) {
      components.push({
        type: 'ParticleEmitter',
        data: {
          maxParticles: particle.maxParticles, emissionRate: particle.emissionRate,
          lifetime: [particle.lifetime.x, particle.lifetime.y],
          speed: [particle.speed.x, particle.speed.y],
          size: [particle.size.x, particle.size.y],
          startColor: [particle.startColor.r, particle.startColor.g, particle.startColor.b],
          endColor: [particle.endColor.r, particle.endColor.g, particle.endColor.b],
          gravity: particle.gravity, spread: particle.spread,
          worldSpace: particle.worldSpace, texture: particle.texture,
        },
      });
    }

    const audio = engine.ecs.getComponent<AudioSourceComponent>(entityId, 'AudioSource');
    if (audio) {
      components.push({
        type: 'AudioSource',
        data: {
          clip: audio.clip, volume: audio.volume, pitch: audio.pitch,
          loop: audio.loop, playOnStart: audio.playOnStart, spatial: audio.spatial,
          minDistance: audio.minDistance, maxDistance: audio.maxDistance,
        },
      });
    }

    const sprite = engine.ecs.getComponent<SpriteComponent>(entityId, 'Sprite');
    if (sprite) {
      components.push({
        type: 'Sprite',
        data: {
          enabled: sprite.enabled,
          texturePath: sprite.texturePath,
          color: [sprite.color.r, sprite.color.g, sprite.color.b],
          opacity: sprite.opacity,
          flipX: sprite.flipX,
          flipY: sprite.flipY,
          pixelsPerUnit: sprite.pixelsPerUnit,
          sortingLayer: sprite.sortingLayer,
          sortingOrder: sprite.sortingOrder,
        },
      });
    }

    const textComp = engine.ecs.getComponent<TextRendererComponent>(entityId, 'TextRenderer');
    if (textComp) {
      components.push({
        type: 'TextRenderer',
        data: {
          enabled: textComp.enabled,
          text: textComp.text,
          fontPath: textComp.fontPath,
          fontSize: textComp.fontSize,
          color: [textComp.color.r, textComp.color.g, textComp.color.b],
          opacity: textComp.opacity,
          alignment: textComp.alignment,
          maxWidth: textComp.maxWidth,
          billboard: textComp.billboard,
        },
      });
    }

    const env = engine.ecs.getComponent<EnvironmentComponent>(entityId, 'Environment');
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
          chromaticAberration: env.chromaticAberration,
          filmGrain: env.filmGrain,
          dofEnabled: env.dofEnabled,
          dofFocusDistance: env.dofFocusDistance,
          dofAperture: env.dofAperture,
          dofMaxBlur: env.dofMaxBlur,
          shadowCascades: env.shadowCascades,
          shadowDistance: env.shadowDistance,
        },
      });
    }

    const csgBrush = engine.ecs.getComponent<CSGBrushComponent>(entityId, 'CSGBrush');
    if (csgBrush) {
      components.push({
        type: 'CSGBrush',
        data: {
          enabled: csgBrush.enabled,
          shape: csgBrush.shape,
          operation: csgBrush.operation,
          size: [csgBrush.size.x, csgBrush.size.y, csgBrush.size.z],
          radius: csgBrush.radius,
          segments: csgBrush.segments,
          stairSteps: csgBrush.stairSteps,
          generateCollision: csgBrush.generateCollision,
          castShadow: csgBrush.castShadow,
          receiveShadow: csgBrush.receiveShadow,
          materialPath: csgBrush.materialPath,
        },
      });
    }

    entities.push({
      id: entityId,
      name: engine.ecs.getEntityName(entityId),
      parent: engine.ecs.getParent(entityId) ?? null,
      tags: [],
      components,
    });
  }

  const result: SceneFileData = {
    name: scene.name,
    version: 1,
    settings: { ...scene.settings },
    entities,
  };

  if (editorCamera) {
    result.editorCamera = {
      position: [editorCamera.position.x, editorCamera.position.y, editorCamera.position.z],
      target: orbitTarget ? [orbitTarget.x, orbitTarget.y, orbitTarget.z] : [0, 0, 0],
      fov: editorCamera.fov,
    };
  }

  return result;
}

// ── Deserialize JSON to ECS ──

export function deserializeScene(engine: Engine, data: SceneFileData, scene: Scene): void {
  // Clear existing entities
  scene.clear();

  // Apply scene settings
  scene.name = data.name;
  if (data.settings) {
    scene.settings = {
      ambientColor: data.settings.ambientColor || [0.2, 0.2, 0.3],
      ambientIntensity: data.settings.ambientIntensity ?? 0.5,
      fogEnabled: data.settings.fogEnabled ?? true,
      fogColor: data.settings.fogColor || [0.1, 0.1, 0.15],
      fogDensity: data.settings.fogDensity ?? 0.005,
      skybox: data.settings.skybox || null,
      physicsGravity: data.settings.physicsGravity || [0, -9.81, 0],
    };
  }

  // Apply scene environment
  const bgColor = data.settings?.backgroundColor || data.settings?.fogColor || [0.04, 0.055, 0.09];
  const renderer = engine.getSubsystem<any>('renderer');
  if (renderer) {
    renderer.scene.background = new THREE.Color(bgColor[0], bgColor[1], bgColor[2]);
    if (data.settings?.fogEnabled) {
      renderer.scene.fog = new THREE.FogExp2(
        new THREE.Color(data.settings.fogColor[0], data.settings.fogColor[1], data.settings.fogColor[2]).getHex(),
        data.settings.fogDensity
      );
    }
  }

  // Deferred model loads — collected here, awaited after entity creation
  const deferredModelLoads: Array<{ meshComp: MeshRendererComponent; modelPath: string }> = [];

  // Deferred material (fluxmat) loads
  const deferredMaterialLoads: Array<{ meshComp: MeshRendererComponent; materialPath: string }> = [];

  // Build entity ID mapping (old ID → new ID)
  const idMap = new Map<number, EntityId>();

  for (const entityData of data.entities) {
    const entityId = engine.ecs.createEntity(entityData.name);
    idMap.set(entityData.id, entityId);

    for (const comp of entityData.components) {
      switch (comp.type) {
        case 'Transform': {
          const t = new TransformComponent();
          const d = comp.data;
          if (d.position) t.position.set(d.position[0], d.position[1], d.position[2]);
          if (d.rotation) t.rotation.set(d.rotation[0], d.rotation[1], d.rotation[2]);
          if (d.scale) t.scale.set(d.scale[0], d.scale[1], d.scale[2]);
          t.quaternion.setFromEuler(t.rotation);
          engine.ecs.addComponent(entityId, t);
          break;
        }

        case 'MeshRenderer': {
          const m = new MeshRendererComponent();
          const d = comp.data;
          m.castShadow = d.castShadow ?? true;
          m.receiveShadow = d.receiveShadow ?? true;

          if (d.materialPath) {
            m.materialPath = d.materialPath;
          }

          // Restore per-slot material overrides
          if (d.materialSlots && Array.isArray(d.materialSlots)) {
            m.materialSlots = d.materialSlots.map((s: any) => ({
              slotIndex: s.slotIndex,
              materialPath: s.materialPath,
            }));
          }

          // Restore UV transform
          if (d.uvScale) { m.uvScale = { x: d.uvScale[0], y: d.uvScale[1] }; }
          if (d.uvOffset) { m.uvOffset = { x: d.uvOffset[0], y: d.uvOffset[1] }; }
          if (d.uvRotation !== undefined) { m.uvRotation = d.uvRotation; }

          if (d.modelPath) {
            // 3D model asset — load async, mesh appears when ready
            m.modelPath = d.modelPath;
            deferredModelLoads.push({ meshComp: m, modelPath: d.modelPath });
          } else {
            // Primitive geometry
            m.primitiveType = d.primitiveType || 'cube';
            const geom = d.geometry || {};
            const geometry = buildGeometry(m.primitiveType || 'cube', geom);

            const matData = d.material || {};
            const material = new THREE.MeshStandardMaterial({
              color: matData.color ? new THREE.Color(matData.color[0], matData.color[1], matData.color[2]) : 0x888888,
              roughness: matData.roughness ?? 0.6,
              metalness: matData.metalness ?? 0.1,
            });
            if (matData.emissive) {
              material.emissive = new THREE.Color(matData.emissive[0], matData.emissive[1], matData.emissive[2]);
              material.emissiveIntensity = matData.emissiveIntensity ?? 1;
            }
            if (matData.transparent) {
              material.transparent = true;
              material.opacity = matData.opacity ?? 1;
            }
            if (matData.doubleSided) {
              material.side = THREE.DoubleSide;
            }
            if (matData.wireframe) {
              material.wireframe = true;
            }
            if (matData.alphaTest) {
              material.alphaTest = matData.alphaTest;
            }
            if (matData.normalScale !== undefined) {
              material.normalScale = new THREE.Vector2(matData.normalScale, matData.normalScale);
            }
            if (matData.aoIntensity !== undefined) {
              material.aoMapIntensity = matData.aoIntensity;
            }
            if (matData.envMapIntensity !== undefined) {
              material.envMapIntensity = matData.envMapIntensity;
            }
            // Store texture map paths on userData for round-trip serialization
            const mapKeys = ['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
            for (const key of mapKeys) {
              if (matData[key]) {
                if (!material.userData) material.userData = {};
                material.userData[key] = matData[key];
              }
            }

            m.mesh = new THREE.Mesh(geometry, material);
            m.mesh.castShadow = m.castShadow;
            m.mesh.receiveShadow = m.receiveShadow;
          }

          // If a .fluxmat path is set, schedule deferred material load (overrides inline material)
          if (m.materialPath) {
            deferredMaterialLoads.push({ meshComp: m, materialPath: m.materialPath });
          }

          engine.ecs.addComponent(entityId, m);
          break;
        }

        case 'Camera': {
          const c = new CameraComponent();
          const d = comp.data;
          c.enabled = d.enabled ?? true;
          c.fov = d.fov ?? 60;
          c.near = d.near ?? 0.1;
          c.far = d.far ?? 1000;
          c.isOrthographic = d.isOrthographic ?? false;
          c.orthoSize = d.orthoSize ?? 10;
          c.priority = d.priority ?? 0;
          c.isMain = d.isMain ?? false;
          engine.ecs.addComponent(entityId, c);
          break;
        }

        case 'Light': {
          const l = new LightComponent();
          const d = comp.data;
          l.enabled = d.enabled ?? true;
          l.lightType = d.lightType || 'point';
          if (d.color) l.color = new THREE.Color(d.color[0], d.color[1], d.color[2]);
          l.intensity = d.intensity ?? 1;
          l.range = d.range ?? 10;
          l.castShadow = d.castShadow ?? true;
          l.shadowMapSize = d.shadowMapSize ?? 2048;
          l.spotAngle = d.spotAngle ?? 45;
          l.spotPenumbra = d.spotPenumbra ?? 0.1;
          l.cookieTexturePath = d.cookieTexturePath ?? null;
          engine.ecs.addComponent(entityId, l);
          break;
        }

        case 'Rigidbody': {
          const r = new RigidbodyComponent();
          const d = comp.data;
          r.bodyType = d.bodyType || 'dynamic';
          r.mass = d.mass ?? 1;
          r.friction = d.friction ?? 0.5;
          r.restitution = d.restitution ?? 0.3;
          r.gravityScale = d.gravityScale ?? 1;
          r.linearDamping = d.linearDamping ?? 0;
          r.angularDamping = d.angularDamping ?? 0.05;
          engine.ecs.addComponent(entityId, r);
          break;
        }

        case 'Collider': {
          const c = new ColliderComponent();
          const d = comp.data;
          c.shape = d.shape || 'box';
          if (d.size) c.size.set(d.size[0], d.size[1], d.size[2]);
          c.radius = d.radius ?? 0.5;
          c.height = d.height ?? 2;
          c.isTrigger = d.isTrigger ?? false;
          if (d.offset) c.offset.set(d.offset[0], d.offset[1], d.offset[2]);
          engine.ecs.addComponent(entityId, c);
          break;
        }

        case 'Script': {
          const s = new ScriptComponent();
          s.scriptName = comp.data.scriptName || '';
          s.properties = comp.data.properties || {};
          engine.ecs.addComponent(entityId, s);
          break;
        }

        case 'ParticleEmitter': {
          const p = new ParticleEmitterComponent();
          const d = comp.data;
          p.maxParticles = d.maxParticles ?? 1000;
          p.emissionRate = d.emissionRate ?? 100;
          if (d.lifetime) p.lifetime.set(d.lifetime[0], d.lifetime[1]);
          if (d.speed) p.speed.set(d.speed[0], d.speed[1]);
          if (d.size) p.size.set(d.size[0], d.size[1]);
          if (d.startColor) p.startColor = new THREE.Color(d.startColor[0], d.startColor[1], d.startColor[2]);
          if (d.endColor) p.endColor = new THREE.Color(d.endColor[0], d.endColor[1], d.endColor[2]);
          p.gravity = d.gravity ?? -9.81;
          p.spread = d.spread ?? 0.5;
          p.worldSpace = d.worldSpace ?? true;
          p.texture = d.texture ?? null;
          engine.ecs.addComponent(entityId, p);
          break;
        }

        case 'AudioSource': {
          const a = new AudioSourceComponent();
          const d = comp.data;
          a.clip = d.clip || '';
          a.volume = d.volume ?? 1;
          a.pitch = d.pitch ?? 1;
          a.loop = d.loop ?? false;
          a.playOnStart = d.playOnStart ?? false;
          a.spatial = d.spatial ?? true;
          a.minDistance = d.minDistance ?? 1;
          a.maxDistance = d.maxDistance ?? 50;
          engine.ecs.addComponent(entityId, a);
          break;
        }

        case 'Sprite': {
          const s = new SpriteComponent();
          const d = comp.data;
          s.enabled = d.enabled ?? true;
          s.texturePath = d.texturePath ?? d.texture ?? null;
          if (d.color) s.color = new THREE.Color(d.color[0], d.color[1], d.color[2]);
          s.opacity = d.opacity ?? 1;
          s.flipX = d.flipX ?? false;
          s.flipY = d.flipY ?? false;
          s.pixelsPerUnit = d.pixelsPerUnit ?? 100;
          s.sortingLayer = d.sortingLayer ?? 0;
          s.sortingOrder = d.sortingOrder ?? 0;
          engine.ecs.addComponent(entityId, s);
          break;
        }

        case 'TextRenderer': {
          const t = new TextRendererComponent();
          const d = comp.data;
          t.enabled = d.enabled ?? true;
          t.text = d.text ?? 'Hello World';
          t.fontPath = d.fontPath ?? null;
          t.fontSize = d.fontSize ?? 1;
          if (d.color) t.color = new THREE.Color(d.color[0], d.color[1], d.color[2]);
          t.opacity = d.opacity ?? 1;
          t.alignment = d.alignment ?? 'center';
          t.maxWidth = d.maxWidth ?? 0;
          t.billboard = d.billboard ?? false;
          engine.ecs.addComponent(entityId, t);
          break;
        }

        case 'Environment': {
          const e = new EnvironmentComponent();
          const d = comp.data;
          e.enabled = d.enabled ?? true;
          e.backgroundMode = d.backgroundMode ?? 'color';
          if (d.backgroundColor) e.backgroundColor = new THREE.Color(d.backgroundColor[0], d.backgroundColor[1], d.backgroundColor[2]);
          e.skyboxMode = d.skyboxMode ?? 'panorama';
          e.skyboxPath = d.skyboxPath ?? null;
          if (d.skyboxFaces) {
            e.skyboxFaces = {
              right: d.skyboxFaces.right ?? null,
              left: d.skyboxFaces.left ?? null,
              top: d.skyboxFaces.top ?? null,
              bottom: d.skyboxFaces.bottom ?? null,
              front: d.skyboxFaces.front ?? null,
              back: d.skyboxFaces.back ?? null,
            };
          }
          if (d.ambientColor) e.ambientColor = new THREE.Color(d.ambientColor[0], d.ambientColor[1], d.ambientColor[2]);
          e.ambientIntensity = d.ambientIntensity ?? 0.5;
          e.fogEnabled = d.fogEnabled ?? true;
          if (d.fogColor) e.fogColor = new THREE.Color(d.fogColor[0], d.fogColor[1], d.fogColor[2]);
          e.fogMode = d.fogMode ?? 'exponential';
          e.fogDensity = d.fogDensity ?? 0.008;
          e.fogNear = d.fogNear ?? 10;
          e.fogFar = d.fogFar ?? 100;
          e.toneMapping = d.toneMapping ?? 'ACES';
          e.exposure = d.exposure ?? 1.2;
          e.bloomEnabled = d.bloomEnabled ?? true;
          e.bloomThreshold = d.bloomThreshold ?? 0.8;
          e.bloomStrength = d.bloomStrength ?? 0.5;
          e.bloomRadius = d.bloomRadius ?? 0.4;
          e.ssaoEnabled = d.ssaoEnabled ?? false;
          e.ssaoRadius = d.ssaoRadius ?? 0.5;
          e.ssaoBias = d.ssaoBias ?? 0.025;
          e.ssaoIntensity = d.ssaoIntensity ?? 1.0;
          e.ssrEnabled = d.ssrEnabled ?? false;
          e.ssrMaxDistance = d.ssrMaxDistance ?? 50;
          e.ssrThickness = d.ssrThickness ?? 0.5;
          e.ssrStride = d.ssrStride ?? 0.3;
          e.ssrFresnel = d.ssrFresnel ?? 1.0;
          e.ssrOpacity = d.ssrOpacity ?? 0.5;
          e.ssgiEnabled = d.ssgiEnabled ?? false;
          e.ssgiSliceCount = d.ssgiSliceCount ?? 2;
          e.ssgiStepCount = d.ssgiStepCount ?? 8;
          e.ssgiRadius = d.ssgiRadius ?? 12;
          e.ssgiThickness = d.ssgiThickness ?? 1;
          e.ssgiExpFactor = d.ssgiExpFactor ?? 2;
          e.ssgiAoIntensity = d.ssgiAoIntensity ?? 1;
          e.ssgiGiIntensity = d.ssgiGiIntensity ?? 10;
          e.cloudsEnabled = d.cloudsEnabled ?? false;
          e.cloudMinHeight = d.cloudMinHeight ?? 200;
          e.cloudMaxHeight = d.cloudMaxHeight ?? 400;
          e.cloudCoverage = d.cloudCoverage ?? 0.5;
          e.cloudDensity = d.cloudDensity ?? 0.3;
          e.cloudAbsorption = d.cloudAbsorption ?? 1.0;
          e.cloudScatter = d.cloudScatter ?? 1.0;
          if (d.cloudColor) e.cloudColor = new THREE.Color(d.cloudColor[0], d.cloudColor[1], d.cloudColor[2]);
          e.cloudSpeed = d.cloudSpeed ?? 1.0;
          e.skyTurbidity = d.skyTurbidity ?? 2;
          e.skyRayleigh = d.skyRayleigh ?? 1;
          e.skyMieCoefficient = d.skyMieCoefficient ?? 0.005;
          e.skyMieDirectionalG = d.skyMieDirectionalG ?? 0.8;
          e.sunElevation = d.sunElevation ?? 45;
          e.sunAzimuth = d.sunAzimuth ?? 180;
          e.vignetteEnabled = d.vignetteEnabled ?? false;
          e.vignetteIntensity = d.vignetteIntensity ?? 0.3;
          e.vignetteRoundness = d.vignetteRoundness ?? 0.5;
          e.chromaticAberration = d.chromaticAberration ?? 0;
          e.filmGrain = d.filmGrain ?? 0;
          e.dofEnabled = d.dofEnabled ?? false;
          e.dofFocusDistance = d.dofFocusDistance ?? 10;
          e.dofAperture = d.dofAperture ?? 0.025;
          e.dofMaxBlur = d.dofMaxBlur ?? 10;
          e.shadowCascades = d.shadowCascades ?? 4;
          e.shadowDistance = d.shadowDistance ?? 200;
          engine.ecs.addComponent(entityId, e);
          break;
        }

        case 'CSGBrush': {
          const b = new CSGBrushComponent();
          const d = comp.data;
          b.enabled = d.enabled ?? true;
          b.shape = d.shape ?? 'box';
          b.operation = d.operation ?? 'additive';
          if (d.size) b.size.set(d.size[0], d.size[1], d.size[2]);
          b.radius = d.radius ?? 0.5;
          b.segments = d.segments ?? 16;
          b.stairSteps = d.stairSteps ?? 8;
          b.generateCollision = d.generateCollision ?? true;
          b.castShadow = d.castShadow ?? true;
          b.receiveShadow = d.receiveShadow ?? true;
          b.materialPath = d.materialPath ?? null;
          b._dirty = true;
          engine.ecs.addComponent(entityId, b);
          break;
        }
      }
    }
  }

  // Restore parent-child relationships
  for (const entityData of data.entities) {
    if (entityData.parent !== null && entityData.parent !== undefined) {
      const childId = idMap.get(entityData.id);
      const parentId = idMap.get(entityData.parent);
      if (childId !== undefined && parentId !== undefined) {
        engine.ecs.setParent(childId, parentId);
      }
    }
  }

  // Load deferred 3D model assets (fire-and-forget, non-blocking)
  for (const deferred of deferredModelLoads) {
    // Use .fluxmesh loader if the path points to a .fluxmesh file
    if (deferred.modelPath.endsWith('.fluxmesh')) {
      loadDeferredFluxMesh(engine, deferred.meshComp, deferred.modelPath);
    } else {
      loadDeferredModel(engine, deferred.meshComp, deferred.modelPath);
    }
  }

  // Load deferred .fluxmat material assets (fire-and-forget, non-blocking)
  for (const deferred of deferredMaterialLoads) {
    loadDeferredMaterial(engine, deferred.meshComp, deferred.materialPath);
  }
}

/** Resolve path and load a .fluxmesh asset with per-slot materials onto a MeshRendererComponent */
async function loadDeferredFluxMesh(
  engine: Engine,
  meshComp: MeshRendererComponent,
  fluxmeshPath: string,
): Promise<void> {
  try {
    let loadPath: string;
    try {
      loadPath = projectManager.resolvePath(fluxmeshPath);
    } catch {
      loadPath = fluxmeshPath;
    }

    const assets = engine.getSubsystem('assets') as AssetManager;
    const result: FluxMeshLoadResult = await assets.loadFluxMesh(loadPath);
    const scene = result.scene.clone();
    scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = meshComp.castShadow;
        child.receiveShadow = meshComp.receiveShadow;
      }
    });

    // Build overrides map from component's materialSlots
    const overrides = new Map<number, string>();
    if (meshComp.materialSlots) {
      for (const ov of meshComp.materialSlots) {
        overrides.set(ov.slotIndex, ov.materialPath);
      }
    }

    // Load materials per slot
    const materials = engine.getSubsystem('materials') as MaterialSystem;
    const matPromises = result.slots.map(async (slot, idx) => {
      const override = overrides.get(idx);
      try {
        let absMatPath: string;
        if (override) {
          // Override paths are project-relative, need resolvePath
          try { absMatPath = projectManager.resolvePath(override); } catch { absMatPath = override; }
        } else {
          // Default material paths are already absolute from loadFluxMesh
          absMatPath = slot.defaultMaterial;
        }
        const matData = await assets.loadAsset(absMatPath, 'material') as FluxMatData | null;
        if (!matData || !materials) return null;

        // Resolve texture paths relative to the .fluxmat's directory, with project-relative fallback
        const matDir = absMatPath.substring(0, absMatPath.lastIndexOf('/'));
        const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
          let texAbsPath: string;
          if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
            texAbsPath = relPath;
          } else {
            texAbsPath = `${matDir}/${relPath}`;
            try {
              const projResolved = projectManager.resolvePath(relPath);
              const { getFileSystem } = await import('../filesystem');
              if (!(await getFileSystem().exists(texAbsPath)) && await getFileSystem().exists(projResolved)) {
                texAbsPath = projResolved;
              }
            } catch { /* keep matDir-relative */ }
          }
          const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
          return assets.loadTexture(texUrl);
        };

        return materials.createFromFluxMat(matData, loadTexture, absMatPath);
      } catch (err) {
        console.warn(`[SceneSerializer] Failed to load material for slot "${slot.name}":`, err);
        return null;
      }
    });

    const loadedMaterials = await Promise.all(matPromises);
    applyMaterialsToModel(scene, result.slots, loadedMaterials);
    meshComp.mesh = scene;
    applyComponentUvTransform(meshComp);
  } catch (err) {
    console.error(`[SceneSerializer] Failed to load .fluxmesh "${fluxmeshPath}":`, err);
  }
}

/** Resolve path and load a 3D model asset onto a MeshRendererComponent */
async function loadDeferredModel(
  engine: Engine,
  meshComp: MeshRendererComponent,
  modelPath: string,
): Promise<void> {
  try {
    let loadPath: string;
    try {
      loadPath = projectManager.resolvePath(modelPath);
    } catch {
      loadPath = modelPath;
    }

    const fileUrl = loadPath.startsWith('file://') ? loadPath : `file:///${loadPath.replace(/\\/g, '/')}`;
    const assets = engine.getSubsystem('assets') as AssetManager;
    const gltf = await assets.loadModel(fileUrl);
    const scene = gltf.scene.clone();
    scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = meshComp.castShadow;
        child.receiveShadow = meshComp.receiveShadow;
      }
    });
    meshComp.mesh = scene;
    applyComponentUvTransform(meshComp);
  } catch (err) {
    console.error(`[SceneSerializer] Failed to load model "${modelPath}":`, err);
  }
}

/** Resolve a .fluxmat or .fluxvismat path and apply the material to a MeshRendererComponent */
async function loadDeferredMaterial(
  engine: Engine,
  meshComp: MeshRendererComponent,
  materialPath: string,
): Promise<void> {
  try {
    let absPath: string;
    try {
      absPath = projectManager.resolvePath(materialPath);
    } catch {
      absPath = materialPath;
    }

    const assets = engine.getSubsystem('assets') as AssetManager;
    const materials = engine.getSubsystem('materials') as MaterialSystem;
    if (!materials) return;

    // Resolve texture paths relative to the material's directory, with project-relative fallback
    const matDir = absPath.substring(0, absPath.lastIndexOf('/'));
    const loadTexture = async (relPath: string): Promise<THREE.Texture> => {
      let texAbsPath: string;
      if (/^[A-Z]:/i.test(relPath) || relPath.startsWith('/') || relPath.startsWith('file://')) {
        texAbsPath = relPath;
      } else {
        texAbsPath = `${matDir}/${relPath}`;
        try {
          const projResolved = projectManager.resolvePath(relPath);
          const { getFileSystem } = await import('../filesystem');
          if (!(await getFileSystem().exists(texAbsPath)) && await getFileSystem().exists(projResolved)) {
            texAbsPath = projResolved;
          }
        } catch { /* project not loaded or path invalid — keep matDir-relative */ }
      }
      const texUrl = texAbsPath.startsWith('file://') ? texAbsPath : `file:///${texAbsPath.replace(/\\/g, '/')}`;
      return assets.loadTexture(texUrl);
    };

    let mat: THREE.Material;

    if (materialPath.endsWith('.fluxvismat')) {
      // Visual material — compile graph to shader
      const visData = await assets.loadAsset(absPath, 'visual_material') as VisualMaterialFile | null;
      if (!visData) return;
      const result = await materials.createFromVisualMat(visData, loadTexture, materialPath);
      mat = result;
    } else {
      // Standard .fluxmat material
      const matData = await assets.loadAsset(absPath, 'material') as FluxMatData | null;
      if (!matData) return;
      mat = await materials.createFromFluxMat(matData, loadTexture, materialPath);
      // Store texture map paths in userData for round-trip serialization
      const mapKeys = ['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
      for (const key of mapKeys) {
        if (matData[key]) {
          mat.userData[key] = matData[key];
        }
      }
    }

    // Apply to mesh
    if (meshComp.mesh instanceof THREE.Mesh) {
      meshComp.mesh.material = mat;
    } else if (meshComp.mesh instanceof THREE.Group) {
      meshComp.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = mat;
        }
      });
    }
    applyComponentUvTransform(meshComp);
  } catch (err) {
    console.error(`[SceneSerializer] Failed to load material "${materialPath}":`, err);
  }
}

// ── Geometry reconstruction ──

/** Apply component-level UV transform to all texture maps on a mesh's materials. */
function applyComponentUvTransform(meshComp: MeshRendererComponent): void {
  if (!meshComp.mesh) return;
  const { uvScale, uvOffset, uvRotation } = meshComp;
  if (uvScale.x === 1 && uvScale.y === 1 && uvOffset.x === 0 && uvOffset.y === 0 && uvRotation === 0) return;
  const rotRad = (uvRotation * Math.PI) / 180;
  const visit = (mat: THREE.Material) => {
    if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) return;
    const maps: (THREE.Texture | null)[] = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap, mat.emissiveMap];
    for (const tex of maps) {
      if (!tex) continue;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(uvScale.x, uvScale.y);
      tex.offset.set(uvOffset.x, uvOffset.y);
      tex.rotation = rotRad;
      tex.center.set(0.5, 0.5);
      tex.needsUpdate = true;
    }
  };
  const mesh = meshComp.mesh;
  if (mesh instanceof THREE.Mesh) {
    if (Array.isArray(mesh.material)) mesh.material.forEach(visit);
    else visit(mesh.material);
  } else {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) child.material.forEach(visit);
        else visit(child.material);
      }
    });
  }
}

function buildGeometry(primitiveType: string, params: any): THREE.BufferGeometry {
  switch (primitiveType) {
    case 'cube':
      return new THREE.BoxGeometry(params.width ?? 1, params.height ?? 1, params.depth ?? 1);
    case 'sphere':
      return new THREE.SphereGeometry(params.radius ?? 0.5, 32, 32);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        params.radiusTop ?? 0.5, params.radiusBottom ?? 0.5, params.height ?? 1, 32
      );
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

// ── File I/O helpers ──

export async function saveSceneToFile(
  scene: Scene,
  engine: Engine,
  filePath: string,
  editorCamera?: THREE.PerspectiveCamera,
  orbitTarget?: THREE.Vector3
): Promise<void> {
  const api = window.fluxionAPI;
  if (!api) throw new Error('fluxionAPI not available');

  const data = serializeScene(scene, engine, editorCamera, orbitTarget);
  await api.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function loadSceneFromFile(
  engine: Engine,
  scene: Scene,
  filePath: string
): Promise<SceneFileData> {
  const api = window.fluxionAPI;
  if (!api) throw new Error('fluxionAPI not available');

  const content = await api.readFile(filePath);
  const data = JSON.parse(content) as SceneFileData;
  deserializeScene(engine, data, scene);
  return data;
}
