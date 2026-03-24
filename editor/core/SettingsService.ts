// ============================================================
// FluxionJS V3 — Settings Service
// Handles persistence of settings to disk (.fluxion/settings.json)
// Debounced auto-save on every change, load on startup.
// ============================================================

import { SettingsRegistry } from './SettingsRegistry';
import { getFileSystem } from '../../src/filesystem';
import { pathJoin } from '../../src/filesystem/FileSystem';

const SETTINGS_DIR = '.fluxion';
const SETTINGS_FILE = 'settings.json';

class SettingsServiceImpl {
  private _projectRoot: string | null = null;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _loaded = false;

  /** Initialize persistence for the current project. Call after project opens. */
  async init(projectRoot: string): Promise<void> {
    this._projectRoot = projectRoot;
    this._loaded = false;

    // Load saved settings from disk
    await this._load();

    // Auto-save on every change (debounced)
    this._unsubscribe?.();
    this._unsubscribe = SettingsRegistry.on((event) => {
      if (event.type === 'changed' || event.type === 'reset') {
        this._scheduleSave();
      }
    });
  }

  /** Tear down persistence (e.g. on project close). */
  dispose(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._projectRoot = null;
    this._loaded = false;
  }

  /** Force an immediate save. */
  async save(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    await this._save();
  }

  get isLoaded(): boolean {
    return this._loaded;
  }

  // ── Internal ──

  private _getSettingsPath(): string | null {
    if (!this._projectRoot) return null;
    return pathJoin(this._projectRoot, SETTINGS_DIR, SETTINGS_FILE);
  }

  private async _load(): Promise<void> {
    const settingsPath = this._getSettingsPath();
    if (!settingsPath) return;

    const fs = getFileSystem();

    try {
      // Ensure .fluxion directory exists
      const dirPath = pathJoin(this._projectRoot!, SETTINGS_DIR);
      const dirExists = await fs.exists(dirPath);
      if (!dirExists) {
        await fs.mkdir(dirPath);
      }

      const fileExists = await fs.exists(settingsPath);
      if (!fileExists) {
        this._loaded = true;
        return; // No settings file yet — use defaults
      }

      const content = await fs.readFile(settingsPath);
      const data = JSON.parse(content);

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        SettingsRegistry.importValues(data);
      }

      this._loaded = true;
    } catch (err) {
      console.error('[SettingsService] Failed to load settings:', err);
      this._loaded = true; // Continue with defaults
    }
  }

  private async _save(): Promise<void> {
    const settingsPath = this._getSettingsPath();
    if (!settingsPath) return;

    const fs = getFileSystem();

    try {
      const dirPath = pathJoin(this._projectRoot!, SETTINGS_DIR);
      const dirExists = await fs.exists(dirPath);
      if (!dirExists) {
        await fs.mkdir(dirPath);
      }

      const data = SettingsRegistry.exportValues();
      await fs.writeFile(settingsPath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[SettingsService] Failed to save settings:', err);
    }
  }

  private _scheduleSave(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._save();
    }, 500); // 500ms debounce
  }
}

/** Global settings service singleton. */
export const SettingsService = new SettingsServiceImpl();
