// ============================================================
// FluxionJS V3 — Panel Registry
// Central API for registering editor panels. Panels declare their
// default zone, allowed zones, and detach capability.
// ============================================================

import React from 'react';

export type PanelZone = 'left' | 'right' | 'bottom';

export interface PanelRegistration {
  /** Unique identifier used throughout the layout system. */
  id: string;
  /** Human-readable title shown in tab bars. */
  title: string;
  /** Optional icon shown next to the tab label. */
  icon?: React.ReactNode;
  /** The React component to render as the panel body. */
  component: React.ComponentType;
  /** Zone where the panel lives on first launch. */
  defaultZone: PanelZone;
  /** Zones the panel is allowed to be moved into. */
  allowedZones: PanelZone[];
  /**
   * Whether the panel can be "detached" into a window.
   * Actual window type (OS vs. in-app) is controlled by the
   * `editor.panels.useNativeWindows` setting.
   */
  canDetach?: boolean;
}

class PanelRegistryClass {
  private readonly panels = new Map<string, PanelRegistration>();

  /** Register a panel. Safe to call multiple times with the same id (last wins). */
  register(panel: PanelRegistration): void {
    this.panels.set(panel.id, panel);
  }

  /** Retrieve a single panel registration by id. */
  get(id: string): PanelRegistration | undefined {
    return this.panels.get(id);
  }

  /** Return all registered panels in insertion order. */
  getAll(): PanelRegistration[] {
    return Array.from(this.panels.values());
  }

  /** Return all panels whose defaultZone matches the given zone. */
  getByDefaultZone(zone: PanelZone): PanelRegistration[] {
    return this.getAll().filter((p) => p.defaultZone === zone);
  }
}

export const PanelRegistry = new PanelRegistryClass();
