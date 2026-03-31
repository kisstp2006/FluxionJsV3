// ============================================================
// FluxionJS V3 — Panel Layout Context
// Manages which panels live in which zones, active tabs,
// floating windows and panel sizes. Persists zone layout to
// localStorage across sessions.
// ============================================================

import React, {
  createContext, useContext, useReducer, useCallback,
  useEffect, useRef,
} from 'react';
import { PanelRegistry, PanelZone } from './PanelRegistry';

// ── Types ──

export interface FloatingPanelEntry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetachedPanelEntry {
  id: string;
}

export interface PanelLayout {
  zones: Record<PanelZone, string[]>;
  activeTab: Record<PanelZone, string>;
  floatingPanels: FloatingPanelEntry[];
  detachedPanels: DetachedPanelEntry[];
  panelSizes: { left: number; right: number; bottom: number };
}

// ── Actions ──

type PanelLayoutAction =
  | { type: 'MOVE_PANEL'; id: string; toZone: PanelZone }
  | { type: 'SET_ACTIVE_TAB'; zone: PanelZone; id: string }
  | { type: 'FLOAT_PANEL'; id: string; x: number; y: number }
  | { type: 'DOCK_PANEL'; id: string; toZone: PanelZone }
  | { type: 'DETACH_PANEL'; id: string }
  | { type: 'REATTACH_PANEL'; id: string }
  | { type: 'SET_PANEL_SIZE'; dimension: 'left' | 'right' | 'bottom'; value: number }
  | { type: 'UPDATE_FLOAT_POS'; id: string; x: number; y: number }
  | { type: 'UPDATE_FLOAT_SIZE'; id: string; width: number; height: number }
  | { type: 'LOAD_LAYOUT'; layout: Partial<PanelLayout> };

// ── Helper ──

function removeFromAllZones(zones: Record<PanelZone, string[]>, id: string): Record<PanelZone, string[]> {
  const next = { ...zones };
  for (const zone of Object.keys(next) as PanelZone[]) {
    next[zone] = next[zone].filter((p) => p !== id);
  }
  return next;
}

function ensureActiveTab(
  zones: Record<PanelZone, string[]>,
  activeTab: Record<PanelZone, string>,
): Record<PanelZone, string> {
  const next = { ...activeTab };
  for (const zone of Object.keys(zones) as PanelZone[]) {
    if (!zones[zone].includes(next[zone])) {
      next[zone] = zones[zone][0] ?? '';
    }
  }
  return next;
}

// ── Build default layout from PanelRegistry ──

function buildDefaultLayout(): PanelLayout {
  const zones: Record<PanelZone, string[]> = { left: [], right: [], bottom: [] };
  for (const panel of PanelRegistry.getAll()) {
    zones[panel.defaultZone].push(panel.id);
  }
  return {
    zones,
    activeTab: {
      left:   zones.left[0]   ?? '',
      right:  zones.right[0]  ?? '',
      bottom: zones.bottom[0] ?? '',
    },
    floatingPanels: [],
    detachedPanels: [],
    panelSizes: { left: 280, right: 320, bottom: 200 },
  };
}

// ── Reducer ──

function panelLayoutReducer(state: PanelLayout, action: PanelLayoutAction): PanelLayout {
  switch (action.type) {
    case 'MOVE_PANEL': {
      const zones = removeFromAllZones(state.zones, action.id);
      zones[action.toZone] = [...zones[action.toZone], action.id];
      // Remove from floating if present
      const floatingPanels = state.floatingPanels.filter((f) => f.id !== action.id);
      const activeTab = ensureActiveTab(zones, {
        ...state.activeTab,
        [action.toZone]: action.id,
      });
      return { ...state, zones, activeTab, floatingPanels };
    }

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: { ...state.activeTab, [action.zone]: action.id } };

    case 'FLOAT_PANEL': {
      // Remove from zone
      const zones = removeFromAllZones(state.zones, action.id);
      const activeTab = ensureActiveTab(zones, state.activeTab);
      // Remove existing float entry if any
      const others = state.floatingPanels.filter((f) => f.id !== action.id);
      const floatingPanels: FloatingPanelEntry[] = [
        ...others,
        { id: action.id, x: action.x, y: action.y, width: 400, height: 300 },
      ];
      return { ...state, zones, activeTab, floatingPanels };
    }

    case 'DOCK_PANEL': {
      const floatingPanels = state.floatingPanels.filter((f) => f.id !== action.id);
      const zones = { ...state.zones };
      if (!zones[action.toZone].includes(action.id)) {
        zones[action.toZone] = [...zones[action.toZone], action.id];
      }
      const activeTab = ensureActiveTab(zones, {
        ...state.activeTab,
        [action.toZone]: action.id,
      });
      return { ...state, zones, floatingPanels, activeTab };
    }

    case 'DETACH_PANEL': {
      const zones = removeFromAllZones(state.zones, action.id);
      const activeTab = ensureActiveTab(zones, state.activeTab);
      const floatingPanels = state.floatingPanels.filter((f) => f.id !== action.id);
      const detachedPanels = state.detachedPanels.some((d) => d.id === action.id)
        ? state.detachedPanels
        : [...state.detachedPanels, { id: action.id }];
      return { ...state, zones, activeTab, floatingPanels, detachedPanels };
    }

    case 'REATTACH_PANEL': {
      const detachedPanels = state.detachedPanels.filter((d) => d.id !== action.id);
      const reg = PanelRegistry.get(action.id);
      const zone = reg?.defaultZone ?? 'bottom';
      const zones = { ...state.zones };
      if (!zones[zone].includes(action.id)) {
        zones[zone] = [...zones[zone], action.id];
      }
      const activeTab = ensureActiveTab(zones, {
        ...state.activeTab,
        [zone]: action.id,
      });
      return { ...state, zones, activeTab, detachedPanels };
    }

    case 'SET_PANEL_SIZE':
      return {
        ...state,
        panelSizes: { ...state.panelSizes, [action.dimension]: action.value },
      };

    case 'UPDATE_FLOAT_POS':
      return {
        ...state,
        floatingPanels: state.floatingPanels.map((f) =>
          f.id === action.id ? { ...f, x: action.x, y: action.y } : f
        ),
      };

    case 'UPDATE_FLOAT_SIZE':
      return {
        ...state,
        floatingPanels: state.floatingPanels.map((f) =>
          f.id === action.id ? { ...f, width: action.width, height: action.height } : f
        ),
      };

    case 'LOAD_LAYOUT': {
      const merged: PanelLayout = { ...state };
      if (action.layout.zones)        merged.zones        = action.layout.zones;
      if (action.layout.activeTab)    merged.activeTab    = action.layout.activeTab;
      if (action.layout.floatingPanels) merged.floatingPanels = action.layout.floatingPanels;
      if (action.layout.detachedPanels) merged.detachedPanels = action.layout.detachedPanels;
      if (action.layout.panelSizes)   merged.panelSizes   = action.layout.panelSizes;
      // Ensure active tabs are still valid
      merged.activeTab = ensureActiveTab(merged.zones, merged.activeTab);
      return merged;
    }

    default:
      return state;
  }
}

// ── localStorage helpers ──

const STORAGE_KEY = 'fluxion_panel_layout_v1';

interface PersistedLayout {
  zones: Record<PanelZone, string[]>;
  activeTab: Record<PanelZone, string>;
  panelSizes: { left: number; right: number; bottom: number };
}

function saveLayout(layout: PanelLayout): void {
  try {
    const persisted: PersistedLayout = {
      zones: layout.zones,
      activeTab: layout.activeTab,
      panelSizes: layout.panelSizes,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch { /* non-fatal */ }
}

function loadPersistedLayout(): Partial<PanelLayout> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: PersistedLayout = JSON.parse(raw);

    // Validate — make sure every id references a real registered panel
    const allIds = new Set(PanelRegistry.getAll().map((p) => p.id));
    const filtered: Record<PanelZone, string[]> = { left: [], right: [], bottom: [] };

    // Collect ids that are still in the zones
    const usedIds = new Set<string>();
    for (const zone of ['left', 'right', 'bottom'] as PanelZone[]) {
      if (Array.isArray(data.zones?.[zone])) {
        for (const id of data.zones[zone]) {
          if (allIds.has(id) && !usedIds.has(id)) {
            filtered[zone].push(id);
            usedIds.add(id);
          }
        }
      }
    }

    // Any registered panel not in zones goes to its defaultZone
    for (const panel of PanelRegistry.getAll()) {
      if (!usedIds.has(panel.id)) {
        filtered[panel.defaultZone].push(panel.id);
      }
    }

    return {
      zones: filtered,
      activeTab: data.activeTab,
      panelSizes: data.panelSizes,
      floatingPanels: [],
      detachedPanels: [],
    };
  } catch {
    return null;
  }
}

// ── Context ──

interface PanelLayoutContextValue {
  layout: PanelLayout;
  movePanel: (id: string, toZone: PanelZone) => void;
  setActiveTab: (zone: PanelZone, id: string) => void;
  floatPanel: (id: string, x?: number, y?: number) => void;
  dockPanel: (id: string, toZone: PanelZone) => void;
  detachPanel: (id: string) => void;
  reattachPanel: (id: string) => void;
  setPanelSize: (dimension: 'left' | 'right' | 'bottom', value: number) => void;
  updateFloatPos: (id: string, x: number, y: number) => void;
  updateFloatSize: (id: string, width: number, height: number) => void;
}

const PanelLayoutCtx = createContext<PanelLayoutContextValue | null>(null);

export const PanelLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [layout, dispatch] = useReducer(panelLayoutReducer, undefined, () => {
    const def = buildDefaultLayout();
    const persisted = loadPersistedLayout();
    if (persisted) {
      return panelLayoutReducer(def, { type: 'LOAD_LAYOUT', layout: persisted });
    }
    return def;
  });

  // Persist on every layout change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveLayout(layout), 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [layout]);

  const movePanel     = useCallback((id: string, toZone: PanelZone)  => dispatch({ type: 'MOVE_PANEL', id, toZone }), []);
  const setActiveTab  = useCallback((zone: PanelZone, id: string)     => dispatch({ type: 'SET_ACTIVE_TAB', zone, id }), []);
  const floatPanel    = useCallback((id: string, x = 200, y = 200)    => dispatch({ type: 'FLOAT_PANEL', id, x, y }), []);
  const dockPanel     = useCallback((id: string, toZone: PanelZone)   => dispatch({ type: 'DOCK_PANEL', id, toZone }), []);
  const detachPanel   = useCallback((id: string)                       => dispatch({ type: 'DETACH_PANEL', id }), []);
  const reattachPanel = useCallback((id: string)                       => dispatch({ type: 'REATTACH_PANEL', id }), []);
  const setPanelSize  = useCallback((dim: 'left' | 'right' | 'bottom', value: number) =>
    dispatch({ type: 'SET_PANEL_SIZE', dimension: dim, value }), []);
  const updateFloatPos  = useCallback((id: string, x: number, y: number) => dispatch({ type: 'UPDATE_FLOAT_POS', id, x, y }), []);
  const updateFloatSize = useCallback((id: string, width: number, height: number) => dispatch({ type: 'UPDATE_FLOAT_SIZE', id, width, height }), []);

  return (
    <PanelLayoutCtx.Provider value={{
      layout,
      movePanel, setActiveTab, floatPanel, dockPanel,
      detachPanel, reattachPanel, setPanelSize,
      updateFloatPos, updateFloatSize,
    }}>
      {children}
    </PanelLayoutCtx.Provider>
  );
};

export function usePanelLayout(): PanelLayoutContextValue {
  const ctx = useContext(PanelLayoutCtx);
  if (!ctx) throw new Error('usePanelLayout must be used within PanelLayoutProvider');
  return ctx;
}

/**
 * Returns true when the given panelId is the currently active (visible) tab in
 * its zone. Panels that are detached or floating are considered inactive.
 * Use this to pause expensive work (RAF loops, polling) when the panel is hidden.
 */
export function usePanelActive(panelId: string): boolean {
  const ctx = useContext(PanelLayoutCtx);
  if (!ctx) return true; // outside provider (e.g. standalone panel window) → always active
  const { layout } = ctx;
  // Must be in a zone and be that zone's active tab
  for (const zone of (['left', 'right', 'bottom'] as const)) {
    if (layout.zones[zone].includes(panelId)) {
      return layout.activeTab[zone] === panelId;
    }
  }
  // Panel is floating or detached — treat as active (it has its own window)
  return true;
}
