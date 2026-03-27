// ============================================================
// FluxionJS V3 — Script Editor Standalone Window Entry Point
// Monaco-based TypeScript/JavaScript editor for .ts/.js scripts.
// Supports multiple open files via tabs; saves via fluxionAPI.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import MonacoEditor, { loader } from '@monaco-editor/react';
import './styles/globals.css';
import { SvgIcon } from './ui/SvgIcon';
import terminalSvg from './ui/icons/terminal.svg';
import xSvg from './ui/icons/x.svg';
import { ElectronFileSystem, setGlobalFileSystem } from '../src/filesystem';
import { projectManager } from '../src/project/ProjectManager';
import { normalizePath } from '../src/filesystem/FileSystem';

// Point @monaco-editor/react to the locally-served monaco min/vs files
// (dist/editor/vs/) instead of the default CDN. This is required in Electron
// because the renderer runs at file:// and cannot reach external URLs.
loader.config({ paths: { vs: './vs' } });

// Initialize filesystem
const _fs = new ElectronFileSystem();
setGlobalFileSystem(_fs);

// Read initial file from URL
const params = new URLSearchParams(window.location.search);
const initialFilePath = params.get('filePath') || '';

// Auto-detect project root from file path
(async () => {
  if (!initialFilePath) return;
  let dir = normalizePath(initialFilePath);
  dir = dir.substring(0, dir.lastIndexOf('/'));
  while (dir && dir.length > 3) {
    try {
      const entries = await _fs.readDir(dir);
      if (entries.some((e) => e.name.endsWith('.fluxproj'))) {
        await projectManager.openProject(
          `${dir}/${entries.find((e) => e.name.endsWith('.fluxproj'))!.name}`,
        );
        break;
      }
    } catch {}
    dir = dir.substring(0, dir.lastIndexOf('/'));
  }
})();

// ── fluxion.d.ts type declarations injected into Monaco ──────

const FLUXION_DTS = `
// ── THREE.js math shortcuts injected into script scope ───────
declare const THREE: any;
declare const Vec2: new (x?: number, y?: number) => { x: number; y: number; set(x:number,y:number): this; clone(): this };
declare const Vec3: new (x?: number, y?: number, z?: number) => { x: number; y: number; z: number; set(x:number,y:number,z:number): this; clone(): this; add(v:any): this; sub(v:any): this; multiplyScalar(s:number): this; length(): number; normalize(): this; dot(v:any): number; cross(v:any): this; copy(v:any): this; distanceTo(v:any): number };
declare const Vec4: new (x?: number, y?: number, z?: number, w?: number) => { x: number; y: number; z: number; w: number };
declare const Quat: new (x?: number, y?: number, z?: number, w?: number) => { x: number; y: number; z: number; w: number; setFromEuler(e:any): this; setFromAxisAngle(axis:any, angle:number): this; multiply(q:any): this; slerp(q:any, t:number): this; clone(): this };
declare const Color: new (r?: number | string, g?: number, b?: number) => { r: number; g: number; b: number; set(v:any): this; clone(): this };
declare const Euler: new (x?: number, y?: number, z?: number, order?: string) => { x: number; y: number; z: number; order: string; set(x:number,y:number,z:number): this; clone(): this };
declare const Mat4: new () => { elements: number[]; identity(): this; compose(p:any,q:any,s:any): this; decompose(p:any,q:any,s:any): this; clone(): this };
declare const Mat3: new () => { elements: number[]; identity(): this; clone(): this };

// ── Mathf — common math utilities ────────────────────────────
declare const Mathf: {
  PI: number; TAU: number; Deg2Rad: number; Rad2Deg: number;
  lerp(a: number, b: number, t: number): number;
  clamp(v: number, min: number, max: number): number;
  clamp01(v: number): number;
  smoothstep(edge0: number, edge1: number, x: number): number;
  approximately(a: number, b: number): boolean;
  moveTowards(current: number, target: number, maxDelta: number): number;
  repeat(t: number, length: number): number;
  deltaAngle(a: number, b: number): number;
  pingPong(t: number, length: number): number;
  abs(x: number): number; ceil(x: number): number; floor(x: number): number;
  round(x: number): number; sin(x: number): number; cos(x: number): number;
  atan2(y: number, x: number): number; sqrt(x: number): number;
  sign(x: number): number; pow(x: number, y: number): number;
  log(x: number): number; exp(x: number): number;
  min(...values: number[]): number; max(...values: number[]): number;
};

// ── Debug draw ───────────────────────────────────────────────
declare namespace Debug {
  function drawLine(start: { x:number;y:number;z:number }, end: { x:number;y:number;z:number }, color?: { r:number;g:number;b:number }): void;
  function drawLineWorld(start: { x:number;y:number;z:number }, end: { x:number;y:number;z:number }, color?: { r:number;g:number;b:number }): void;
  function drawCross(position: { x:number;y:number;z:number }, size: number, color?: { r:number;g:number;b:number }): void;
  function drawLineBox(min: { x:number;y:number;z:number }, max: { x:number;y:number;z:number }, color?: { r:number;g:number;b:number }): void;
  function drawLineSphere(center: { x:number;y:number;z:number }, radius: number, color?: { r:number;g:number;b:number }, segments?: number): void;
}

// ── Component types ──────────────────────────────────────────
interface TransformComponent {
  position: InstanceType<typeof Vec3>;
  rotation: InstanceType<typeof Euler>;
  scale: InstanceType<typeof Vec3>;
  quaternion: InstanceType<typeof Quat>;
  lookAt(target: InstanceType<typeof Vec3>): void;
}
interface RigidbodyComponent {
  bodyType: 'dynamic' | 'static' | 'kinematic';
  mass: number;
  linearDamping: number;
  angularDamping: number;
  gravityScale: number;
  isSensor: boolean;
  enabled: boolean;
}
interface AudioSourceComponent {
  clip: string;
  volume: number;
  pitch: number;
  loop: boolean;
  spatial: boolean;
  autoPlay: boolean;
  enabled: boolean;
}
interface LightComponent {
  lightType: 'directional' | 'point' | 'spot' | 'ambient';
  color: InstanceType<typeof Color>;
  intensity: number;
  castShadow: boolean;
  range: number;
  enabled: boolean;
}
interface CameraComponent {
  fov: number;
  near: number;
  far: number;
  isOrthographic: boolean;
  orthoSize: number;
  isMain: boolean;
  priority: number;
  enabled: boolean;
}

// ── FluxionScript ────────────────────────────────────────────
declare class FluxionScript {
  /** The entity ID this script is attached to. */
  readonly entity: number;

  /** Engine time. */
  readonly time: {
    readonly deltaTime: number;
    readonly unscaledDeltaTime: number;
    readonly fixedDeltaTime: number;
    timeScale: number;
    readonly elapsed: number;
    readonly unscaledElapsed: number;
    readonly frameCount: number;
    readonly fps: number;
    readonly smoothFps: number;
    readonly fixedAlpha: number;
  };

  /** Input manager — keyboard, mouse, gamepad. */
  readonly input: {
    isKeyDown(code: string): boolean;
    isKeyPressed(code: string): boolean;
    isKeyReleased(code: string): boolean;
    isMouseDown(button?: number): boolean;
    isMousePressed(button?: number): boolean;
    isMouseReleased(button?: number): boolean;
    isPointerLocked(): boolean;
    lockPointer(): void;
    unlockPointer(): void;
    getAxis(negative: string, positive: string): number;
    getGamepadAxis(padIndex: number, axisIndex: number, deadzone?: number): number;
    isGamepadButtonDown(padIndex: number, buttonIndex: number): boolean;
    readonly mousePosition: { x: number; y: number };
    readonly mouseDelta: { x: number; y: number };
    readonly mouseWheel: number;
    readonly horizontal: number;
    readonly vertical: number;
  };

  /** The global engine event bus. */
  readonly events: {
    on<T = any>(event: string, cb: (data: T) => void, priority?: number): () => void;
    once<T = any>(event: string, cb: (data: T) => void, priority?: number): () => void;
    emit<T = any>(event: string, data?: T): void;
  };

  /** The Transform component of this entity (shortcut). */
  readonly transform: TransformComponent | null;

  /** Physics world access. */
  readonly physics: {
    raycast(origin: InstanceType<typeof Vec3>, direction: InstanceType<typeof Vec3>, maxDist?: number): { entity: number; point: InstanceType<typeof Vec3>; normal: InstanceType<typeof Vec3>; distance: number } | null;
    setGravity(x: number, y: number, z: number): void;
  };

  /** Scene management. */
  readonly scene: {
    getName(): string;
    load(path: string): void;
  };

  /** Application info. */
  readonly application: {
    readonly fps: number;
    readonly isEditor: boolean;
    readonly platform: string;
    quit(): void;
  };

  // Component access
  getComponent<T>(type: string): T | null;
  getComponentOf<T>(entity: number, type: string): T | null;
  hasComponent(type: string): boolean;
  addComponent<T>(component: T): T;
  removeComponent(type: string): void;

  // Scene queries
  find(name: string): number | undefined;
  findWithTag(tag: string): number | undefined;
  findAll(tag: string): number[];
  query(...componentTypes: string[]): number[];

  // Hierarchy
  getParent(entity?: number): number | undefined;
  getChildren(entity?: number): ReadonlySet<number>;

  // Entity lifecycle
  createEntity(name?: string): number;
  destroy(entity?: number): void;
  getName(entity?: number): string;
  setName(name: string, entity?: number): void;

  // Tags
  addTag(tag: string, entity?: number): void;
  hasTag(tag: string, entity?: number): boolean;

  // Events (auto-unsubscribed on destroy)
  on<T = any>(event: string, callback: (data: T) => void, priority?: number): void;
  once<T = any>(event: string, callback: (data: T) => void, priority?: number): void;
  emit<T = any>(event: string, data?: T): void;

  // Audio
  playSound(audioComp: AudioSourceComponent, position?: InstanceType<typeof Vec3>): void;

  // Coroutines
  startCoroutine(gen: Generator): symbol;
  stopCoroutine(id: symbol): void;

  // FUI (Fluxion UI)
  readonly ui: {
    /** Load a .fui file onto the FuiComponent. */
    load(path: string): void;
    /** Attach an inline FuiDocument (built with FuiBuilder). */
    create(doc: FuiDocument): void;
    /** Update the text of a label or button node by ID. Re-renders immediately. */
    setText(nodeId: string, text: string): void;
    /** Show the FUI (enable the FuiComponent). */
    show(): void;
    /** Hide the FUI (disable the FuiComponent). */
    hide(): void;
    /** Toggle FUI visibility. */
    setVisible(visible: boolean): void;
    /** Start a named animation defined in the FUI document. */
    playAnimation(id: string): void;
    /** Stop the currently playing animation. */
    stopAnimation(): void;
    /** Move a screen-space FUI to the given pixel position. */
    setScreenPosition(x: number, y: number): void;
    /** Subscribe to a specific button click. Auto-cleaned on script destroy. */
    onButtonClick(elementId: string, callback: () => void): void;
    /** Subscribe to any button click on this entity's FUI. */
    onAnyClick(callback: (elementId: string) => void): void;
  };

  // Logging
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;

  // Lifecycle hooks
  onStart?(): void;
  onUpdate?(dt: number): void;
  onFixedUpdate?(dt: number): void;
  onDestroy?(): void;
}

// ── FUI types (available in scripts via FuiBuilder) ──────────────────────────

interface FuiRect { x: number; y: number; w: number; h: number; }
type FuiNodeType = 'panel' | 'label' | 'button';
type FuiMode = 'screen' | 'world';
type FuiAlign = 'left' | 'center' | 'right';
type FuiAnimatableProperty = 'opacity' | 'x' | 'y' | 'w' | 'h' | 'fontSize';

interface FuiDocument {
  version: number;
  mode: FuiMode;
  canvas: { width: number; height: number };
  root: any;
  animations?: any[];
}

interface FuiPanelOpts {
  bg?: string; border?: string; borderWidth?: number;
  radius?: number; opacity?: number; parent?: string;
}
interface FuiLabelOpts {
  color?: string; fontSize?: number; align?: FuiAlign;
  opacity?: number; parent?: string;
}
interface FuiButtonOpts {
  bg?: string; border?: string; borderWidth?: number;
  textColor?: string; fontSize?: number; radius?: number;
  padding?: number; opacity?: number; parent?: string;
}
interface FuiAnimTrackSpec {
  nodeId: string;
  property: FuiAnimatableProperty;
  keyframes: Array<{ time: number; value: number; easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step' }>;
}

declare class FuiBuilder {
  constructor(width?: number, height?: number, mode?: FuiMode);
  panel(id: string, x: number, y: number, w: number, h: number, opts?: FuiPanelOpts): this;
  label(id: string, x: number, y: number, w: number, h: number, text: string, opts?: FuiLabelOpts): this;
  button(id: string, x: number, y: number, w: number, h: number, text: string, opts?: FuiButtonOpts): this;
  background(color: string, opts?: { opacity?: number }): this;
  animation(id: string, name: string, duration: number, loop: boolean, tracks: FuiAnimTrackSpec[]): this;
  build(): FuiDocument;
  toJSON(): string;
  static genId(prefix?: string): string;
}

// ── EntityRef ─────────────────────────────────────────────────

/**
 * A typed entity reference that is exposed as an entity picker in the Inspector.
 * @example
 *   target      = new EntityRef();            // any entity
 *   cameraSlot  = new EntityRef('Camera');    // only entities with Camera
 *   rbSlot      = new EntityRef('Rigidbody');
 *
 *   onUpdate() {
 *     if (!this.target.isValid) return;
 *     const tf = this.getComponentOf(this.target.entity, 'Transform');
 *   }
 */
declare class EntityRef {
  /** The assigned entity ID, or null when unassigned. */
  entity: number | null;
  /** Component type constraint shown in the Inspector filter (read-only). */
  readonly requireComponent: string | undefined;
  /** True when an entity is assigned. */
  readonly isValid: boolean;
  constructor(requireComponent?: string);
}
`;

// ── Types ─────────────────────────────────────────────────────

interface ScriptTab {
  path: string;
  /** File name for display */
  name: string;
  content: string;
  /** Whether unsaved changes exist */
  dirty: boolean;
}

interface ScriptEditorSettings {
  fontSize: number;
  theme: string;
  fontFamily: string;
  minimap: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  hotReload: boolean;
  timeout: number;
}

declare const window: Window & {
  fluxionAPI: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, data: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
    getScriptSettings: () => Promise<ScriptEditorSettings | null>;
    onScriptSettingsUpdate: (cb: (s: ScriptEditorSettings) => void) => void;
    offScriptSettingsUpdate: () => void;
    onScriptOpenTab: (cb: (path: string) => void) => void;
    offScriptOpenTab: () => void;
  };
};

// ── Helpers ───────────────────────────────────────────────────

function basename(p: string) {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

function getLanguage(path: string): string {
  return path.endsWith('.ts') ? 'typescript' : 'javascript';
}

// ── App ───────────────────────────────────────────────────────

const DEFAULT_SETTINGS: ScriptEditorSettings = {
  fontSize: 13,
  theme: 'vs-dark',
  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  minimap: true,
  wordWrap: true,
  autoSave: false,
  hotReload: true,
  timeout: 0,
};

const App: React.FC = () => {
  const [tabs, setTabs] = useState<ScriptTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [editorSettings, setEditorSettings] = useState<ScriptEditorSettings>(DEFAULT_SETTINGS);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const libRegistered = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Register FluxionScript type declarations once Monaco is loaded
  const handleMonacoMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (!libRegistered.current) {
      libRegistered.current = true;
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        FLUXION_DTS,
        'ts:fluxion/fluxion.d.ts',
      );
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        noEmit: true,
        strict: false,
      });

      // ── Custom completion provider ──────────────────────────
      const CK = monaco.languages.CompletionItemKind;
      const IS = monaco.languages.CompletionItemInsertTextRule;

      // Component type names for getComponent / hasComponent / removeComponent
      const COMPONENT_TYPES = [
        'Transform', 'MeshRenderer', 'Rigidbody', 'Collider',
        'Light', 'AudioSource', 'Camera', 'Script',
        'ParticleEmitter', 'TextRenderer', 'CSGBrush',
      ];

      // Lifecycle snippets available at class-body level
      const LIFECYCLE_SNIPPETS = [
        {
          label: 'onStart',
          detail: 'Lifecycle — called once when play begins',
          insert: 'onStart() {\n\t$0\n}',
        },
        {
          label: 'onUpdate',
          detail: 'Lifecycle — called every frame',
          insert: 'onUpdate(dt: number) {\n\t$0\n}',
        },
        {
          label: 'onFixedUpdate',
          detail: 'Lifecycle — called at fixed physics rate',
          insert: 'onFixedUpdate(dt: number) {\n\t$0\n}',
        },
        {
          label: 'onDestroy',
          detail: 'Lifecycle — called when entity is destroyed',
          insert: 'onDestroy() {\n\t$0\n}',
        },
      ];

      // Common code snippets (triggered by keyword)
      const CODE_SNIPPETS = [
        {
          label: 'startCoroutine',
          detail: 'Start a generator coroutine',
          insert: 'startCoroutine(function*() {\n\tyield { seconds: ${1:1} };\n\t$0\n}.call(this));',
        },
        {
          label: 'getComponent',
          detail: 'Get a component from this entity',
          insert: "getComponent<${1:TransformComponent}>('${2:Transform}')",
        },
        {
          label: 'Vec3',
          detail: 'Construct a Vec3',
          insert: 'new Vec3(${1:0}, ${2:0}, ${3:0})',
        },
        {
          label: 'Mathf.lerp',
          detail: 'Linear interpolation',
          insert: 'Mathf.lerp(${1:a}, ${2:b}, ${3:t})',
        },
        {
          label: 'Mathf.clamp',
          detail: 'Clamp value between min and max',
          insert: 'Mathf.clamp(${1:value}, ${2:0}, ${3:1})',
        },
        {
          label: 'Debug.drawLine',
          detail: 'Draw a debug line in the viewport',
          insert: 'Debug.drawLine(${1:start}, ${2:end})',
        },
      ];

      monaco.languages.registerCompletionItemProvider('typescript', {
        triggerCharacters: ["'", '"', '.'],
        provideCompletionItems(model: any, position: any) {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const lineText: string = model.getLineContent(position.lineNumber);
          const textBefore = lineText.slice(0, position.column - 1);

          const items: any[] = [];

          // ── String literal completions inside getComponent / hasComponent / removeComponent ──
          const componentArgMatch = /(?:getComponent(?:Of)?|hasComponent|removeComponent|addTag|findWithTag|findAll)\s*\([^)]*['"]([^'"]*)?$/.test(textBefore);
          if (componentArgMatch) {
            for (const ctype of COMPONENT_TYPES) {
              items.push({
                label: ctype,
                kind: CK.EnumMember,
                detail: 'Component type',
                insertText: ctype,
                range,
              });
            }
            return { suggestions: items };
          }

          // ── Lifecycle snippets at class body level (after whitespace/newline) ──
          const atClassBody = /^\s*(on\w*)?$/.test(textBefore);
          if (atClassBody) {
            for (const s of LIFECYCLE_SNIPPETS) {
              items.push({
                label: s.label,
                kind: CK.Method,
                detail: s.detail,
                documentation: s.detail,
                insertText: s.insert,
                insertTextRules: IS.InsertAsSnippet,
                range,
                sortText: '0' + s.label,
              });
            }
          }

          // ── General code snippets ──
          for (const s of CODE_SNIPPETS) {
            items.push({
              label: s.label,
              kind: CK.Snippet,
              detail: s.detail,
              documentation: s.detail,
              insertText: s.insert,
              insertTextRules: IS.InsertAsSnippet,
              range,
            });
          }

          return { suggestions: items };
        },
      });
    }

    // Ctrl+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActive();
    });
  }, []);

  // Apply settings object to Monaco editor
  const applySettings = useCallback((s: ScriptEditorSettings) => {
    setEditorSettings(s);
    if (editorRef.current) {
      editorRef.current.updateOptions({
        fontSize: s.fontSize,
        fontFamily: s.fontFamily,
        minimap: { enabled: s.minimap },
        wordWrap: s.wordWrap ? 'on' : 'off',
      });
    }
  }, []);

  // Fetch settings from main process on mount
  useEffect(() => {
    const api = (window as any).fluxionAPI;
    if (!api?.getScriptSettings) return;
    api.getScriptSettings().then((s: ScriptEditorSettings | null) => {
      if (s && Object.keys(s).length > 0) applySettings(s);
    }).catch(() => {});
  }, [applySettings]);

  // Listen for live settings updates from the main renderer
  useEffect(() => {
    const api = (window as any).fluxionAPI;
    if (!api?.onScriptSettingsUpdate) return;
    api.onScriptSettingsUpdate((s: ScriptEditorSettings) => applySettings(s));
    return () => api.offScriptSettingsUpdate?.();
  }, [applySettings]);

  // Open a file (called on initial load and when main process sends open-tab)
  const openFile = useCallback(async (filePath: string) => {
    const norm = normalizePath(filePath);
    setTabs((prev) => {
      if (prev.some((t) => t.path === norm)) return prev;
      return prev; // will be updated after read
    });
    try {
      const content = await window.fluxionAPI.readFile(filePath);
      const tab: ScriptTab = { path: norm, name: basename(norm), content, dirty: false };
      setTabs((prev) => {
        if (prev.some((t) => t.path === norm)) return prev;
        return [...prev, tab];
      });
      setActiveTab(norm);
    } catch (err) {
      console.error('[ScriptEditor] Failed to open file:', err);
    }
  }, []);

  // Load initial file
  useEffect(() => {
    if (initialFilePath) openFile(initialFilePath);
  }, [openFile]);

  // Listen for open-tab events from main process
  useEffect(() => {
    const api = (window as any).fluxionAPI;
    if (!api?.onScriptOpenTab) return;
    api.onScriptOpenTab((path: string) => openFile(path));
    return () => api.offScriptOpenTab?.();
  }, [openFile]);

  const saveActive = useCallback(async (tabPath?: string, tabContent?: string) => {
    const path = tabPath ?? activeTab;
    if (!path) return;
    const tab = tabs.find((t) => t.path === path);
    const content = tabContent ?? tab?.content;
    if (!tab || content === undefined) return;
    try {
      await window.fluxionAPI.writeFile(tab.path, content);
      setTabs((prev) => prev.map((t) => t.path === path ? { ...t, dirty: false } : t));
      document.title = `Script Editor — ${tab.name}`;
    } catch (err) {
      console.error('[ScriptEditor] Failed to save:', err);
    }
  }, [activeTab, tabs]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTab) return;
    const newContent = value ?? '';
    setTabs((prev) => prev.map((t) =>
      t.path === activeTab ? { ...t, content: newContent, dirty: true } : t,
    ));

    // Auto-save debounce
    if (editorSettings.autoSave) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        saveActive(activeTab, newContent);
      }, 500);
    }
  }, [activeTab, editorSettings.autoSave, saveActive]);

  const closeTab = useCallback((path: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      if (activeTab === path) setActiveTab(next[next.length - 1]?.path ?? null);
      return next;
    });
  }, [activeTab]);

  const activeTabData = tabs.find((t) => t.path === activeTab);

  // Update window title
  useEffect(() => {
    if (activeTabData) {
      document.title = `Script Editor — ${activeTabData.name}${activeTabData.dirty ? ' •' : ''}`;
    } else {
      document.title = 'Script Editor';
    }
  }, [activeTabData]);

  // ── Styles ─────────────────────────────────────────────────

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    background: '#161b22',
    borderBottom: '1px solid #30363d',
    height: 36,
    flexShrink: 0,
    gap: 0,
    overflowX: 'auto',
  };

  const tabStyle = (active: boolean, dirty: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 12px',
    height: '100%',
    background: active ? '#0d1117' : 'transparent',
    borderRight: '1px solid #30363d',
    borderBottom: active ? '2px solid #58a6ff' : '2px solid transparent',
    color: active ? '#e6edf3' : '#8b949e',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  });

  const closeBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 10,
    padding: '0 2px',
    lineHeight: 1,
    opacity: 0.6,
  };

  const emptyStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#484f58',
    fontSize: 13,
    fontFamily: 'var(--font-mono, monospace)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117' }}>
      {/* Tab bar */}
      <div style={toolbarStyle}>
        {tabs.map((tab) => (
          <div
            key={tab.path}
            style={tabStyle(tab.path === activeTab, tab.dirty)}
            onClick={() => setActiveTab(tab.path)}
          >
            <SvgIcon svg={terminalSvg} size={11} color={tab.path === activeTab ? '#58a6ff' : '#484f58'} />
            <span>{tab.name}{tab.dirty ? ' •' : ''}</span>
            <button
              style={closeBtnStyle}
              onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
              title="Close tab"
            >
              <SvgIcon svg={xSvg} size={9} color="currentColor" />
            </button>
          </div>
        ))}
        {tabs.length === 0 && (
          <span style={{ padding: '0 12px', color: '#484f58', fontSize: 12 }}>
            No files open
          </span>
        )}
      </div>

      {/* Editor area */}
      {activeTabData ? (
        <MonacoEditor
          height="100%"
          language={getLanguage(activeTabData.path)}
          value={activeTabData.content}
          theme={editorSettings.theme}
          onMount={handleMonacoMount}
          onChange={handleEditorChange}
          options={{
            fontSize: editorSettings.fontSize,
            fontFamily: editorSettings.fontFamily,
            fontLigatures: true,
            minimap: { enabled: editorSettings.minimap },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: editorSettings.wordWrap ? 'on' : 'off',
          }}
        />
      ) : (
        <div style={emptyStyle}>
          Open a script from the Asset Browser or double-click a .ts/.js file
        </div>
      )}
    </div>
  );
};

// ── Mount ─────────────────────────────────────────────────────

const root = createRoot(document.getElementById('script-root')!);
root.render(<App />);
