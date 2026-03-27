// ============================================================
// FluxionJS V2 — Editor State (Pure logic, no React)
// State shape, actions, reducer — extracted from EditorState.tsx
// ============================================================

import { EntityId } from '../../src/core/ECS';

// ── Types ──
export type EditorTool = 'select' | 'move' | 'rotate' | 'scale';
export type TransformSpace = 'local' | 'world';
export type BottomTab = 'console' | 'assets' | 'profiler' | 'history';

export interface ConsoleEntry {
  text: string;
  type: 'info' | 'warn' | 'error' | 'system';
  time: Date;
}

export type ViewportShadingMode = 'lit' | 'unlit' | 'wireframe';

export interface SnapConfig {
  translationSnap: number;
  rotationSnap: number;
  scaleSnap: number;
}

export interface SelectedAsset {
  path: string;
  type: string;
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
  bottomTab: BottomTab;
  viewportTab: 'Scene' | 'Game';
  viewportShading: ViewportShadingMode;
  showGrid: boolean;
  consoleEntries: ConsoleEntry[];
  leftPanelWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
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
  | { type: 'STOP_PLAY' }
  | { type: 'TOGGLE_SNAP' }
  | { type: 'SET_SNAP_CONFIG'; config: Partial<SnapConfig> }
  | { type: 'SET_VIEWPORT_SHADING'; mode: ViewportShadingMode }
  | { type: 'TOGGLE_GRID' }
  | { type: 'SET_CLIPBOARD'; entity: EntityId | null }
  | { type: 'SET_BOTTOM_TAB'; tab: BottomTab }
  | { type: 'SET_VIEWPORT_TAB'; tab: 'Scene' | 'Game' }
  | { type: 'LOG'; text: string; logType: ConsoleEntry['type'] }
  | { type: 'CLEAR_CONSOLE' }
  | { type: 'SET_LEFT_WIDTH'; width: number }
  | { type: 'SET_RIGHT_WIDTH'; width: number }
  | { type: 'SET_BOTTOM_HEIGHT'; height: number }
  | { type: 'SET_HIERARCHY_FILTER'; filter: string }
  | { type: 'UPDATE_STATS'; stats: Partial<EditorState> }
  | { type: 'LOAD_PROJECT'; path: string; name: string }
  | { type: 'CLOSE_PROJECT' }
  | { type: 'SET_SCENE_PATH'; path: string | null }
  | { type: 'SET_SCENE_DIRTY'; dirty: boolean };

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
  bottomTab: 'console',
  viewportTab: 'Scene',
  viewportShading: 'lit',
  showGrid: true,
  consoleEntries: [],
  leftPanelWidth: 280,
  rightPanelWidth: 320,
  bottomPanelHeight: 200,
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
    case 'SET_BOTTOM_TAB':
      return { ...state, bottomTab: action.tab };
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
    case 'SET_LEFT_WIDTH':
      return { ...state, leftPanelWidth: Math.max(200, Math.min(500, action.width)) };
    case 'SET_RIGHT_WIDTH':
      return { ...state, rightPanelWidth: Math.max(200, Math.min(500, action.width)) };
    case 'SET_BOTTOM_HEIGHT':
      return { ...state, bottomPanelHeight: Math.max(100, Math.min(500, action.height)) };
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
    default:
      return state;
  }
}
