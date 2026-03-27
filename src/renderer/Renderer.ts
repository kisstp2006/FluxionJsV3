// ============================================================
// FluxionJS V2 — Main Renderer
// Three.js WebGPU-ready renderer with PBR pipeline
// Inspired by Nuake PBR + LumixEngine rendering
// ============================================================

import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { projectManager } from '../project/ProjectManager';
import { ECSManager, EntityId, System, clearDirty, isDirty } from '../core/ECS';
import { EngineEvents } from '../core/EventSystem';
import {
  TransformComponent,
  MeshRendererComponent,
  CameraComponent,
  LightComponent,
  EnvironmentComponent,
  ToneMappingMode,
  SpriteComponent,
  TextRendererComponent,
} from '../core/Components';
import { PostProcessingPipeline } from './PostProcessing';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { DebugDraw } from './DebugDraw';
import { DebugConsole } from '../core/DebugConsole';

// Module-level scratch — avoids per-frame Vector3 allocations in LightSystem
const _lightForward = new THREE.Vector3();

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
  csm: CSM | null = null;

  readonly engine: Engine;
  private activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private entityToObject: Map<EntityId, THREE.Object3D> = new Map();
  private objectToEntity: Map<THREE.Object3D, EntityId> = new Map();
  private config: Required<RendererConfig>;
  private eventUnsubs: (() => void)[] = [];

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

    // Hook into engine events (store unsubscribers for cleanup)
    this.eventUnsubs.push(
      engine.events.on(EngineEvents.RENDER, () => this.render()),
      engine.events.on(EngineEvents.RESIZE, (data: { width: number; height: number }) => {
        this.onResize(data.width, data.height);
      }),
      engine.events.on(EngineEvents.SCENE_UNLOADED, () => this.clearSceneObjects()),
    );

    // Register ECS systems
    engine.ecs.addSystem(new TransformNodeSystem(this));
    engine.ecs.addSystem(new TransformSyncSystem(this));
    engine.ecs.addSystem(new MeshRendererSystem(this));
    engine.ecs.addSystem(new SpriteRendererSystem(this));
    engine.ecs.addSystem(new TextRendererSystem(this));
    engine.ecs.addSystem(new CameraSystem(this));
    engine.ecs.addSystem(new LightSystem(this));
    engine.ecs.addSystem(new EnvironmentSystem(this));

    // Debug drawing: overlay (gizmoScene) + world (main scene for depth test)
    DebugDraw.init(this.gizmoScene, this.scene);

    // Register as subsystem
    engine.registerSubsystem('renderer', this);
  }

  render(): void {
    this.postProcessing.render(this.engine.time.deltaTime);
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
    // Idempotent: remove previous object if one already exists for this entity
    const prev = this.entityToObject.get(entity);
    if (prev) {
      this.scene.remove(prev);
      this.objectToEntity.delete(prev);
    }
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

  /** Remove all tracked objects from the Three.js scene. Called on scene switch. */
  clearSceneObjects(): void {
    for (const [, obj] of this.entityToObject) {
      this.scene.remove(obj);
    }
    this.entityToObject.clear();
    this.objectToEntity.clear();
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
    for (const unsub of this.eventUnsubs) unsub();
    this.eventUnsubs.length = 0;
    DebugDraw.dispose();
    this.postProcessing.dispose();
    this.renderer.dispose();
  }
}

// ── ECS Systems for Rendering ──

class TransformNodeSystem implements System {
  readonly name = 'TransformNode';
  readonly requiredComponents = ['Transform'];
  priority = -200; // Run before everything else
  enabled = true;
  private tracked: Set<EntityId> = new Set();

  constructor(private renderer: FluxionRenderer) {}

  onSceneClear(): void {
    this.tracked.clear();
  }

  update(entities: Set<EntityId>, _ecs: ECSManager): void {
    // Ensure every Transform entity has a scene node
    for (const entity of entities) {
      if (!this.renderer.getObject(entity)) {
        const node = new THREE.Object3D();
        this.renderer.addObject(entity, node);
        this.tracked.add(entity);
      }
    }

    // Cleanup removed entities
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this.renderer.removeObject(entity);
        this.tracked.delete(entity);
      }
    }
  }
}

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
  private trackedMesh: Map<EntityId, THREE.Mesh | THREE.Group | THREE.Object3D> = new Map();

  constructor(private renderer: FluxionRenderer) {}

  onSceneClear(): void {
    this.tracked.clear();
    this.trackedMesh.clear();
  }

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    // Add new meshes / detect mesh swaps
    for (const entity of entities) {
      const meshComp = ecs.getComponent<MeshRendererComponent>(entity, 'MeshRenderer');
      if (!meshComp?.mesh) continue;

      const currentMesh = this.trackedMesh.get(entity);

      if (!this.tracked.has(entity)) {
        // First time — add to scene
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
        this.trackedMesh.set(entity, meshComp.mesh);
      } else if (currentMesh !== meshComp.mesh) {
        // Mesh reference changed — swap in scene
        this.renderer.removeObject(entity);

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
        this.trackedMesh.set(entity, meshComp.mesh);
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
        this.trackedMesh.delete(entity);
      }
    }
  }
}

class SpriteRendererSystem implements System {
  readonly name = 'SpriteRenderer';
  readonly requiredComponents = ['Transform', 'Sprite'];
  priority = 1;
  enabled = true;
  private tracked: Set<EntityId> = new Set();
  private trackedMesh: Map<EntityId, THREE.Mesh> = new Map();
  private loadingTextures: Set<EntityId> = new Set();

  constructor(private renderer: FluxionRenderer) {}

  onSceneClear(): void {
    this.tracked.clear();
    this.trackedMesh.clear();
    this.loadingTextures.clear();
  }

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    for (const entity of entities) {
      const sprite = ecs.getComponent<SpriteComponent>(entity, 'Sprite');
      if (!sprite || !sprite.enabled) continue;

      // Build or rebuild sprite mesh when needed
      if (!sprite.spriteMesh) {
        const geom = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({
          color: sprite.color,
          transparent: true,
          opacity: sprite.opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        sprite.spriteMesh = new THREE.Mesh(geom, mat);
        sprite.spriteMesh.renderOrder = sprite.sortingLayer * 1000 + sprite.sortingOrder;
      }

      // Load texture if path changed
      if (sprite.texturePath && !sprite.spriteTexture && !this.loadingTextures.has(entity)) {
        this.loadingTextures.add(entity);
        this.loadSpriteTexture(entity, sprite);
      }

      // Sync material properties — only mark needsUpdate when the component is dirty
      if (isDirty(sprite)) {
        const mat = sprite.spriteMesh.material as THREE.MeshBasicMaterial;
        mat.color.copy(sprite.color);
        mat.opacity = sprite.opacity;
        mat.needsUpdate = true;
        clearDirty(sprite);
      }

      // Flip
      sprite.spriteMesh.scale.set(
        sprite.flipX ? -1 : 1,
        sprite.flipY ? -1 : 1,
        1
      );

      sprite.spriteMesh.renderOrder = sprite.sortingLayer * 1000 + sprite.sortingOrder;

      const currentMesh = this.trackedMesh.get(entity);
      if (!this.tracked.has(entity)) {
        this.renderer.addObject(entity, sprite.spriteMesh);
        this.tracked.add(entity);
        this.trackedMesh.set(entity, sprite.spriteMesh);
      } else if (currentMesh !== sprite.spriteMesh) {
        this.renderer.removeObject(entity);
        this.renderer.addObject(entity, sprite.spriteMesh);
        this.trackedMesh.set(entity, sprite.spriteMesh);
      }
    }

    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this.renderer.removeObject(entity);
        this.tracked.delete(entity);
        this.trackedMesh.delete(entity);
      }
    }
  }

  private async loadSpriteTexture(entity: EntityId, sprite: SpriteComponent): Promise<void> {
    try {
      const { projectManager } = await import('../project/ProjectManager');
      const absPath = projectManager.resolvePath(sprite.texturePath!);
      const texUrl = absPath.startsWith('file://') ? absPath : `file:///${absPath.replace(/\\/g, '/')}`;
      const assets = this.renderer.engine.getSubsystem('assets') as any;
      if (!assets) return;
      const texture = await assets.loadTexture(texUrl);
      sprite.spriteTexture = texture;

      // Calculate aspect ratio from texture
      if (sprite.spriteMesh) {
        const mat = sprite.spriteMesh.material as THREE.MeshBasicMaterial;
        mat.map = texture;
        mat.needsUpdate = true;

        // Scale quad to match image aspect ratio
        const img = texture.image;
        if (img && img.width && img.height) {
          const w = img.width / sprite.pixelsPerUnit;
          const h = img.height / sprite.pixelsPerUnit;
          sprite.spriteMesh.geometry.dispose();
          sprite.spriteMesh.geometry = new THREE.PlaneGeometry(w, h);
        }
      }
    } catch (err) {
      DebugConsole.LogError(`[SpriteRendererSystem] Failed to load texture for entity ${entity}: ${err}`);
    } finally {
      this.loadingTextures.delete(entity);
    }
  }
}

class TextRendererSystem implements System {
  readonly name = 'TextRenderer';
  readonly requiredComponents = ['Transform', 'TextRenderer'];
  priority = 2;
  enabled = true;
  private tracked: Set<EntityId> = new Set();
  private trackedMesh: Map<EntityId, THREE.Mesh> = new Map();
  private fontCache: Map<string, FontFace> = new Map();
  private loadingFonts: Set<string> = new Set();

  constructor(private renderer: FluxionRenderer) {}

  onSceneClear(): void {
    this.tracked.clear();
    this.trackedMesh.clear();
  }

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    for (const entity of entities) {
      const textComp = ecs.getComponent<TextRendererComponent>(entity, 'TextRenderer');
      if (!textComp || !textComp.enabled) continue;

      // Build cache key to detect changes
      const cacheKey = `${textComp.text}|${textComp.fontPath}|${textComp.fontSize}|${textComp.color.getHex()}|${textComp.opacity}|${textComp.alignment}|${textComp.maxWidth}|${textComp.billboard}`;

      if (cacheKey !== textComp._cacheKey) {
        textComp._cacheKey = cacheKey;
        this.rebuildTextMesh(entity, textComp);
      }

      // Load font if not cached
      if (textComp.fontPath && !this.fontCache.has(textComp.fontPath) && !this.loadingFonts.has(textComp.fontPath)) {
        this.loadFont(textComp.fontPath);
      }

      // Billboard: always face camera
      if (textComp.billboard && textComp.textMesh) {
        const cam = this.renderer.getActiveCamera();
        if (cam) {
          textComp.textMesh.quaternion.copy(cam.quaternion);
        }
      }

      if (!textComp.textMesh) continue;

      const currentMesh = this.trackedMesh.get(entity);
      if (!this.tracked.has(entity)) {
        this.renderer.addObject(entity, textComp.textMesh);
        this.tracked.add(entity);
        this.trackedMesh.set(entity, textComp.textMesh);
      } else if (currentMesh !== textComp.textMesh) {
        this.renderer.removeObject(entity);
        this.renderer.addObject(entity, textComp.textMesh);
        this.trackedMesh.set(entity, textComp.textMesh);
      }
    }

    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        this.renderer.removeObject(entity);
        this.tracked.delete(entity);
        this.trackedMesh.delete(entity);
      }
    }
  }

  private rebuildTextMesh(_entity: EntityId, textComp: TextRendererComponent): void {
    // Dispose old texture
    if (textComp.textTexture) {
      textComp.textTexture.dispose();
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Determine font family
    const fontFamily = textComp.fontPath
      ? (this.fontCache.has(textComp.fontPath) ? `FluxFont_${this.sanitizeFontName(textComp.fontPath)}` : 'sans-serif')
      : 'sans-serif';

    const pixelFontSize = Math.max(16, Math.round(textComp.fontSize * 128));
    ctx.font = `${pixelFontSize}px ${fontFamily}`;

    // Word wrap if maxWidth > 0
    const lines = this.wrapText(ctx, textComp.text, textComp.maxWidth > 0 ? textComp.maxWidth * 128 : Infinity);
    const lineHeight = pixelFontSize * 1.2;

    // Measure text dimensions
    let maxLineWidth = 0;
    for (const line of lines) {
      const m = ctx.measureText(line);
      if (m.width > maxLineWidth) maxLineWidth = m.width;
    }

    const padding = pixelFontSize * 0.2;
    const canvasW = Math.ceil(maxLineWidth + padding * 2);
    const canvasH = Math.ceil(lines.length * lineHeight + padding * 2);

    if (canvasW <= 0 || canvasH <= 0) return;

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Re-set font after canvas resize (reset clears state)
    ctx.font = `${pixelFontSize}px ${fontFamily}`;
    ctx.fillStyle = `rgba(${Math.round(textComp.color.r * 255)},${Math.round(textComp.color.g * 255)},${Math.round(textComp.color.b * 255)},${textComp.opacity})`;
    ctx.textBaseline = 'top';

    // Alignment
    let textAlign: CanvasTextAlign = 'center';
    if (textComp.alignment === 'left') textAlign = 'left';
    else if (textComp.alignment === 'right') textAlign = 'right';
    ctx.textAlign = textAlign;

    const xPos = textAlign === 'left' ? padding
      : textAlign === 'right' ? canvasW - padding
      : canvasW / 2;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], xPos, padding + i * lineHeight);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    textComp.textTexture = texture;

    // World-space dimensions: 1 fontSize unit = 1 world unit height for a single line
    const worldH = textComp.fontSize * lines.length * 1.2;
    const worldW = worldH * (canvasW / canvasH);

    const geom = new THREE.PlaneGeometry(worldW, worldH);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Dispose old mesh geometry/material
    if (textComp.textMesh) {
      textComp.textMesh.geometry.dispose();
      (textComp.textMesh.material as THREE.Material).dispose();
    }

    textComp.textMesh = new THREE.Mesh(geom, mat);
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    if (!isFinite(maxWidth) || maxWidth <= 0) return text.split('\n');
    const result: string[] = [];
    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(' ');
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          result.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      result.push(line);
    }
    return result;
  }

  private async loadFont(fontPath: string): Promise<void> {
    this.loadingFonts.add(fontPath);
    try {
      const { projectManager } = await import('../project/ProjectManager');
      const absPath = projectManager.resolvePath(fontPath);
      const fontUrl = absPath.startsWith('file://') ? absPath : `file:///${absPath.replace(/\\/g, '/')}`;
      const familyName = `FluxFont_${this.sanitizeFontName(fontPath)}`;
      const face = new FontFace(familyName, `url(${fontUrl})`);
      await face.load();
      document.fonts.add(face);
      this.fontCache.set(fontPath, face);

      // Force rebuild of all text using this font (invalidate cache keys)
      const ecs = this.renderer.engine.ecs;
      const textComps = ecs.getComponentsOfType<TextRendererComponent>('TextRenderer');
      for (const [, tc] of textComps) {
        if (tc.fontPath === fontPath) {
          tc._cacheKey = '';
        }
      }
    } catch (err) {
      DebugConsole.LogError(`[TextRendererSystem] Failed to load font "${fontPath}": ${err}`);
    } finally {
      this.loadingFonts.delete(fontPath);
    }
  }

  private sanitizeFontName(path: string): string {
    return path.replace(/[^a-zA-Z0-9]/g, '_');
  }
}

class CameraSystem implements System {
  readonly name = 'CameraSync';
  readonly requiredComponents = ['Transform', 'Camera'];
  priority = 10;
  enabled = true;
  private lastOrthographic: Map<EntityId, boolean> = new Map();

  constructor(private renderer: FluxionRenderer) {}

  onSceneClear(): void {
    this.lastOrthographic.clear();
  }

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
  private cookieLoading: Set<EntityId> = new Set();

  constructor(private renderer: FluxionRenderer) {}

  private lastLightType: Map<EntityId, string> = new Map();

  onSceneClear(): void {
    this.tracked.clear();
    this.cookieLoading.clear();
    this.lastLightType.clear();
  }

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    for (const entity of entities) {
      const lightComp = ecs.getComponent<LightComponent>(entity, 'Light');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!lightComp || !transform) continue;

      // Detect lightType change → destroy old light and recreate
      const prevType = this.lastLightType.get(entity);
      if (lightComp.light && prevType !== undefined && prevType !== lightComp.lightType) {
        if ((lightComp.light as any).target) {
          this.renderer.scene.remove((lightComp.light as any).target);
        }
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

      // When CSM is active, suppress the user's directional light (CSM provides its own)
      if (lightComp.light instanceof THREE.DirectionalLight && this.renderer.csm) {
        lightComp.light.intensity = 0;
        lightComp.light.castShadow = false;
      }

      if (lightComp.light instanceof THREE.PointLight) {
        lightComp.light.distance = lightComp.range;
        lightComp.light.castShadow = lightComp.castShadow;
      }
      if (lightComp.light instanceof THREE.SpotLight) {
        lightComp.light.distance = lightComp.range;
        lightComp.light.angle = THREE.MathUtils.degToRad(lightComp.spotAngle);
        lightComp.light.penumbra = lightComp.spotPenumbra;
        lightComp.light.castShadow = lightComp.castShadow;

        // Update target from transform forward direction (local -Z)
        const forward = _lightForward.set(0, 0, -1).applyQuaternion(transform.quaternion);
        lightComp.light.target.position.copy(transform.position).add(forward);
        lightComp.light.target.updateMatrixWorld();

        // Cookie / projection texture
        if (lightComp.cookieTexturePath && !lightComp.cookieTexture && !this.cookieLoading.has(entity)) {
          this.cookieLoading.add(entity);
          const absPath = projectManager.resolvePath(lightComp.cookieTexturePath);
          const url = absPath.startsWith('file://') ? absPath : `file:///${absPath.replace(/\\/g, '/')}`;
          new THREE.TextureLoader().load(
            url,
            (tex) => {
              lightComp.cookieTexture = tex;
              if (lightComp.light instanceof THREE.SpotLight) {
                lightComp.light.map = tex;
              }
              this.cookieLoading.delete(entity);
            },
            undefined,
            (err) => {
              DebugConsole.LogWarning(`[LightSystem] Failed to load cookie texture: ${url}`);
              this.cookieLoading.delete(entity);
            },
          );
        }
        if (lightComp.cookieTexture) {
          lightComp.light.map = lightComp.cookieTexture;
        }
        if (!lightComp.cookieTexturePath && lightComp.cookieTexture) {
          lightComp.cookieTexture.dispose();
          lightComp.cookieTexture = null;
          lightComp.light.map = null;
          this.cookieLoading.delete(entity);
        }
      }
      if (lightComp.light instanceof THREE.DirectionalLight) {
        if (!this.renderer.csm) {
          lightComp.light.castShadow = lightComp.castShadow;
        }

        // Update target from transform forward direction (local -Z)
        const forward = _lightForward.set(0, 0, -1).applyQuaternion(transform.quaternion);
        lightComp.light.target.position.copy(transform.position).add(forward);
        lightComp.light.target.updateMatrixWorld();
      }

      if (isDirty(lightComp)) clearDirty(lightComp);
    }

    // Cleanup removed
    for (const entity of this.tracked) {
      if (!entities.has(entity)) {
        const lightComp = ecs.getComponent<LightComponent>(entity, 'Light');
        if (lightComp?.light && (lightComp.light as any).target) {
          this.renderer.scene.remove((lightComp.light as any).target);
        }
        this.renderer.removeObject(entity);
        this.tracked.delete(entity);
        this.lastLightType.delete(entity);
        this.cookieLoading.delete(entity);
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
        this.renderer.scene.add(dl.target);
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
        this.renderer.scene.add(sl.target);
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

// ── Environment System ──
// Reads the EnvironmentComponent (first one found) and applies settings to the
// Three.js scene (background, fog, ambient light) and PostProcessing pipeline.
// Overrides project-level defaults when present.

const TONE_MAP_LUT: Record<ToneMappingMode, THREE.ToneMapping> = {
  None: THREE.NoToneMapping,
  Linear: THREE.LinearToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
};

class EnvironmentSystem implements System {
  readonly name = 'Environment';
  readonly requiredComponents = ['Environment'];
  priority = -150; // Before mesh/light systems, after transform
  enabled = true;

  private renderer: FluxionRenderer;
  private ambientLight: THREE.AmbientLight | null = null;

  // Skybox cache — avoids reloading every frame
  private loadedSkyboxKey: string | null = null;
  private skyboxLoading = false;

  // Procedural sky
  private sky: Sky | null = null;
  private sunHelper: THREE.Vector3 = new THREE.Vector3();
  private pmremGenerator: THREE.PMREMGenerator | null = null;

  // CSM shadow tracking
  private csmKey: string | null = null;

  constructor(renderer: FluxionRenderer) {
    this.renderer = renderer;
  }

  onSceneClear(): void {
    this.cleanup();
    this.loadedSkyboxKey = null;
    this.skyboxLoading = false;
  }

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    // Use the first enabled EnvironmentComponent found
    let env: EnvironmentComponent | null = null;
    for (const entity of entities) {
      const comp = ecs.getComponent<EnvironmentComponent>(entity, 'Environment');
      if (comp?.enabled) {
        env = comp;
        break;
      }
    }

    if (!env) {
      this.renderer.postProcessing.environmentOverride = false;
      this.cleanup();
      return;
    }

    const scene = this.renderer.scene;
    const glRenderer = this.renderer.renderer;
    const pp = this.renderer.postProcessing;
    pp.environmentOverride = true;

    // ── Background ──
    if (env.backgroundMode === 'color') {
      scene.background = env.backgroundColor;
      // Clear IBL environment map so PBR materials don't receive residual lighting
      if (scene.environment) {
        scene.environment.dispose();
        scene.environment = null;
      }
      this.loadedSkyboxKey = null;
      this.removeProceduralSky(scene);
    } else if (env.backgroundMode === 'skybox') {
      if (env.skyboxMode === 'procedural') {
        this.applyProceduralSky(env, scene);
      } else {
        this.removeProceduralSky(scene);
        this.applySkybox(env, scene);
      }
    }

    // ── Ambient Light ──
    if (!this.ambientLight) {
      this.ambientLight = new THREE.AmbientLight(env.ambientColor, env.ambientIntensity);
      scene.add(this.ambientLight);
    }
    this.ambientLight.color.copy(env.ambientColor);
    this.ambientLight.intensity = env.ambientIntensity;

    // ── Fog ──
    if (env.fogEnabled) {
      if (env.fogMode === 'exponential') {
        if (!(scene.fog instanceof THREE.FogExp2)) {
          scene.fog = new THREE.FogExp2(env.fogColor.getHex(), env.fogDensity);
        }
        const fog = scene.fog as THREE.FogExp2;
        fog.color.copy(env.fogColor);
        fog.density = env.fogDensity;
      } else {
        if (!(scene.fog instanceof THREE.Fog)) {
          scene.fog = new THREE.Fog(env.fogColor.getHex(), env.fogNear, env.fogFar);
        }
        const fog = scene.fog as THREE.Fog;
        fog.color.copy(env.fogColor);
        fog.near = env.fogNear;
        fog.far = env.fogFar;
      }
    } else {
      scene.fog = null;
    }

    // ── Tone Mapping ──
    glRenderer.toneMapping = TONE_MAP_LUT[env.toneMapping] ?? THREE.ACESFilmicToneMapping;
    glRenderer.toneMappingExposure = env.exposure;

    // ── Post Processing ──
    pp.config.bloom = {
      enabled: env.bloomEnabled,
      threshold: env.bloomThreshold,
      strength: env.bloomStrength,
      radius: env.bloomRadius,
      softKnee: pp.config.bloom?.softKnee ?? 0.6,
    };

    pp.config.ssao = {
      enabled: env.ssaoEnabled,
      radius: env.ssaoRadius,
      bias: env.ssaoBias,
      intensity: env.ssaoIntensity,
    };

    pp.config.ssr = {
      enabled: env.ssrEnabled,
      maxDistance: env.ssrMaxDistance,
      thickness: env.ssrThickness,
      stride: env.ssrStride,
      fresnel: env.ssrFresnel,
      opacity: env.ssrOpacity,
      resolutionScale: env.ssrResolutionScale,
      infiniteThick: env.ssrInfiniteThick,
      distanceAttenuation: env.ssrDistanceAttenuation,
    };

    pp.config.ssgi = {
      enabled: env.ssgiEnabled,
      sliceCount: env.ssgiSliceCount,
      stepCount: env.ssgiStepCount,
      radius: env.ssgiRadius,
      thickness: env.ssgiThickness,
      expFactor: env.ssgiExpFactor,
      aoIntensity: env.ssgiAoIntensity,
      giIntensity: env.ssgiGiIntensity,
      backfaceLighting: env.ssgiBackfaceLighting,
      useLinearThickness: env.ssgiUseLinearThickness,
      screenSpaceSampling: env.ssgiScreenSpaceSampling,
    };

    // Cloud sun direction derived from sun elevation/azimuth
    const sunElRad = THREE.MathUtils.degToRad(env.sunElevation);
    const sunAzRad = THREE.MathUtils.degToRad(env.sunAzimuth);
    const sunDir = new THREE.Vector3(
      Math.cos(sunElRad) * Math.sin(sunAzRad),
      Math.sin(sunElRad),
      Math.cos(sunElRad) * Math.cos(sunAzRad),
    ).normalize();

    pp.config.clouds = {
      enabled: env.cloudsEnabled,
      minHeight: env.cloudMinHeight,
      maxHeight: env.cloudMaxHeight,
      coverage: env.cloudCoverage,
      density: env.cloudDensity,
      absorption: env.cloudAbsorption,
      scatter: env.cloudScatter,
      color: env.cloudColor,
      speed: env.cloudSpeed,
      sunDirection: sunDir,
    };

    pp.config.vignette = {
      enabled: env.vignetteEnabled,
      intensity: env.vignetteIntensity,
      roundness: env.vignetteRoundness,
    };

    pp.config.dof = {
      enabled: env.dofEnabled,
      focusDistance: env.dofFocusDistance,
      aperture: env.dofAperture,
      maxBlur: env.dofMaxBlur,
    };

    pp.config.exposure = env.exposure;

    pp.config.chromaticAberration = env.chromaticAberration;
    pp.config.filmGrain = env.filmGrain;

    // ── CSM (Cascaded Shadow Maps) ──
    this.updateCSM(env, ecs);
  }

  /** Create / update a procedural sky using Three.js Sky addon (Preetham model). */
  private applyProceduralSky(env: EnvironmentComponent, scene: THREE.Scene): void {
    if (!this.sky) {
      this.sky = new Sky();
      this.sky.scale.setScalar(10000);
      scene.add(this.sky);
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer.renderer);
      this.pmremGenerator.compileEquirectangularShader();
    }

    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = env.skyTurbidity;
    uniforms['rayleigh'].value = env.skyRayleigh;
    uniforms['mieCoefficient'].value = env.skyMieCoefficient;
    uniforms['mieDirectionalG'].value = env.skyMieDirectionalG;

    // Sun position from elevation + azimuth
    const phi = THREE.MathUtils.degToRad(90 - env.sunElevation);
    const theta = THREE.MathUtils.degToRad(env.sunAzimuth);
    this.sunHelper.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(this.sunHelper);

    // Generate environment map for PBR reflections
    const skyKey = `procedural:${env.skyTurbidity}:${env.skyRayleigh}:${env.skyMieCoefficient}:${env.skyMieDirectionalG}:${env.sunElevation}:${env.sunAzimuth}`;
    if (skyKey !== this.loadedSkyboxKey && this.pmremGenerator) {
      // Dispose previous environment map to avoid GPU memory leak
      if (scene.environment) {
        scene.environment.dispose();
      }
      const envMap = this.pmremGenerator.fromScene(this.sky as any).texture;
      scene.environment = envMap;
      this.loadedSkyboxKey = skyKey;
    }
  }

  /** Remove procedural sky mesh if present. */
  private removeProceduralSky(scene: THREE.Scene): void {
    if (this.sky) {
      scene.remove(this.sky);
      this.sky.geometry.dispose();
      (this.sky.material as THREE.ShaderMaterial).dispose();
      this.sky = null;
    }
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
      this.pmremGenerator = null;
    }
    // Clear environment map generated by the procedural sky
    if (scene.environment) {
      scene.environment.dispose();
      scene.environment = null;
    }
  }

  /** Load and apply a skybox (panorama or 6-face cubemap) to the scene. */
  private applySkybox(env: EnvironmentComponent, scene: THREE.Scene): void {
    const key = this.buildSkyboxKey(env);
    if (!key || key === this.loadedSkyboxKey || this.skyboxLoading) return;

    this.skyboxLoading = true;

    if (env.skyboxMode === 'panorama' && env.skyboxPath) {
      const url = `file:///${env.skyboxPath.replace(/\\/g, '/')}`;
      new THREE.TextureLoader().load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          scene.background = texture;
          scene.environment = texture;
          this.loadedSkyboxKey = key;
          this.skyboxLoading = false;
        },
        undefined,
        () => {
          DebugConsole.LogWarning(`[EnvironmentSystem] Failed to load panorama: ${env.skyboxPath}`);
          this.skyboxLoading = false;
        },
      );
    } else if (env.skyboxMode === 'cubemap') {
      const f = env.skyboxFaces;
      const paths = [f.right, f.left, f.top, f.bottom, f.front, f.back];
      if (paths.every((p) => p != null)) {
        const urls = paths.map((p) => `file:///${p!.replace(/\\/g, '/')}`);
        new THREE.CubeTextureLoader().load(
          urls,
          (cubeTexture) => {
            cubeTexture.colorSpace = THREE.SRGBColorSpace;
            scene.background = cubeTexture;
            scene.environment = cubeTexture;
            this.loadedSkyboxKey = key;
            this.skyboxLoading = false;
          },
          undefined,
          () => {
            DebugConsole.LogWarning('[EnvironmentSystem] Failed to load cubemap faces');
            this.skyboxLoading = false;
          },
        );
      } else {
        this.skyboxLoading = false;
      }
    } else {
      this.skyboxLoading = false;
    }
  }

  /** Build a cache key from the current skybox configuration. */
  private buildSkyboxKey(env: EnvironmentComponent): string | null {
    if (env.skyboxMode === 'panorama') {
      return env.skyboxPath ? `panorama:${env.skyboxPath}` : null;
    }
    const f = env.skyboxFaces;
    const faces = [f.right, f.left, f.top, f.bottom, f.front, f.back];
    if (faces.some((p) => !p)) return null;
    return `cubemap:${faces.join('|')}`;
  }

  /** Remove CSM instance and reset all CSM-patched materials. */
  private removeCSM(): void {
    if (this.renderer.csm) {
      this.renderer.csm.remove();
      this.renderer.csm.dispose();
      this.renderer.csm = null;
      this.csmKey = null;
    }
  }

  /** Create or update CSM based on EnvironmentComponent settings. */
  private updateCSM(env: EnvironmentComponent, ecs: ECSManager): void {
    const cascades = env.shadowCascades;

    // Find the first directional light entity for direction / color / intensity
    let dirLightComp: LightComponent | null = null;
    let dirTransform: TransformComponent | null = null;
    for (const entityId of ecs.getAllEntities()) {
      const lc = ecs.getComponent<LightComponent>(entityId, 'Light');
      if (lc?.lightType === 'directional') {
        const tc = ecs.getComponent<TransformComponent>(entityId, 'Transform');
        if (tc) {
          dirLightComp = lc;
          dirTransform = tc;
          break;
        }
      }
    }

    // No directional light → clean up CSM if present
    if (!dirLightComp || !dirTransform || cascades < 2) {
      if (this.renderer.csm) this.removeCSM();
      return;
    }

    const camera = this.renderer.getActiveCamera();
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      if (this.renderer.csm) this.removeCSM();
      return;
    }

    // Build a key to detect whether CSM needs recreation (struct changes)
    const key = `${cascades}:${env.shadowDistance}:${dirLightComp.shadowMapSize}`;
    if (key !== this.csmKey) {
      // Recreate CSM
      this.removeCSM();

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(dirTransform.quaternion);

      this.renderer.csm = new CSM({
        camera,
        parent: this.renderer.scene,
        cascades,
        maxFar: env.shadowDistance,
        mode: 'practical',         // PSSM with lambda = 0.5
        shadowMapSize: dirLightComp.shadowMapSize || 2048,
        shadowBias: -0.0001,
        lightDirection: forward.negate(),   // CSM expects direction FROM light
        lightIntensity: dirLightComp.intensity,
        lightNear: 0.5,
        lightFar: env.shadowDistance + 200,
        lightMargin: 100,
      });

      // Patch CSM's injected shader chunk: CSMShader calls getPointShadow
      // with 7 params but Three.js 0.170+ expects 8 (added shadowIntensity).
      const chunk = THREE.ShaderChunk.lights_fragment_begin;
      if (chunk.includes('getPointShadow') &&
          !chunk.includes('pointLightShadow.shadowIntensity')) {
        THREE.ShaderChunk.lights_fragment_begin = chunk.replace(
          'getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius,',
          'getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius,',
        );
      }

      // Copy color to all cascade lights
      for (const cl of this.renderer.csm.lights) {
        cl.color.copy(dirLightComp.color);
      }

      // Setup CSM for all existing materials in the scene
      this.renderer.scene.traverse((obj: THREE.Object3D) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => this.renderer.csm!.setupMaterial(m));
          } else if (mat) {
            this.renderer.csm!.setupMaterial(mat);
          }
        }
      });

      this.csmKey = key;
    }

    // ── Per-frame CSM sync ──
    const csm = this.renderer.csm!;

    // Sync light direction from directional light transform
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(dirTransform.quaternion);
    csm.lightDirection.copy(forward).negate();

    // Sync color + intensity
    for (const cl of csm.lights) {
      cl.color.copy(dirLightComp.color);
      cl.intensity = dirLightComp.intensity;
    }

    // Setup new materials that haven't been patched yet
    this.renderer.scene.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material;
        if (mat && !Array.isArray(mat) && !mat.defines?.USE_CSM) {
          csm.setupMaterial(mat);
        }
      }
    });

    // Update frustums and shadow positions
    csm.update();
    csm.updateUniforms();
  }

  private cleanup(): void {
    if (this.ambientLight) {
      this.renderer.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
      this.ambientLight = null;
    }
    this.removeProceduralSky(this.renderer.scene);
    this.loadedSkyboxKey = null;
    this.removeCSM();
  }

  destroy(): void {
    this.cleanup();
  }
}
