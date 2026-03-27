// ============================================================
// FluxionJS V3 — Script Editor Standalone Window Entry Point
// Monaco-based TypeScript/JavaScript editor for .ts/.js scripts.
// Supports multiple open files via tabs; saves via fluxionAPI.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import MonacoEditor from '@monaco-editor/react';
import './styles/globals.css';
import { ElectronFileSystem, setGlobalFileSystem } from '../src/filesystem';
import { projectManager } from '../src/project/ProjectManager';
import { normalizePath } from '../src/filesystem/FileSystem';

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

  // Component access
  /**
   * Get a component from this entity.
   * Common types: 'Transform', 'MeshRenderer', 'Rigidbody', 'Collider', 'Light', 'AudioSource', 'Camera', 'Script', 'Particle'
   */
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

declare const window: Window & {
  fluxionAPI: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, data: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
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

const App: React.FC = () => {
  const [tabs, setTabs] = useState<ScriptTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const libRegistered = useRef(false);

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
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        module: monaco.languages.typescript.ModuleKind.CommonJS,
        strict: false,
        noEmitOnError: false,
      });
    }

    // Ctrl+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActive();
    });
  }, []);

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

  const saveActive = useCallback(async () => {
    if (!activeTab) return;
    const tab = tabs.find((t) => t.path === activeTab);
    if (!tab) return;
    try {
      await window.fluxionAPI.writeFile(tab.path, tab.content);
      setTabs((prev) => prev.map((t) => t.path === activeTab ? { ...t, dirty: false } : t));
      document.title = `Script Editor — ${tab.name}`;
    } catch (err) {
      console.error('[ScriptEditor] Failed to save:', err);
    }
  }, [activeTab, tabs]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTab) return;
    setTabs((prev) => prev.map((t) =>
      t.path === activeTab ? { ...t, content: value ?? '', dirty: true } : t,
    ));
  }, [activeTab]);

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
            <span>{tab.name}{tab.dirty ? ' •' : ''}</span>
            <button
              style={closeBtnStyle}
              onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
              title="Close tab"
            >
              ✕
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
          theme="vs-dark"
          onMount={handleMonacoMount}
          onChange={handleEditorChange}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            fontLigatures: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
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
