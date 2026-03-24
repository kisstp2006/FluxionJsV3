// ============================================================
// FluxionJS V3 — Asset Type Registry
// Pluggable file type system — ext→type→loader→icon→inspector.
// Inspired by Stride IAssetImporter and ezEngine DocumentManager.
// ============================================================

import type { IFileSystem } from '../filesystem/FileSystem';
import type { AssetMeta } from './AssetMeta';

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
  extensions: ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg', '.gif'],
  category: 'Textures',
  color: '#4fc3f7',
  canImport: true,
  importFilters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'gif'] }],
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
    // Enrich metadata with model-specific info
    const ext = importedPath.substring(importedPath.lastIndexOf('.')).toLowerCase();
    meta.importSettings = {
      ...meta.importSettings,
      format: ext === '.glb' ? 'glb' : ext === '.gltf' ? 'gltf' : ext === '.fbx' ? 'fbx' : 'obj',
    };
    // Write updated meta back
    const metaPath = importedPath + '.fluxmeta';
    await _fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  },
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
