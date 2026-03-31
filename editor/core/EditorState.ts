// ============================================================
// FluxionJS V2 — Editor State (Pure logic, no React)
// State shape, actions, reducer — extracted from EditorState.tsx
// ============================================================

import { EntityId } from '../../src/core/ECS';
import { ProjectSettingsRegistry } from './ProjectSettingsRegistry';

// ── Types ──
export type EditorTool = 'select' | 'move' | 'rotate' | 'scale';
export type TransformSpace = 'local' | 'world';

export interface ConsoleEntry {
  text: string;
  type: 'info' | 'warn' | 'error' | 'system';
  time: Date;
}

export type ViewportShadingMode =
  | 'lit' | 'unlit' | 'wireframe'
  | 'albedo' | 'normals-world' | 'normals-tangent'
  | 'emissive' | 'roughness' | 'glossiness' | 'metalness' | 'occlusion';

export interface SnapConfig {
  translationSnap: number;
  rotationSnap: number;
  scaleSnap: number;
}

export interface SelectedAsset {
  path: string;
  type: string;
}

export interface DebugGroups {
  physics: boolean;
  camera: boolean;
  lights: boolean;
  audio: boolean;
  particles: boolean;
  drawInPlayMode: boolean;
}

// ── Stats snapshot (used by UPDATE_STATS action) ──
export interface EditorStats {
  fps?: number;
  entityCount?: number;
  frameTime?: number;
  drawCalls?: number;
  triangles?: number;
  textures?: number;
  geometries?: number;
  physicsBodies?: number;
}

export interface EditorState {
  selectedEntity: EntityId | null;
  selectedAsset: SelectedAsset | null;
  activeTool: EditorTool;
  transformSpace: TransformSpace;
  isPlaying: boolean;
  isPaused: boolean;
  snapEnabled: boolean;
  snapConfig: SnapConfig;
  viewportTab: 'Scene' | 'Game';
  viewportShading: ViewportShadingMode;
  showGrid: boolean;
  debugGroups: DebugGroups;
  consoleEntries: ConsoleEntry[];
  hierarchyFilter: string;
  clipboard: EntityId | null;
  fps: number;
  entityCount: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
  physicsBodies: number;
  projectLoaded: boolean;
  projectPath: string | null;
  projectName: string | null;
  currentScenePath: string | null;
  isSceneDirty: boolean;
}

// ── Actions ──
export type EditorAction =
  | { type: 'SELECT_ENTITY'; entity: EntityId | null }
  | { type: 'SELECT_ASSET'; asset: SelectedAsset | null }
  | { type: 'SET_TOOL'; tool: EditorTool }
  | { type: 'SET_TRANSFORM_SPACE'; space: TransformSpace }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'STOP_PLAY' }
  | { type: 'TOGGLE_SNAP' }
  | { type: 'SET_SNAP_CONFIG'; config: Partial<SnapConfig> }
  | { type: 'SET_VIEWPORT_SHADING'; mode: ViewportShadingMode }
  | { type: 'TOGGLE_GRID' }
  | { type: 'SET_CLIPBOARD'; entity: EntityId | null }
  | { type: 'SET_VIEWPORT_TAB'; tab: 'Scene' | 'Game' }
  | { type: 'LOG'; text: string; logType: ConsoleEntry['type'] }
  | { type: 'CLEAR_CONSOLE' }
  | { type: 'SET_HIERARCHY_FILTER'; filter: string }
  | { type: 'UPDATE_STATS'; stats: EditorStats }
  | { type: 'LOAD_PROJECT'; path: string; name: string }
  | { type: 'CLOSE_PROJECT' }
  | { type: 'SET_SCENE_PATH'; path: string | null }
  | { type: 'SET_SCENE_DIRTY'; dirty: boolean }
  | { type: 'SET_DEBUG_GROUP'; group: keyof DebugGroups; value: boolean }
  | { type: 'LOAD_DEBUG_GROUPS'; groups: DebugGroups }
  | { type: 'LOAD_SNAPSHOT'; snapshot: EditorState };

// ── Initial State ──
export const initialEditorState: EditorState = {
  selectedEntity: null,
  selectedAsset: null,
  activeTool: 'select',
  transformSpace: 'local',
  isPlaying: false,
  isPaused: false,
  snapEnabled: false,
  snapConfig: {
    translationSnap: 1,
    rotationSnap: Math.PI / 12,
    scaleSnap: 0.25,
  },
  viewportTab: 'Scene',
  viewportShading: 'lit',
  showGrid: true,
  debugGroups: {
    physics: true,
    camera: true,
    lights: true,
    audio: true,
    particles: true,
    drawInPlayMode: true,
  },
  consoleEntries: [],
  hierarchyFilter: '',
  clipboard: null,
  fps: 0,
  entityCount: 0,
  frameTime: 0,
  drawCalls: 0,
  triangles: 0,
  textures: 0,
  geometries: 0,
  physicsBodies: 0,
  projectLoaded: false,
  projectPath: null,
  projectName: null,
  currentScenePath: null,
  isSceneDirty: false,
};

// ── Reducer ──
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SELECT_ENTITY':
      return { ...state, selectedEntity: action.entity, selectedAsset: null };
    case 'SELECT_ASSET':
      return { ...state, selectedAsset: action.asset, selectedEntity: null };
    case 'SET_TOOL':
      return { ...state, activeTool: action.tool };
    case 'SET_TRANSFORM_SPACE':
      return { ...state, transformSpace: action.space };
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying, isPaused: false };
    case 'TOGGLE_PAUSE':
      return { ...state, isPaused: !state.isPaused };
    case 'STOP_PLAY':
      return { ...state, isPlaying: false, isPaused: false };
    case 'TOGGLE_SNAP':
      return { ...state, snapEnabled: !state.snapEnabled };
    case 'SET_SNAP_CONFIG':
      return { ...state, snapConfig: { ...state.snapConfig, ...action.config } };
    case 'SET_VIEWPORT_SHADING':
      return { ...state, viewportShading: action.mode };
    case 'TOGGLE_GRID':
      return { ...state, showGrid: !state.showGrid };
    case 'SET_CLIPBOARD':
      return { ...state, clipboard: action.entity };
    case 'SET_VIEWPORT_TAB':
      return { ...state, viewportTab: action.tab };
    case 'LOG':
      return {
        ...state,
        consoleEntries: [...state.consoleEntries, {
          text: action.text,
          type: action.logType,
          time: new Date(),
        }],
      };
    case 'CLEAR_CONSOLE':
      return { ...state, consoleEntries: [] };
    case 'SET_HIERARCHY_FILTER':
      return { ...state, hierarchyFilter: action.filter };
    case 'UPDATE_STATS':
      return { ...state, ...action.stats };
    case 'LOAD_PROJECT':
      return { ...state, projectLoaded: true, projectPath: action.path, projectName: action.name };
    case 'CLOSE_PROJECT':
      return { ...state, projectLoaded: false, projectPath: null, projectName: null, currentScenePath: null, isSceneDirty: false, selectedEntity: null };
    case 'SET_SCENE_PATH':
      return { ...state, currentScenePath: action.path };
    case 'SET_SCENE_DIRTY':
      return { ...state, isSceneDirty: action.dirty };
    case 'SET_DEBUG_GROUP':
      ProjectSettingsRegistry.set(`editor.debug.${action.group}`, action.value);
      return { ...state, debugGroups: { ...state.debugGroups, [action.group]: action.value } };
    case 'LOAD_DEBUG_GROUPS':
      return { ...state, debugGroups: action.groups };
    case 'LOAD_SNAPSHOT':
      return { ...state, ...action.snapshot };
    default:
      return state;
  }
}
