// ============================================================
// FluxionJS V3 — Project Manager
// Nuake-style project create/open/save with disk persistence.
// Uses IFileSystem abstraction instead of direct fluxionAPI calls.
// ============================================================

import {
  getFileSystem,
  pathJoin,
  pathDirname,
} from '../filesystem';
import { ShaderCache } from '../materials/ShaderCache';
import { ShaderCompileService } from '../renderer/ShaderCompileService';

declare global {
  interface Window {
    fluxionAPI?: Record<string, any>;
  }
}

// ── Project Configuration (stored in .fluxproj) ──

export interface ProjectPhysicsSettings {
  gravity: [number, number, number];
  fixedTimestep: number;
}

export interface ProjectRenderSettings {
  shadows: boolean;
  shadowMapSize: number;
  toneMapping: string;
  exposure: number;
}

export interface ProjectEditorSettings {
  snapTranslation: number;
  snapRotation: number;
  snapScale: number;
  showGrid: boolean;
}

export interface ProjectSettings {
  physics: ProjectPhysicsSettings;
  rendering: ProjectRenderSettings;
  editor: ProjectEditorSettings;
}

export interface ProjectConfig {
  name: string;
  version: string;
  engine: string;
  schema: number;
  defaultScene: string;
  settings: ProjectSettings;
}

export interface RecentProject {
  name: string;
  path: string;
  lastOpened: string;
}

// ── Default values ──

const DEFAULT_SETTINGS: ProjectSettings = {
  physics: { gravity: [0, -9.81, 0], fixedTimestep: 1 / 60 },
  rendering: { shadows: true, shadowMapSize: 2048, toneMapping: 'ACES', exposure: 1.2 },
  editor: { snapTranslation: 1, snapRotation: 15, snapScale: 0.25, showGrid: true },
};

function defaultProjectConfig(name: string): ProjectConfig {
  return {
    name,
    version: '1.0.0',
    engine: 'FluxionJS V2',
    schema: 1,
    defaultScene: 'Scenes/Main.fluxscene',
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  };
}

// ── Project Manager ──

export class ProjectManager {
  private _config: ProjectConfig | null = null;
  private _projectDir: string | null = null;
  private _projectFilePath: string | null = null;
  private _isDirty = false;

  get config(): ProjectConfig | null { return this._config; }
  get projectDir(): string | null { return this._projectDir; }
  get projectFilePath(): string | null { return this._projectFilePath; }
  get isDirty(): boolean { return this._isDirty; }
  get isLoaded(): boolean { return this._config !== null; }

  markDirty(): void { this._isDirty = true; }

  /** Create a new project in the given directory */
  async createProject(name: string, directory: string): Promise<ProjectConfig> {
    const fs = getFileSystem();

    const projectDir = pathJoin(directory, name);
    const projectFile = pathJoin(projectDir, `${name}.fluxproj`);

    // Create directory structure
    await fs.mkdir(projectDir);
    await fs.mkdir(pathJoin(projectDir, 'Scenes'));
    await fs.mkdir(pathJoin(projectDir, 'Assets'));
    await fs.mkdir(pathJoin(projectDir, 'Assets/Models'));
    await fs.mkdir(pathJoin(projectDir, 'Assets/Textures'));
    await fs.mkdir(pathJoin(projectDir, 'Assets/Materials'));
    await fs.mkdir(pathJoin(projectDir, 'Assets/Audio'));
    await fs.mkdir(pathJoin(projectDir, 'Assets/Scripts'));
    await fs.mkdir(pathJoin(projectDir, 'Prefabs'));

    // Create example script
    const exampleScript = [
      `export default class ExampleScript extends FluxionBehaviour {`,
      `  // speed = 5.0;`,
      ``,
      `  start() {`,
      `    this.log('ExampleScript started on entity', this.entity);`,
      `  }`,
      ``,
      `  update(dt) {`,
      `    // Called every frame.`,
      `  }`,
      `}`,
      ``,
    ].join('\n');
    await fs.writeFile(pathJoin(projectDir, 'Assets/Scripts/ExampleScript.ts'), exampleScript);
    await fs.mkdir(pathJoin(projectDir, '.fluxion'));

    // Create project config
    const config = defaultProjectConfig(name);
    await fs.writeFile(projectFile, JSON.stringify(config, null, 2));

    // Create default scene file
    const defaultScene = {
      name: 'Main Scene',
      version: 1,
      settings: {
        ambientColor: [0.27, 0.27, 0.35],
        ambientIntensity: 0.5,
        fogEnabled: true,
        fogColor: [0.04, 0.055, 0.09],
        fogDensity: 0.008,
        backgroundColor: [0.04, 0.055, 0.09],
        skybox: null,
        physicsGravity: [0, -9.81, 0],
      },
      editorCamera: {
        position: [15, 12, 15],
        target: [0, 0, 0],
        fov: 60,
      },
      entities: [
        {
          id: 1,
          name: 'Ambient Light',
          parent: null,
          tags: [],
          components: [
            { type: 'Transform', data: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
            { type: 'Light', data: { lightType: 'ambient', color: [0.27, 0.27, 0.42], intensity: 0.4, range: 10, castShadow: false } },
          ],
        },
        {
          id: 2,
          name: 'Directional Light',
          parent: null,
          tags: [],
          components: [
            { type: 'Transform', data: { position: [30, 40, 20], rotation: [0, 0, 0], scale: [1, 1, 1] } },
            { type: 'Light', data: { lightType: 'directional', color: [1, 0.93, 0.87], intensity: 2.5, range: 10, castShadow: true, shadowMapSize: 4096 } },
          ],
        },
        {
          id: 3,
          name: 'Ground',
          parent: null,
          tags: [],
          components: [
            { type: 'Transform', data: { position: [0, -0.25, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
            { type: 'MeshRenderer', data: { primitiveType: 'cube', geometry: { width: 50, height: 0.5, depth: 50 }, material: { color: [0.3, 0.3, 0.3], roughness: 0.9, metalness: 0.0 } } },
          ],
        },
        {
          id: 4,
          name: 'Cube',
          parent: null,
          tags: [],
          components: [
            { type: 'Transform', data: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
            { type: 'MeshRenderer', data: { primitiveType: 'cube', geometry: { width: 1, height: 1, depth: 1 }, material: { color: [0.53, 0.6, 0.67], roughness: 0.4, metalness: 0.6 } } },
          ],
        },
      ],
    };
    const scenePath = pathJoin(projectDir, 'Scenes', 'Main.fluxscene');
    await fs.writeFile(scenePath, JSON.stringify(defaultScene, null, 2));

    // Create .fluxion/editor.json
    const editorConfig = { windowState: {}, recentScenes: ['Scenes/Main.fluxscene'] };
    await fs.writeFile(pathJoin(projectDir, '.fluxion', 'editor.json'), JSON.stringify(editorConfig, null, 2));

    // Set current project
    this._config = config;
    this._projectDir = projectDir;
    this._projectFilePath = projectFile;
    this._isDirty = false;

    // Add to recent projects
    await this.addToRecent(config.name, projectFile);

    return config;
  }

  /** Open an existing project from a .fluxproj file */
  async openProject(projectFilePath: string): Promise<ProjectConfig> {
    const fs = getFileSystem();

    const content = await fs.readFile(projectFilePath);
    const config = JSON.parse(content) as ProjectConfig;

    this._config = config;
    this._projectDir = pathDirname(projectFilePath);
    this._projectFilePath = projectFilePath;
    this._isDirty = false;

    await this.addToRecent(config.name, projectFilePath);

    // Init shader cache for this project and kick off background precompile
    await ShaderCache.init(fs, this._projectDir);
    ShaderCompileService.precompileVisualMaterials(this._projectDir).catch(() => {});

    return config;
  }

  /** Save the current project config */
  async saveProject(): Promise<void> {
    if (!this._config || !this._projectFilePath) return;
    const fs = getFileSystem();

    await fs.writeFile(this._projectFilePath, JSON.stringify(this._config, null, 2));
    this._isDirty = false;
  }

  /** Close the current project */
  closeProject(): void {
    ShaderCache.close();
    this._config = null;
    this._projectDir = null;
    this._projectFilePath = null;
    this._isDirty = false;
  }

  /** Resolve a project-relative path to absolute */
  resolvePath(relativePath: string): string {
    if (!this._projectDir) throw new Error('No project loaded');
    return pathJoin(this._projectDir, relativePath);
  }

  /** Convert an absolute path to project-relative */
  relativePath(absolutePath: string): string {
    if (!this._projectDir) return absolutePath;
    const normalized = absolutePath.replace(/\\/g, '/');
    const dir = this._projectDir.replace(/\\/g, '/');
    if (normalized.startsWith(dir)) {
      return normalized.substring(dir.length + 1);
    }
    return absolutePath;
  }

  // ── Recent Projects ──

  private async getRecentFilePath(): Promise<string> {
    const fs = getFileSystem();
    const appData = await fs.getAppDataPath();
    const dir = pathJoin(appData, 'FluxionJS');
    const exists = await fs.exists(dir);
    if (!exists) await fs.mkdir(dir);
    return pathJoin(dir, 'recent-projects.json');
  }

  async getRecentProjects(): Promise<RecentProject[]> {
    try {
      const fs = getFileSystem();
      const filePath = await this.getRecentFilePath();
      const exists = await fs.exists(filePath);
      if (!exists) return [];
      const content = await fs.readFile(filePath);
      const data = JSON.parse(content);
      return data.recentProjects || [];
    } catch {
      return [];
    }
  }

  async addToRecent(name: string, path: string): Promise<void> {
    const fs = getFileSystem();
    const recents = await this.getRecentProjects();
    const filtered = recents.filter(r => r.path !== path);
    filtered.unshift({ name, path, lastOpened: new Date().toISOString() });
    // Keep last 10
    const trimmed = filtered.slice(0, 10);

    const filePath = await this.getRecentFilePath();
    await fs.writeFile(filePath, JSON.stringify({ recentProjects: trimmed }, null, 2));
  }

  async removeFromRecent(path: string): Promise<void> {
    const fs = getFileSystem();
    const recents = await this.getRecentProjects();
    const filtered = recents.filter(r => r.path !== path);
    const filePath = await this.getRecentFilePath();
    await fs.writeFile(filePath, JSON.stringify({ recentProjects: filtered }, null, 2));
  }
}

// Singleton
export const projectManager = new ProjectManager();
