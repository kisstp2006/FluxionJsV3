// ============================================================
// FluxionJS V3 — Settings Registry
// Central registry where engine/editor modules register settings.
// Each setting has a key, default value, metadata, description,
// and auto-persistence via SettingsService.
// ============================================================

import React from 'react';

// ── Setting Types ──

export type SettingType = 'boolean' | 'number' | 'string' | 'select' | 'slider' | 'color';

export interface SettingDescriptor<T = unknown> {
  /** Unique dot-separated key, e.g. "renderer.shadows.enabled" */
  key: string;
  /** Human-readable label */
  label: string;
  /** Description shown on hover */
  description: string;
  /** The type of input widget to use */
  type: SettingType;
  /** Default (reset) value */
  defaultValue: T;
  /** Category path for grouping: "Renderer", "Editor/Viewport", etc. */
  category: string;
  /** Display order within category (lower = first) */
  order?: number;
  /** For 'select': available options */
  options?: Array<{ value: string; label: string }>;
  /** For 'number'/'slider': min value */
  min?: number;
  /** For 'number'/'slider': max value */
  max?: number;
  /** For 'number'/'slider': step */
  step?: number;
  /** Optional callback invoked when value changes */
  onChange?: (value: T) => void;
}

// ── Category Info ──

export interface CategoryInfo {
  /** Display name */
  label: string;
  /** Optional icon (React element or text) */
  icon?: React.ReactNode;
  /** Display order (lower = first) */
  order?: number;
}

// ── Event Types ──

export type SettingsEventType = 'registered' | 'changed' | 'reset' | 'loaded';

export interface SettingsEvent {
  type: SettingsEventType;
  key: string;
  value: unknown;
  previousValue?: unknown;
}

export type SettingsListener = (event: SettingsEvent) => void;

// ── Registry ──

class SettingsRegistryImpl {
  private _settings = new Map<string, SettingDescriptor>();
  private _values = new Map<string, unknown>();
  private _categories = new Map<string, CategoryInfo>();
  private _listeners: SettingsListener[] = [];

  // ── Registration ──

  /** Register a single setting. Normally called at module init time. */
  register<T>(descriptor: SettingDescriptor<T>): void {
    if (this._settings.has(descriptor.key)) {
      console.warn(`[SettingsRegistry] Setting "${descriptor.key}" already registered, overwriting.`);
    }
    this._settings.set(descriptor.key, descriptor as SettingDescriptor);
    // Only set value if not already loaded from persistence
    if (!this._values.has(descriptor.key)) {
      this._values.set(descriptor.key, descriptor.defaultValue);
    }
    this._emit({ type: 'registered', key: descriptor.key, value: this.get(descriptor.key) });
  }

  /** Register multiple settings at once. */
  registerMany(descriptors: SettingDescriptor[]): void {
    for (const d of descriptors) {
      this.register(d);
    }
  }

  /** Register a category with display metadata. */
  registerCategory(name: string, info: CategoryInfo): void {
    this._categories.set(name, info);
  }

  // ── Value Access ──

  /** Get the current value of a setting. */
  get<T = unknown>(key: string): T {
    if (this._values.has(key)) {
      return this._values.get(key) as T;
    }
    const desc = this._settings.get(key);
    if (desc) return desc.defaultValue as T;
    return undefined as T;
  }

  /** Set a setting value. Fires 'changed' event and onChange callback. */
  set<T = unknown>(key: string, value: T): void {
    const desc = this._settings.get(key);
    const previous = this._values.get(key);
    this._values.set(key, value);
    if (desc?.onChange) {
      try {
        (desc.onChange as (v: unknown) => void)(value);
      } catch (e) {
        console.error(`[SettingsRegistry] onChange error for "${key}":`, e);
      }
    }
    this._emit({ type: 'changed', key, value, previousValue: previous });
  }

  /** Reset a single setting to its default value. */
  resetToDefault(key: string): void {
    const desc = this._settings.get(key);
    if (!desc) return;
    this.set(key, desc.defaultValue);
    this._emit({ type: 'reset', key, value: desc.defaultValue });
  }

  /** Reset all settings to defaults. */
  resetAll(): void {
    for (const [key, desc] of this._settings) {
      this.set(key, desc.defaultValue);
    }
  }

  /** Check if value differs from default. */
  isModified(key: string): boolean {
    const desc = this._settings.get(key);
    if (!desc) return false;
    return JSON.stringify(this._values.get(key)) !== JSON.stringify(desc.defaultValue);
  }

  // ── Query ──

  /** Get descriptor for a setting. */
  getDescriptor(key: string): SettingDescriptor | undefined {
    return this._settings.get(key);
  }

  /** Get all registered setting keys. */
  getAllKeys(): string[] {
    return Array.from(this._settings.keys());
  }

  /** Get all descriptors grouped by category. */
  getByCategory(): Map<string, SettingDescriptor[]> {
    const groups = new Map<string, SettingDescriptor[]>();
    for (const desc of this._settings.values()) {
      const cat = desc.category || 'General';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(desc);
    }
    // Sort by order within each category
    for (const [, items] of groups) {
      items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    }
    return groups;
  }

  /** Get the sorted list of category names. */
  getCategoryNames(): string[] {
    const cats = new Set<string>();
    for (const desc of this._settings.values()) {
      cats.add(desc.category || 'General');
    }
    const sorted = Array.from(cats).sort((a, b) => {
      const infoA = this._categories.get(a);
      const infoB = this._categories.get(b);
      return (infoA?.order ?? 100) - (infoB?.order ?? 100);
    });
    return sorted;
  }

  /** Get category display info. */
  getCategoryInfo(name: string): CategoryInfo | undefined {
    return this._categories.get(name);
  }

  // ── Serialization (used by SettingsService) ──

  /** Export all non-default values as a plain object. */
  exportValues(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const [key, value] of this._values) {
      const desc = this._settings.get(key);
      if (desc && JSON.stringify(value) !== JSON.stringify(desc.defaultValue)) {
        data[key] = value;
      }
    }
    return data;
  }

  /** Import values from a plain object (e.g. loaded from disk). */
  importValues(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      if (this._settings.has(key)) {
        this.set(key, value);
      } else {
        // Setting not yet registered — store value for when it registers
        this._values.set(key, value);
      }
    }
    this._emit({ type: 'loaded', key: '*', value: data });
  }

  // ── Events ──

  /** Subscribe to setting changes. Returns unsubscribe function. */
  on(listener: SettingsListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  private _emit(event: SettingsEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[SettingsRegistry] Listener error:', e);
      }
    }
  }
}

/** Global settings registry singleton. */
export const SettingsRegistry = new SettingsRegistryImpl();
