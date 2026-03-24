// ============================================================
// FluxionJS V3 — Project Settings Service
// Persistence for project settings stored in .fluxproj file.
// Reads/writes the `projectSettings` key inside the project config.
// ============================================================

import { ProjectSettingsRegistry } from './ProjectSettingsRegistry';
import { projectManager } from '../../src/project/ProjectManager';
import { getFileSystem } from '../../src/filesystem';

class ProjectSettingsServiceImpl {
  private _unsubscribe: (() => void) | null = null;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _loaded = false;

  /** Initialize: load project settings from .fluxproj. Call after project opens. */
  async init(): Promise<void> {
    this._loaded = false;
    await this._load();

    // Auto-save on every change (debounced)
    this._unsubscribe?.();
    this._unsubscribe = ProjectSettingsRegistry.on((event) => {
      if (event.type === 'changed' || event.type === 'reset') {
        this._scheduleSave();
      }
    });
  }

  /** Tear down persistence. */
  dispose(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._loaded = false;
  }

  /** Force immediate save. */
  async save(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    await this._save();
  }

  get isLoaded(): boolean { return this._loaded; }

  // ── Internal ──

  private async _load(): Promise<void> {
    const config = projectManager.config;
    if (!config) { this._loaded = true; return; }

    // Read projectSettings from config if present
    const ps = (config as any).projectSettings;
    if (ps && typeof ps === 'object' && !Array.isArray(ps)) {
      ProjectSettingsRegistry.importValues(ps);
    }

    this._loaded = true;
  }

  private async _save(): Promise<void> {
    const config = projectManager.config;
    const filePath = projectManager.projectFilePath;
    if (!config || !filePath) return;

    try {
      // Merge projectSettings into config and write
      (config as any).projectSettings = ProjectSettingsRegistry.exportValues();
      const fs = getFileSystem();
      await fs.writeFile(filePath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error('[ProjectSettingsService] Failed to save:', err);
    }
  }

  private _scheduleSave(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._save();
    }, 500);
  }
}

/** Global project settings service singleton. */
export const ProjectSettingsService = new ProjectSettingsServiceImpl();
