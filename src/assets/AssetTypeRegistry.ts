// ============================================================
// FluxionJS V3 — Asset Type Registry
// Pluggable file type system — ext→type→loader→icon→inspector.
// Inspired by Stride IAssetImporter and ezEngine DocumentManager.
// ============================================================

import { toLocalUrl } from '../utils/localUrl';
import type { IFileSystem } from '../filesystem/FileSystem';
import type { AssetMeta } from './AssetMeta';
import type { FluxMeshData, FluxMeshMaterialSlot, FluxMeshSubMeshRef } from './FluxMeshData';

// ── Template file imports ─────────────────────────────────────────────────────
import emptyTs     from './templates/empty.ts.tmpl';
import emptyJs     from './templates/empty.js.tmpl';
import defaultTs   from './templates/default.ts.tmpl';
import defaultJs   from './templates/default.js.tmpl';
import movementTs  from './templates/movement.ts.tmpl';
import movementJs  from './templates/movement.js.tmpl';
import rotatorTs   from './templates/rotator.ts.tmpl';
import rotatorJs   from './templates/rotator.js.tmpl';
import camFollowTs  from './templates/camera-follow.ts.tmpl';
import camFollowJs  from './templates/camera-follow.js.tmpl';
import physObjTs   from './templates/physics-object.ts.tmpl';
import physObjJs   from './templates/physics-object.js.tmpl';
import dbgHudTs    from './templates/debug-hud.ts.tmpl';
import dbgHudJs    from './templates/debug-hud.js.tmpl';
import coroutineTs  from './templates/coroutine.ts.tmpl';
import coroutineJs  from './templates/coroutine.js.tmpl';
import fpsCharTs   from './templates/fps-character.ts.tmpl';
import fpsCharJs   from './templates/fps-character.js.tmpl';
import flyingCamTs  from './templates/flying-camera.ts.tmpl';
import flyingCamJs  from './templates/flying-camera.js.tmpl';
import fuiFileTs   from './templates/fui-hud-file.ts.tmpl';
import fuiFileJs   from './templates/fui-hud-file.js.tmpl';
import fuiCodeTs   from './templates/fui-hud-code.ts.tmpl';
import fuiCodeJs   from './templates/fui-hud-code.js.tmpl';
import rttTs          from './templates/render-to-texture.ts.tmpl';
import rttJs          from './templates/render-to-texture.js.tmpl';
import sceneLoaderTs  from './templates/scene-loader.ts.tmpl';
import sceneLoaderJs  from './templates/scene-loader.js.tmpl';
import interactCtrlTs  from './templates/interact-controller.ts.tmpl';
import interactCtrlJs  from './templates/interact-controller.js.tmpl';
import interactableTs  from './templates/interactable.ts.tmpl';
import interactableJs  from './templates/interactable.js.tmpl';

// ── Types ──

export type ScriptLang = 'ts' | 'js';

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Languages available for this template. */
  languages: readonly ScriptLang[];
  /** Generate content — replaces \$CLS with className. */
  generate: (className: string, lang: ScriptLang) => string;
}

export interface AssetTypeDefinition {
  /** Unique type id, e.g. 'texture', 'model', 'audio', 'scene' */
  type: string;
  /** Human-readable name shown in UI */
  displayName: string;
  /** Emoji / icon char for the asset browser */
  icon: string;
  /** File extensions this type handles (lowercase, with dot) */
  extensions: string[];
  /** Grouping category in the asset browser sidebar */
  category: string;
  /** Optional accent colour for the asset browser badge */
  color?: string;
  /**
   * Optional loader — given a filesystem and absolute path, returns
   * the loaded asset data. When not provided the AssetManager will
   * fall back to its built-in THREE.js loaders.
   */
  loader?: (fs: IFileSystem, path: string) => Promise<any>;
  /**
   * Optional factory that creates a new default asset file.
   * When present, a "New <displayName>" option appears in the
   * Asset Browser context menu.
   */
  createDefault?: (fs: IFileSystem, dirPath: string, name: string, templateId?: string, lang?: ScriptLang) => Promise<string>;
  /** Optional list of creation templates shown in a picker dialog. */
  templates?: ScriptTemplate[];
  /** Show in import dialog? */
  canImport?: boolean;
  /** Electron file dialog filters for importing */
  importFilters?: { name: string; extensions: string[] }[];
  /** Whether the asset is serialisable into scene data */
  serializable?: boolean;
  /**
   * Optional post-import processor. Runs after a file is copied
   * into the project and its .fluxmeta is written. Use for
   * validation, thumbnail generation, metadata enrichment, etc.
   */
  importProcessor?: (fs: IFileSystem, importedPath: string, meta: AssetMeta) => Promise<void>;
  /**
   * Default import settings for this type (merged into .fluxmeta
   * importSettings when no overrides are provided).
   */
  defaultImportSettings?: Record<string, unknown>;
}

// ── Registry ──

class AssetTypeRegistryImpl {
  private types = new Map<string, AssetTypeDefinition>();
  private extMap = new Map<string, AssetTypeDefinition>();

  register(def: AssetTypeDefinition): void {
    this.types.set(def.type, def);
    for (const ext of def.extensions) {
      this.extMap.set(ext.toLowerCase(), def);
    }
  }

  getByType(type: string): AssetTypeDefinition | undefined {
    return this.types.get(type);
  }

  getByExtension(ext: string): AssetTypeDefinition | undefined {
    return this.extMap.get(ext.toLowerCase());
  }

  getAll(): AssetTypeDefinition[] {
    return [...this.types.values()];
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const def of this.types.values()) cats.add(def.category);
    return [...cats];
  }

  /** Types that have a createDefault factory → "New X" menu items */
  getCreatable(): AssetTypeDefinition[] {
    return this.getAll().filter((d) => d.createDefault != null);
  }

  /** Types available for import */
  getImportable(): AssetTypeDefinition[] {
    return this.getAll().filter((d) => d.canImport);
  }

  /** Resolve a filename to its AssetTypeDefinition (or undefined) */
  resolveFile(filename: string): AssetTypeDefinition | undefined {
    const dot = filename.lastIndexOf('.');
    if (dot < 0) return undefined;
    return this.getByExtension(filename.substring(dot));
  }
}

export const AssetTypeRegistry = new AssetTypeRegistryImpl();

// ── Built-in type registrations ──

AssetTypeRegistry.register({
  type: 'texture',
  displayName: 'Texture',
  icon: 'image',
  extensions: ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg', '.gif', '.tga', '.hdr', '.exr'],
  category: 'Textures',
  color: '#4fc3f7',
  canImport: true,
  importFilters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'gif', 'tga', 'hdr', 'exr'] }],
});

AssetTypeRegistry.register({
  type: 'model',
  displayName: '3D Model',
  icon: 'model',
  extensions: ['.glb', '.gltf', '.fbx', '.obj'],
  category: 'Models',
  color: '#81c784',
  canImport: true,
  importFilters: [{ name: '3D Models', extensions: ['glb', 'gltf', 'fbx', 'obj'] }],
  defaultImportSettings: { scale: 1, generateCollider: false },
  importProcessor: async (_fs, importedPath, meta) => {
    const ext = importedPath.substring(importedPath.lastIndexOf('.')).toLowerCase();
    const format = ext === '.glb' ? 'glb' : ext === '.gltf' ? 'gltf' : ext === '.fbx' ? 'fbx' : 'obj';
    meta.importSettings = { ...meta.importSettings, format };

    // --- Generate .fluxmesh + default .fluxmat files (with full material & texture extraction) ---
    try {
      const THREEModule = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const {
        extractFluxMatFromMaterial,
        getTextureRefsFromMaterial,
        saveTextureToFile,
      } = await import('./FluxMeshData');
      const { createAssetMeta, writeAssetMeta } = await import('./AssetMeta');

      // Load the model to inspect sub-meshes
      const fileUrl = toLocalUrl(importedPath);
      let root: InstanceType<typeof THREEModule.Object3D>;
      let embeddedClips: InstanceType<typeof THREEModule.AnimationClip>[] = [];
      if (format === 'fbx') {
        const fbxGroup = await new Promise<InstanceType<typeof THREEModule.Group>>((res, rej) => new FBXLoader().load(fileUrl, res, undefined, rej));
        root = fbxGroup;
        embeddedClips = (fbxGroup as any).animations ?? [];
      } else if (format === 'obj') {
        root = await new Promise<InstanceType<typeof THREEModule.Group>>((res, rej) => new OBJLoader().load(fileUrl, res, undefined, rej));
      } else {
        const gltf = await new Promise<any>((res, rej) => new GLTFLoader().load(fileUrl, res, undefined, rej));
        root = gltf.scene;
        embeddedClips = gltf.animations ?? [];
      }
      const animationClipNames: string[] = embeddedClips.map((c: any) => c.name as string).filter(Boolean);
      let hasSkinnedMeshFlag = false;
      root.traverse((child: any) => { if (child.isSkinnedMesh) hasSkinnedMeshFlag = true; });

      // Collect child meshes in depth-first order
      const meshes: InstanceType<typeof THREEModule.Mesh>[] = [];
      root.traverse((child: any) => {
        if (child.isMesh) meshes.push(child);
      });

      // Collect ALL unique materials across all meshes, including multi-material arrays.
      // Each unique THREE.Material reference becomes its own slot.
      interface MatRef { meshIndex: number; materialIndex: number; }
      const matToRefs = new Map<any, MatRef[]>();
      for (let i = 0; i < meshes.length; i++) {
        const rawMat = meshes[i].material;
        const mats: any[] = Array.isArray(rawMat) ? rawMat : [rawMat];
        for (let j = 0; j < mats.length; j++) {
          const m = mats[j];
          if (!matToRefs.has(m)) matToRefs.set(m, []);
          matToRefs.get(m)!.push({ meshIndex: i, materialIndex: j });
        }
      }

      // Derive paths
      const dir = importedPath.substring(0, importedPath.lastIndexOf('/'));
      const baseName = importedPath.substring(importedPath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');

      // Textures subdirectory (created lazily only if textures are found)
      const texturesDir = `${dir}/${baseName}_textures`;
      let texturesDirCreated = false;

      // Track already-saved textures to avoid saving the same texture twice
      const savedTextureCache = new Map<InstanceType<typeof THREEModule.Texture>, string>();

      const slots: FluxMeshMaterialSlot[] = [];
      const usedFileNames = new Set<string>();
      let slotIdx = 0;

      for (const [mat, refs] of matToRefs) {
        const slotName = mat.name || `Material_${slotIdx}`;
        // Build a unique safe filename (append index if name collides)
        let safeName = slotName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const candidateFileName = `${baseName}_${safeName}.fluxmat`;
        if (usedFileNames.has(candidateFileName)) {
          safeName = `${safeName}_${slotIdx}`;
        }
        usedFileNames.add(`${baseName}_${safeName}.fluxmat`);

        const fluxmatPath = `${dir}/${baseName}_${safeName}.fluxmat`;

        // Extract PBR properties from the THREE material
        const matJson = extractFluxMatFromMaterial(mat);

        // --- Extract and save textures from the material ---
        const texRefs = getTextureRefsFromMaterial(mat);
        for (const texRef of texRefs) {
          // Save UV transform from original texture if non-default
          const srcTex = texRef.texture;
          if (srcTex.repeat.x !== 1 || srcTex.repeat.y !== 1 ||
              srcTex.offset.x !== 0 || srcTex.offset.y !== 0 ||
              srcTex.rotation !== 0) {
            if (!matJson.uvTransforms) matJson.uvTransforms = {};
            const t: Record<string, number | number[]> = {};
            if (srcTex.repeat.x !== 1 || srcTex.repeat.y !== 1) t.repeat = [srcTex.repeat.x, srcTex.repeat.y];
            if (srcTex.offset.x !== 0 || srcTex.offset.y !== 0) t.offset = [srcTex.offset.x, srcTex.offset.y];
            if (srcTex.rotation !== 0) t.rotation = srcTex.rotation;
            matJson.uvTransforms[texRef.fluxmatKey] = t;
          }

          // Check if this texture was already saved (shared across materials)
          const cachedPath = savedTextureCache.get(texRef.texture);
          if (cachedPath) {
            matJson[texRef.fluxmatKey] = cachedPath;
            continue;
          }

          // Ensure textures directory exists
          if (!texturesDirCreated) {
            try { await _fs.mkdir(texturesDir); } catch { /* may already exist */ }
            texturesDirCreated = true;
          }

          const texFileName = `${baseName}_${safeName}_${texRef.label}.png`;
          const texSavePath = `${texturesDir}/${texFileName}`;

          const saved = await saveTextureToFile(
            texRef.texture,
            texSavePath,
            (path, data) => _fs.writeBinary(path, data),
          );

          if (saved) {
            // Store relative path from .fluxmat location to the texture
            const relTexPath = `${baseName}_textures/${texFileName}`;
            matJson[texRef.fluxmatKey] = relTexPath;
            savedTextureCache.set(texRef.texture, relTexPath);

            // Write .fluxmeta for the extracted texture
            const texMeta = createAssetMeta('texture', texSavePath, '', '', 0);
            await writeAssetMeta(_fs, texSavePath, texMeta);
          }
        }

        // Write the .fluxmat file
        await _fs.writeFile(fluxmatPath, JSON.stringify(matJson, null, 2));

        // Write .fluxmeta for the .fluxmat
        const matMeta = createAssetMeta('material', fluxmatPath, '', '', 0);
        await writeAssetMeta(_fs, fluxmatPath, matMeta);

        // Build slot with both legacy indices and precise mappings
        const subMeshIndices = [...new Set(refs.map(r => r.meshIndex))];
        const subMeshMappings: FluxMeshSubMeshRef[] = refs.map(r => ({
          meshIndex: r.meshIndex,
          materialIndex: r.materialIndex,
        }));
        const fluxmatFileName = `${baseName}_${safeName}.fluxmat`;
        slots.push({
          name: slotName,
          subMeshIndices,
          subMeshMappings,
          defaultMaterial: fluxmatFileName,
        });
        slotIdx++;
      }

      // If model had no meshes, create a single default slot
      if (slots.length === 0) {
        const fluxmatPath = `${dir}/${baseName}_Default.fluxmat`;
        await _fs.writeFile(fluxmatPath, JSON.stringify({ type: 'standard', color: [0.8, 0.8, 0.8], roughness: 0.5, metalness: 0.0 }, null, 2));
        const matMeta = createAssetMeta('material', fluxmatPath, '', '', 0);
        await writeAssetMeta(_fs, fluxmatPath, matMeta);
        slots.push({ name: 'Default', subMeshIndices: [], defaultMaterial: `${baseName}_Default.fluxmat` });
      }

      // Write .fluxmesh
      const fluxmeshPath = `${dir}/${baseName}.fluxmesh`;
      const modelFileName = importedPath.substring(importedPath.lastIndexOf('/') + 1);
      const importScale = (meta.importSettings.scale as number | undefined) ?? 1;
      const fluxmeshData: FluxMeshData = {
        version: 1,
        sourceModel: modelFileName,
        materialSlots: slots,
        ...(importScale !== 1 ? { importScale } : {}),
        ...(animationClipNames.length > 0 ? { animationClips: animationClipNames } : {}),
        ...(hasSkinnedMeshFlag ? { hasSkinnedMesh: true } : {}),
      };
      await _fs.writeFile(fluxmeshPath, JSON.stringify(fluxmeshData, null, 2));

      // Write .fluxmeta for the .fluxmesh
      const meshMeta = createAssetMeta('mesh', fluxmeshPath, '', '', 0);
      await writeAssetMeta(_fs, fluxmeshPath, meshMeta);

      // Store .fluxmesh path in the model's meta
      meta.importSettings.fluxmeshPath = fluxmeshPath;

      console.log(`[AssetTypeRegistry] Generated .fluxmesh with ${slots.length} material slot(s), ${savedTextureCache.size} texture(s) extracted`);
    } catch (err) {
      console.warn('[AssetTypeRegistry] .fluxmesh generation failed, model imported without mesh data:', err);
    }

    // Write updated meta back
    const metaPath = importedPath + '.fluxmeta';
    await _fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  },
});

AssetTypeRegistry.register({
  type: 'mesh',
  displayName: 'Flux Mesh',
  icon: 'model',
  extensions: ['.fluxmesh'],
  category: 'Models',
  color: '#66bb6a',
  loader: async (fs, path) => {
    const text = await fs.readFile(path);
    return JSON.parse(text) as FluxMeshData;
  },
  serializable: false,
});

AssetTypeRegistry.register({
  type: 'animation',
  displayName: 'Animation Clip',
  icon: 'model',
  extensions: ['.fluxanim'],
  category: 'Animations',
  color: '#ffcc80',
  loader: async (fs, path) => {
    const text = await fs.readFile(path);
    return JSON.parse(text);
  },
  serializable: false,
});

AssetTypeRegistry.register({
  type: 'audio',
  displayName: 'Audio',
  icon: 'audio',
  extensions: ['.ogg', '.mp3', '.wav', '.flac'],
  category: 'Audio',
  color: '#ffb74d',
  canImport: true,
  importFilters: [{ name: 'Audio Files', extensions: ['ogg', 'mp3', 'wav', 'flac'] }],
});

AssetTypeRegistry.register({
  type: 'font',
  displayName: 'Font',
  icon: 'text',
  extensions: ['.ttf', '.otf', '.woff', '.woff2'],
  category: 'Fonts',
  color: '#ce93d8',
  canImport: true,
  importFilters: [{ name: 'Font Files', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
});

AssetTypeRegistry.register({
  type: 'scene',
  displayName: 'Scene',
  icon: 'scene',
  extensions: ['.fluxscene'],
  category: 'Scenes',
  color: '#ba68c8',
  createDefault: async (fs, dirPath, name) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${dirPath}/${safeName}.fluxscene`;
    const emptyScene = JSON.stringify(
      { name: safeName, entities: [], editorCamera: null },
      null,
      2,
    );
    await fs.writeFile(filePath, emptyScene);
    return filePath;
  },
  serializable: false,
});

/** Replace \$CLS placeholder with the real class name. */
function tmpl(raw: string, cls: string): string {
  return raw.replace(/\$CLS/g, cls);
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'empty',
    name: 'Empty Script',
    description: 'Minimal class with no lifecycle methods',
    icon: 'file',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? emptyJs : emptyTs, cls),
  },
  {
    id: 'default',
    name: 'Default Script',
    description: 'Basic template with onStart, onUpdate and onDestroy',
    icon: 'zap',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? defaultJs : defaultTs, cls),
  },
  {
    id: 'movement',
    name: 'Movement Controller',
    description: 'WASD movement using Transform',
    icon: 'move',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? movementJs : movementTs, cls),
  },
  {
    id: 'rotator',
    name: 'Rotator',
    description: 'Continuously rotates an object',
    icon: 'rotate',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? rotatorJs : rotatorTs, cls),
  },
  {
    id: 'camera-follow',
    name: 'Camera Follow',
    description: 'Smoothly follows a target entity by name',
    icon: 'camera',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? camFollowJs : camFollowTs, cls),
  },
  {
    id: 'physics-object',
    name: 'Physics Object',
    description: 'Applies forces via the Physics API on input',
    icon: 'physics',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? physObjJs : physObjTs, cls),
  },
  {
    id: 'debug-hud',
    name: 'Debug HUD',
    description: 'Screen-space debug overlay: FPS, position, custom text via Debug.drawText',
    icon: 'search',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? dbgHudJs : dbgHudTs, cls),
  },
  {
    id: 'coroutine',
    name: 'Coroutine Example',
    description: 'Generator-based coroutines',
    icon: 'clock',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? coroutineJs : coroutineTs, cls),
  },
  {
    id: 'fui-hud-file',
    name: 'FUI HUD (file)',
    description: 'Loads a .fui file and updates labels each frame',
    icon: 'monitor',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? fuiFileJs : fuiFileTs, cls),
  },
  {
    id: 'fui-hud-code',
    name: 'FUI HUD (code)',
    description: 'Builds a HUD entirely in code using FuiBuilder',
    icon: 'code',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? fuiCodeJs : fuiCodeTs, cls),
  },
  {
    id: 'render-to-texture',
    name: 'Render To Texture',
    description: 'Projects a camera\'s render output onto a mesh. Assign cameraEntity and targetEntity in the Inspector.',
    icon: 'camera',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? rttJs : rttTs, cls),
  },
  {
    id: 'fps-character',
    name: 'FPS Character Controller',
    description: 'First-person character: WASD to move, Space to jump, Shift to run, click to capture mouse. Assign a Camera entity in the Inspector.',
    icon: 'target',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? fpsCharJs : fpsCharTs, cls),
  },
  {
    id: 'flying-camera',
    name: 'Flying Camera',
    description: 'Free-fly camera: WASD + QE to move, right-click to look',
    icon: 'globe',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? flyingCamJs : flyingCamTs, cls),
  },
  {
    id: 'scene-loader',
    name: 'Scene Loader',
    description: 'Loads the scene assigned in the Inspector when a configurable key is pressed',
    icon: 'scene',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? sceneLoaderJs : sceneLoaderTs, cls),
  },
  {
    id: 'interact-controller',
    name: 'Interact Controller',
    description: 'Left-click to raycast from the camera and emit an interact event on the hit entity',
    icon: 'target',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? interactCtrlJs : interactCtrlTs, cls),
  },
  {
    id: 'interactable',
    name: 'Interactable',
    description: 'Reacts to the interact event fired by an Interact Controller',
    icon: 'zap',
    languages: ['ts', 'js'],
    generate: (cls, lang) => tmpl(lang === 'js' ? interactableJs : interactableTs, cls),
  },
];

AssetTypeRegistry.register({
  type: 'script',
  displayName: 'Script',
  icon: 'script',
  extensions: ['.ts', '.js'],
  category: 'Scripts',
  color: '#7986cb',
  serializable: false,
  templates: SCRIPT_TEMPLATES,
  createDefault: async (fs, dirPath, name, templateId, lang = 'ts') => {
    const className = name.replace(/[^a-zA-Z0-9_$]/g, '_');
    const template = SCRIPT_TEMPLATES.find((t) => t.id === templateId) ?? SCRIPT_TEMPLATES[1];
    const content = template.generate(className, lang);
    const filePath = `${dirPath}/${name}.${lang}`;
    await fs.writeFile(filePath, content);
    return filePath;
  },
});

AssetTypeRegistry.register({
  type: 'material',
  displayName: 'Material',
  icon: 'material',
  extensions: ['.mat', '.fluxmat'],
  category: 'Materials',
  color: '#f06292',
  loader: async (fs, path) => {
    const text = await fs.readFile(path);
    return JSON.parse(text);
  },
  createDefault: async (fs, dirPath, name) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${dirPath}/${safeName}.fluxmat`;
    const defaultMat = JSON.stringify(
      { type: 'standard', color: [1, 1, 1], roughness: 0.5, metalness: 0.0 },
      null,
      2,
    );
    await fs.writeFile(filePath, defaultMat);
    return filePath;
  },
  serializable: true,
});

AssetTypeRegistry.register({
  type: 'prefab',
  displayName: 'Prefab',
  icon: 'prefab',
  extensions: ['.fluxprefab'],
  category: 'Prefabs',
  color: '#4db6ac',
  serializable: true,
});

AssetTypeRegistry.register({
  type: 'shader',
  displayName: 'Shader',
  icon: 'shader',
  extensions: ['.glsl', '.vert', '.frag', '.wgsl'],
  category: 'Shaders',
  color: '#aed581',
});

AssetTypeRegistry.register({
  type: 'visual_material',
  displayName: 'Visual Material',
  icon: 'material',
  extensions: ['.fluxvismat'],
  category: 'Materials',
  color: '#e040fb',
  loader: async (fs, path) => {
    const text = await fs.readFile(path);
    return JSON.parse(text);
  },
  createDefault: async (fs, dirPath, name) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${dirPath}/${safeName}.fluxvismat`;
    const { createDefaultGraph } = await import('../materials/VisualMaterialGraph');
    const defaultFile = JSON.stringify(
      { version: 1, name: safeName, graph: createDefaultGraph() },
      null,
      2,
    );
    await fs.writeFile(filePath, defaultFile);
    return filePath;
  },
  serializable: true,
});

AssetTypeRegistry.register({
  type: 'json',
  displayName: 'JSON Data',
  icon: 'json',
  extensions: ['.json'],
  category: 'Data',
});

AssetTypeRegistry.register({
  type: 'font',
  displayName: 'Font',
  icon: 'font',
  extensions: ['.ttf', '.otf', '.woff', '.woff2'],
  category: 'UI',
  color: '#ce93d8',
  canImport: true,
  importFilters: [{ name: 'Font Files', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
});

AssetTypeRegistry.register({
  type: 'fui',
  displayName: 'UI (FUI)',
  icon: 'json',
  extensions: ['.fui'],
  category: 'UI',
  createDefault: async (fs, dirPath, name) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${dirPath}/${safeName}.fui`;
    const defaultFui = JSON.stringify(
      {
        version: 1,
        mode: 'screen',
        canvas: { width: 800, height: 600 },
        root: {
          id: 'root',
          type: 'panel',
          rect: { x: 0, y: 0, w: 800, h: 600 },
          style: { backgroundColor: '#0b1020' },
          children: [
            {
              id: 'title',
              type: 'label',
              rect: { x: 20, y: 20, w: 760, h: 60 },
              text: 'Hello FUI',
              style: { color: '#ffffff', fontSize: 36, align: 'center' },
            },
            {
              id: 'btn1',
              type: 'button',
              rect: { x: 300, y: 140, w: 200, h: 60 },
              text: 'Click Me',
              style: {
                backgroundColor: '#2b3a67',
                borderColor: '#6b8cff',
                borderWidth: 2,
                radius: 10,
                textColor: '#ffffff',
                fontSize: 24,
                align: 'center',
                padding: 8,
              },
            },
          ],
        },
      },
      null,
      2,
    );
    await fs.writeFile(filePath, defaultFui);
    return filePath;
  },
});
