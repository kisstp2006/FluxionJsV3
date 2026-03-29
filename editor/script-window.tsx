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
const _fs = new ElectronFileSystem((window as any).fluxionAPI);
setGlobalFileSystem(_fs);

// Read initial file from URL
const params = new URLSearchParams(window.location.search);
const initialFilePath = params.get('filePath') || '';

// Module-level ref so the project-detect IIFE can call injectGeneratedLib
// once the project directory is known (Monaco may not be ready yet at that point,
// so we queue the call and replay it when Monaco mounts).
let _pendingDts: string | null = null;
let _injectLib: ((dts: string) => void) | null = null;

function _applyDts(dts: string) {
  _pendingDts = dts;
  _injectLib?.(dts);
}

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
        // Load the generated d.ts now that projectDir is known
        const projectDir = projectManager.projectDir;
        if (projectDir) {
          try {
            const dts = await _fs.readFile(`${projectDir}/.fluxion/api/fluxion.d.ts`);
            if (dts) _applyDts(dts);
          } catch { /* not generated yet */ }
        }
        break;
      }
    } catch {}
    dir = dir.substring(0, dir.lastIndexOf('/'));
  }
})();


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
  // Disposable for the generated fluxion.d.ts extra lib — replaced on API updates
  const generatedLibRef = useRef<{ dispose(): void } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Register FluxionBehaviour type declarations once Monaco is loaded
  const handleMonacoMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (!libRegistered.current) {
      libRegistered.current = true;

      // Wire the module-level inject callback now that Monaco is ready.
      // If the project IIFE already resolved a d.ts, apply it immediately.
      _injectLib = (dts: string) => {
        generatedLibRef.current?.dispose();
        generatedLibRef.current = monaco.languages.typescript.typescriptDefaults.addExtraLib(
          dts,
          'ts:fluxion/fluxion.d.ts',
        );
      };
      if (_pendingDts) _injectLib(_pendingDts);

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
          label: 'start',
          detail: 'Lifecycle — called once when play begins',
          insert: 'start() {\n\t$0\n}',
        },
        {
          label: 'update',
          detail: 'Lifecycle — called every frame',
          insert: 'update(dt: number) {\n\t$0\n}',
        },
        {
          label: 'fixedUpdate',
          detail: 'Lifecycle — called at fixed physics rate',
          insert: 'fixedUpdate(dt: number) {\n\t$0\n}',
        },
        {
          label: 'lateUpdate',
          detail: 'Lifecycle — called after all update() calls',
          insert: 'lateUpdate(dt: number) {\n\t$0\n}',
        },
        {
          label: 'onDestroy',
          detail: 'Lifecycle — called when entity is destroyed',
          insert: 'onDestroy() {\n\t$0\n}',
        },
        {
          label: 'onEnable',
          detail: 'Lifecycle — called when script becomes enabled',
          insert: 'onEnable() {\n\t$0\n}',
        },
        {
          label: 'onDisable',
          detail: 'Lifecycle — called when script becomes disabled',
          insert: 'onDisable() {\n\t$0\n}',
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

  // ── Generated type lib (fluxion.d.ts from the active project) ──────────
  // Routes through _applyDts so the module-level ref and pending cache stay
  // in sync regardless of whether Monaco was ready when the d.ts arrived.
  const injectGeneratedLib = useCallback((dts: string) => {
    _applyDts(dts);
  }, []);

  // Hot-swap the generated lib whenever ApiEmitter finishes a new emit
  useEffect(() => {
    const handler = (e: Event) => {
      const dts = (e as CustomEvent<{ dts: string }>).detail?.dts;
      if (dts) injectGeneratedLib(dts);
    };
    window.addEventListener('fluxion:api-updated', handler);
    return () => window.removeEventListener('fluxion:api-updated', handler);
  }, [injectGeneratedLib]);

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

  // Re-register Ctrl+S every time saveActive changes so it always sees the
  // current activeTab and tabs state (avoids stale-closure bug).
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const disposable = editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActive();
    });
    return () => disposable?.dispose?.();
  }, [saveActive]);

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
