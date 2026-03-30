// ============================================================
// FluxionJS V3 — Npm Project Service
// Manages per-project package.json, plugin discovery, and
// proxies npm commands through the Electron IPC layer.
// ============================================================

import { getFileSystem, pathJoin } from '../filesystem';

// ── Plugin manifest ──────────────────────────────────────────

export interface FluxionPlugin {
  /** npm package name */
  name: string;
  /** Resolved absolute path to the plugin's main entry file */
  mainPath: string;
  /** Human-readable display name (from package.json "fluxionPlugin.displayName" or name) */
  displayName: string;
  /** Plugin version */
  version: string;
}

// ── Project package.json shape (minimal) ────────────────────

export interface ProjectPackageJson {
  name: string;
  version: string;
  private: boolean;
  fluxion?: { engine?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// ── NpmProjectService ────────────────────────────────────────

export class NpmProjectService {
  /**
   * Ensure the project directory has a valid package.json.
   * Creates one with sensible defaults if absent.
   */
  async ensurePackageJson(projectDir: string, projectName: string): Promise<void> {
    const fs = getFileSystem();
    const pkgPath = pathJoin(projectDir, 'package.json');
    const exists = await fs.exists(pkgPath);
    if (exists) return;

    const pkg: ProjectPackageJson = {
      name: this._slugify(projectName),
      version: '1.0.0',
      private: true,
      fluxion: { engine: 'fluxionjs-v3' },
      dependencies: {},
    };
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  }

  /**
   * Read and return the project's package.json, or null if missing.
   */
  async readPackageJson(projectDir: string): Promise<ProjectPackageJson | null> {
    const fs = getFileSystem();
    const pkgPath = pathJoin(projectDir, 'package.json');
    if (!(await fs.exists(pkgPath))) return null;
    try {
      const content = await fs.readFile(pkgPath);
      return JSON.parse(content) as ProjectPackageJson;
    } catch {
      return null;
    }
  }

  /**
   * Scan the project's node_modules for Fluxion plugins.
   * A package is a plugin if:
   *  - Its name matches `fluxion-plugin-*`, OR
   *  - Its package.json contains `"fluxionPlugin": true`
   */
  async discoverPlugins(projectDir: string): Promise<FluxionPlugin[]> {
    const fs = getFileSystem();
    const nmDir = pathJoin(projectDir, 'node_modules');
    if (!(await fs.exists(nmDir))) return [];

    const plugins: FluxionPlugin[] = [];

    let entries;
    try {
      entries = await fs.readDir(nmDir);
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory) continue;

      // Handle scoped packages (@org/pkg)
      const pkgDirs: string[] = [];
      if (entry.name.startsWith('@')) {
        try {
          const scopedEntries = await fs.readDir(entry.path);
          for (const se of scopedEntries) {
            if (se.isDirectory) pkgDirs.push(se.path);
          }
        } catch { continue; }
      } else {
        pkgDirs.push(entry.path);
      }

      for (const pkgDir of pkgDirs) {
        const pkgJsonPath = pathJoin(pkgDir, 'package.json');
        if (!(await fs.exists(pkgJsonPath))) continue;

        try {
          const raw = await fs.readFile(pkgJsonPath);
          const meta = JSON.parse(raw) as any;
          const name: string = meta.name ?? '';

          const isPlugin =
            name.startsWith('fluxion-plugin-') ||
            name.includes('/fluxion-plugin-') ||
            meta.fluxionPlugin === true ||
            meta.fluxionPlugin?.plugin === true;

          if (!isPlugin) continue;

          const mainFile = meta.main ?? 'index.js';
          plugins.push({
            name,
            mainPath: pathJoin(pkgDir, mainFile),
            displayName: meta.fluxionPlugin?.displayName ?? name,
            version: meta.version ?? '0.0.0',
          });
        } catch { continue; }
      }
    }

    return plugins;
  }

  /**
   * Check whether node_modules exists for the project.
   */
  async hasNodeModules(projectDir: string): Promise<boolean> {
    const fs = getFileSystem();
    return fs.exists(pathJoin(projectDir, 'node_modules'));
  }

  // ── Helpers ─────────────────────────────────────────────────

  private _slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'my-game';
  }
}

export const npmProjectService = new NpmProjectService();
