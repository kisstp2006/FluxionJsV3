// ============================================================
// FluxionJS V2 — Project Manager
// Nuake-style project create/open/save with disk persistence
// ============================================================

declare global {
  interface Window {
    fluxionAPI?: {
      openFileDialog: (filters?: any) => Promise<string | null>;
      saveFileDialog: (filters?: any) => Promise<string | null>;
      openDirDialog: () => Promise<string | null>;
      readFile: (path: string) => Promise<string>;
      writeFile: (path: string, data: string) => Promise<boolean>;
      listDir: (path: string) => Promise<any[]>;
      readDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>;
      mkdir: (path: string) => Promise<boolean>;
      exists: (path: string) => Promise<boolean>;
      deleteFile: (path: string) => Promise<boolean>;
      getAppDataPath: () => Promise<string>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
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

// ── Path utilities ──

function pathJoin(...parts: string[]): string {
  return parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
}

function pathDirname(p: string): string {
  const normalized = p.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.substring(0, idx) : '.';
}

function pathBasename(p: string, ext?: string): string {
  const normalized = p.replace(/\\/g, '/');
  let base = normalized.substring(normalized.lastIndexOf('/') + 1);
  if (ext && base.endsWith(ext)) {
    base = base.substring(0, base.length - ext.length);
  }
  return base;
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
    const api = window.fluxionAPI;
    if (!api) throw new Error('fluxionAPI not available');

    const projectDir = pathJoin(directory, name);
    const projectFile = pathJoin(projectDir, `${name}.fluxproj`);

    // Create directory structure
    await api.mkdir(projectDir);
    await api.mkdir(pathJoin(projectDir, 'Scenes'));
    await api.mkdir(pathJoin(projectDir, 'Assets'));
    await api.mkdir(pathJoin(projectDir, 'Assets/Models'));
    await api.mkdir(pathJoin(projectDir, 'Assets/Textures'));
    await api.mkdir(pathJoin(projectDir, 'Assets/Materials'));
    await api.mkdir(pathJoin(projectDir, 'Assets/Audio'));
    await api.mkdir(pathJoin(projectDir, 'Assets/Scripts'));
    await api.mkdir(pathJoin(projectDir, 'Prefabs'));
    await api.mkdir(pathJoin(projectDir, '.fluxion'));

    // Create project config
    const config = defaultProjectConfig(name);
    await api.writeFile(projectFile, JSON.stringify(config, null, 2));

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
    await api.writeFile(scenePath, JSON.stringify(defaultScene, null, 2));

    // Create .fluxion/editor.json
    const editorConfig = { windowState: {}, recentScenes: ['Scenes/Main.fluxscene'] };
    await api.writeFile(pathJoin(projectDir, '.fluxion', 'editor.json'), JSON.stringify(editorConfig, null, 2));

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
    const api = window.fluxionAPI;
    if (!api) throw new Error('fluxionAPI not available');

    const content = await api.readFile(projectFilePath);
    const config = JSON.parse(content) as ProjectConfig;

    this._config = config;
    this._projectDir = pathDirname(projectFilePath);
    this._projectFilePath = projectFilePath;
    this._isDirty = false;

    await this.addToRecent(config.name, projectFilePath);

    return config;
  }

  /** Save the current project config */
  async saveProject(): Promise<void> {
    if (!this._config || !this._projectFilePath) return;
    const api = window.fluxionAPI;
    if (!api) return;

    await api.writeFile(this._projectFilePath, JSON.stringify(this._config, null, 2));
    this._isDirty = false;
  }

  /** Close the current project */
  closeProject(): void {
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
    const api = window.fluxionAPI!;
    const appData = await api.getAppDataPath();
    const dir = pathJoin(appData, 'FluxionJS');
    const exists = await api.exists(dir);
    if (!exists) await api.mkdir(dir);
    return pathJoin(dir, 'recent-projects.json');
  }

  async getRecentProjects(): Promise<RecentProject[]> {
    const api = window.fluxionAPI;
    if (!api) return [];

    try {
      const filePath = await this.getRecentFilePath();
      const exists = await api.exists(filePath);
      if (!exists) return [];
      const content = await api.readFile(filePath);
      const data = JSON.parse(content);
      return data.recentProjects || [];
    } catch {
      return [];
    }
  }

  async addToRecent(name: string, path: string): Promise<void> {
    const api = window.fluxionAPI;
    if (!api) return;

    const recents = await this.getRecentProjects();
    const filtered = recents.filter(r => r.path !== path);
    filtered.unshift({ name, path, lastOpened: new Date().toISOString() });
    // Keep last 10
    const trimmed = filtered.slice(0, 10);

    const filePath = await this.getRecentFilePath();
    await api.writeFile(filePath, JSON.stringify({ recentProjects: trimmed }, null, 2));
  }

  async removeFromRecent(path: string): Promise<void> {
    const api = window.fluxionAPI;
    if (!api) return;

    const recents = await this.getRecentProjects();
    const filtered = recents.filter(r => r.path !== path);
    const filePath = await this.getRecentFilePath();
    await api.writeFile(filePath, JSON.stringify({ recentProjects: filtered }, null, 2));
  }
}

// Singleton
export const projectManager = new ProjectManager();
