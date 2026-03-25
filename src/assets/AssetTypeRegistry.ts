// ============================================================
// FluxionJS V3 — Asset Type Registry
// Pluggable file type system — ext→type→loader→icon→inspector.
// Inspired by Stride IAssetImporter and ezEngine DocumentManager.
// ============================================================

import type { IFileSystem } from '../filesystem/FileSystem';
import type { AssetMeta } from './AssetMeta';
import type { FluxMeshData, FluxMeshMaterialSlot, FluxMeshSubMeshRef } from './FluxMeshData';

// ── Types ──

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
  createDefault?: (fs: IFileSystem, dirPath: string, name: string) => Promise<string>;
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
  extensions: ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg', '.gif', '.tga'],
  category: 'Textures',
  color: '#4fc3f7',
  canImport: true,
  importFilters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'gif', 'tga'] }],
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
      const fileUrl = `file:///${importedPath.replace(/\\/g, '/')}`;
      let root: InstanceType<typeof THREEModule.Object3D>;
      if (format === 'fbx') {
        root = await new Promise<InstanceType<typeof THREEModule.Group>>((res, rej) => new FBXLoader().load(fileUrl, res, undefined, rej));
      } else if (format === 'obj') {
        root = await new Promise<InstanceType<typeof THREEModule.Group>>((res, rej) => new OBJLoader().load(fileUrl, res, undefined, rej));
      } else {
        const gltf = await new Promise<any>((res, rej) => new GLTFLoader().load(fileUrl, res, undefined, rej));
        root = gltf.scene;
      }

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
      const fluxmeshData: FluxMeshData = { version: 1, sourceModel: modelFileName, materialSlots: slots };
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

AssetTypeRegistry.register({
  type: 'script',
  displayName: 'Script',
  icon: 'script',
  extensions: ['.ts', '.js'],
  category: 'Scripts',
  color: '#7986cb',
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
  type: 'json',
  displayName: 'JSON Data',
  icon: 'json',
  extensions: ['.json'],
  category: 'Data',
});
