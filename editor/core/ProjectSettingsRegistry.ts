// ============================================================
// FluxionJS V3 — Project Settings Registry
// Separate registry for per-project settings stored in .fluxproj.
// Mirrors the SettingsRegistry API but scoped to project data.
// ============================================================

import {
  SettingDescriptor,
  SettingType,
  CategoryInfo,
} from './SettingsRegistry';

// Re-export used types
export type { SettingDescriptor, SettingType, CategoryInfo };

// ── Event Types ──

export type ProjectSettingsEventType = 'registered' | 'changed' | 'reset' | 'loaded';

export interface ProjectSettingsEvent {
  type: ProjectSettingsEventType;
  key: string;
  value: unknown;
  previousValue?: unknown;
}

export type ProjectSettingsListener = (event: ProjectSettingsEvent) => void;

// ── Registry ──

class ProjectSettingsRegistryImpl {
  private _settings = new Map<string, SettingDescriptor>();
  private _values = new Map<string, unknown>();
  private _categories = new Map<string, CategoryInfo>();
  private _listeners: ProjectSettingsListener[] = [];
  private _restartSnapshots = new Map<string, unknown>();
  private _pendingRestart = new Set<string>();

  // ── Registration ──

  register<T>(descriptor: SettingDescriptor<T>): void {
    if (this._settings.has(descriptor.key)) {
      console.warn(`[ProjectSettingsRegistry] Setting "${descriptor.key}" already registered, overwriting.`);
    }
    this._settings.set(descriptor.key, descriptor as SettingDescriptor);
    if (!this._values.has(descriptor.key)) {
      this._values.set(descriptor.key, descriptor.defaultValue);
    }
    this._emit({ type: 'registered', key: descriptor.key, value: this.get(descriptor.key) });
  }

  registerMany(descriptors: SettingDescriptor[]): void {
    for (const d of descriptors) this.register(d);
  }

  registerCategory(name: string, info: CategoryInfo): void {
    this._categories.set(name, info);
  }

  // ── Value Access ──

  get<T = unknown>(key: string): T {
    if (this._values.has(key)) return this._values.get(key) as T;
    const desc = this._settings.get(key);
    if (desc) return desc.defaultValue as T;
    return undefined as T;
  }

  set<T = unknown>(key: string, value: T): void {
    const desc = this._settings.get(key);
    const previous = this._values.get(key);
    this._values.set(key, value);
    if (desc?.onChange) {
      try { (desc.onChange as (v: unknown) => void)(value); } catch (e) {
        console.error(`[ProjectSettingsRegistry] onChange error for "${key}":`, e);
      }
    }
    // Track restart-required changes against startup snapshot
    if (desc?.requiresRestart && this._restartSnapshots.has(key)) {
      const snap = this._restartSnapshots.get(key);
      if (JSON.stringify(value) !== JSON.stringify(snap)) {
        this._pendingRestart.add(key);
      } else {
        this._pendingRestart.delete(key);
      }
    }
    this._emit({ type: 'changed', key, value, previousValue: previous });
  }

  resetToDefault(key: string): void {
    const desc = this._settings.get(key);
    if (!desc) return;
    this.set(key, desc.defaultValue);
    this._emit({ type: 'reset', key, value: desc.defaultValue });
  }

  resetAll(): void {
    for (const [, desc] of this._settings) this.set(desc.key, desc.defaultValue);
  }

  isModified(key: string): boolean {
    const desc = this._settings.get(key);
    if (!desc) return false;
    return JSON.stringify(this._values.get(key)) !== JSON.stringify(desc.defaultValue);
  }

  // ── Restart Tracking ──

  snapshotRestartValues(): void {
    this._pendingRestart.clear();
    for (const [key, desc] of this._settings) {
      if (desc.requiresRestart) {
        this._restartSnapshots.set(key, structuredClone(this._values.get(key)));
      }
    }
  }

  hasPendingRestart(): boolean {
    return this._pendingRestart.size > 0;
  }

  isRestartPending(key: string): boolean {
    return this._pendingRestart.has(key);
  }

  getPendingRestartKeys(): string[] {
    return Array.from(this._pendingRestart);
  }

  // ── Query ──

  getDescriptor(key: string): SettingDescriptor | undefined {
    return this._settings.get(key);
  }

  getAllKeys(): string[] {
    return Array.from(this._settings.keys());
  }

  getByCategory(): Map<string, SettingDescriptor[]> {
    const groups = new Map<string, SettingDescriptor[]>();
    for (const desc of this._settings.values()) {
      const cat = desc.category || 'General';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(desc);
    }
    for (const [, items] of groups) items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    return groups;
  }

  getCategoryNames(): string[] {
    const cats = new Set<string>();
    for (const desc of this._settings.values()) cats.add(desc.category || 'General');
    return Array.from(cats).sort((a, b) => {
      const infoA = this._categories.get(a);
      const infoB = this._categories.get(b);
      return (infoA?.order ?? 100) - (infoB?.order ?? 100);
    });
  }

  getCategoryInfo(name: string): CategoryInfo | undefined {
    return this._categories.get(name);
  }

  // ── Serialization ──

  /** Export all values (including defaults) for saving to .fluxproj. */
  exportValues(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const [key, value] of this._values) {
      if (this._settings.has(key)) data[key] = value;
    }
    return data;
  }

  /** Import values from a plain object (loaded from .fluxproj). */
  importValues(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      if (this._settings.has(key)) {
        this.set(key, value);
      } else {
        this._values.set(key, value);
      }
    }
    this._emit({ type: 'loaded', key: '*', value: data });
  }

  // ── Events ──

  on(listener: ProjectSettingsListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  private _emit(event: ProjectSettingsEvent): void {
    for (const fn of this._listeners) {
      try { fn(event); } catch (e) {
        console.error('[ProjectSettingsRegistry] Listener error:', e);
      }
    }
  }
}

/** Global project settings registry singleton. */
export const ProjectSettingsRegistry = new ProjectSettingsRegistryImpl();
