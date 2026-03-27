// ============================================================
// FluxionJS V3 — Script Inspector
// Shows and edits ScriptComponent entries.
// Each entry: script path picker, enable toggle, open buttons,
// and auto-generated property inputs from the class fields.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Section, PropertyRow, NumberInput, Checkbox, AssetInput } from '../../../ui';
import { useEditor, useEngine } from '../../../core/EditorContext';
import { EntityId, markDirty } from '../../../../src/core/ECS';
import { ScriptComponent, ScriptEntry } from '../../../../src/core/Components';
import { FluxionScript } from '../../../../src/core/FluxionScript';
import { compileScript } from '../../../../src/core/ScriptCompiler';
import { RemoveComponentButton } from './RemoveComponentButton';
import { getFileSystem } from '../../../../src/filesystem';
import { projectManager } from '../../../../src/project/ProjectManager';

// ── Helpers ──────────────────────────────────────────────────

declare const window: Window & {
  fluxionAPI: {
    openPath: (path: string) => Promise<void>;
    openScriptEditor: (path: string) => Promise<void>;
  };
};

function loadScriptClass(compiledJs: string): any {
  const mod: { default: any } = { default: null };
  try {
    // eslint-disable-next-line no-new-func
    new Function('exports', 'FluxionScript', 'console', compiledJs)(mod, FluxionScript, console);
  } catch {
    return null;
  }
  return mod.default;
}

function getScriptProperties(
  ScriptClass: any,
  overrides: Record<string, any>,
): Array<{ key: string; type: 'number' | 'string' | 'boolean'; value: any; default: any }> {
  if (!ScriptClass) return [];
  try {
    const probe = new ScriptClass();
    // Inject minimal stubs so the constructor doesn't crash on system calls.
    // All keys start with _ so they are filtered from inspector display.
    Object.assign(probe, { _ecs: null, _engine: null, _input: null, _renderer: null, _audio: null });
    return Object.keys(probe)
      .filter((k) => !k.startsWith('_') && typeof probe[k] !== 'function')
      .map((k) => ({
        key: k,
        type: typeof probe[k] as 'number' | 'string' | 'boolean',
        default: probe[k],
        value: k in overrides ? overrides[k] : probe[k],
      }))
      .filter((p) => p.type === 'number' || p.type === 'string' || p.type === 'boolean');
  } catch {
    return [];
  }
}

// ── Per-entry sub-component ───────────────────────────────────

const ScriptEntryRow: React.FC<{
  entry: ScriptEntry;
  index: number;
  onChange: (index: number, updated: Partial<ScriptEntry>) => void;
  onRemove: (index: number) => void;
}> = ({ entry, index, onChange, onRemove }) => {
  const [scriptClass, setScriptClass] = useState<any>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load + compile the script whenever the path changes
  useEffect(() => {
    if (!entry.path) {
      setScriptClass(null);
      setCompileError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setCompileError(null);

    (async () => {
      try {
        const fs = getFileSystem();
        let absPath: string;
        try {
          absPath = projectManager.resolvePath(entry.path);
        } catch {
          absPath = entry.path;
        }
        const source = await fs.readFile(absPath);
        if (cancelled) return;
        const compiled = compileScript(source, absPath);
        const cls = loadScriptClass(compiled);
        if (!cancelled) {
          setScriptClass(cls);
          setCompileError(cls ? null : 'No default export found.');
        }
      } catch (err: any) {
        if (!cancelled) {
          setScriptClass(null);
          setCompileError(String(err?.message ?? err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [entry.path]);

  const properties = getScriptProperties(scriptClass, entry.properties);

  const setOverride = useCallback((key: string, value: any) => {
    onChange(index, { properties: { ...entry.properties, [key]: value } });
  }, [entry.properties, index, onChange]);

  const openInSystemEditor = useCallback(() => {
    if (!entry.path) return;
    try {
      const abs = projectManager.resolvePath(entry.path);
      window.fluxionAPI.openPath(abs);
    } catch {
      window.fluxionAPI.openPath(entry.path);
    }
  }, [entry.path]);

  const openInMonaco = useCallback(() => {
    if (!entry.path) return;
    try {
      const abs = projectManager.resolvePath(entry.path);
      window.fluxionAPI.openScriptEditor(abs);
    } catch {
      window.fluxionAPI.openScriptEditor(entry.path);
    }
  }, [entry.path]);

  const rowStyle: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 6px',
    background: 'var(--bg-panel)',
    borderBottom: entry.path ? '1px solid var(--border)' : undefined,
  };

  const btnStyle: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 10,
    padding: '1px 5px',
    lineHeight: 1.4,
    flexShrink: 0,
  };

  return (
    <div style={rowStyle}>
      {/* Header row */}
      <div style={headerStyle}>
        <Checkbox
          checked={entry.enabled}
          onChange={(v) => onChange(index, { enabled: v })}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <AssetInput
            value={entry.path || null}
            assetType={['script']}
            placeholder="Select script..."
            onChange={(v) => onChange(index, { path: v, properties: {} })}
          />
        </div>
        {entry.path && (
          <>
            <button style={btnStyle} onClick={openInMonaco} title="Open in built-in editor">✎</button>
            <button style={btnStyle} onClick={openInSystemEditor} title="Open in system editor (VS Code)">↗</button>
          </>
        )}
        <button
          onClick={() => onRemove(index)}
          title="Remove script"
          style={{ ...btnStyle, color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      {/* Properties / status */}
      {entry.path && (
        <div style={{ padding: '4px 0' }}>
          {loading && (
            <div style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: 11 }}>
              Loading…
            </div>
          )}
          {!loading && compileError && (
            <div style={{ padding: '4px 8px', color: '#ef5350', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              ⚠ {compileError}
            </div>
          )}
          {!loading && !compileError && properties.length === 0 && scriptClass && (
            <div style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: 11 }}>
              No exposed properties.
            </div>
          )}
          {!loading && !compileError && properties.map((p) => (
            <PropertyRow key={p.key} label={p.key}>
              {p.type === 'number' && (
                <NumberInput
                  value={p.value as number}
                  step={Number.isInteger(p.default) ? 1 : 0.1}
                  onChange={(v) => setOverride(p.key, v)}
                />
              )}
              {p.type === 'boolean' && (
                <Checkbox
                  checked={p.value as boolean}
                  onChange={(v) => setOverride(p.key, v)}
                />
              )}
              {p.type === 'string' && (
                <input
                  value={p.value as string}
                  onChange={(e) => setOverride(p.key, e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    padding: '3px 6px',
                  }}
                />
              )}
            </PropertyRow>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Inspector ────────────────────────────────────────────

export const ScriptInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const { dispatch } = useEditor();
  const [, forceUpdate] = useState(0);

  if (!engine) return null;

  const comp = engine.engine.ecs.getComponent<ScriptComponent>(entity, 'Script');
  if (!comp) return null;

  const update = () => forceUpdate((n) => n + 1);

  const persist = () => {
    markDirty(comp);
    dispatch({ type: 'SET_SCENE_DIRTY', dirty: true });
    update();
  };

  const handleChange = (index: number, partial: Partial<ScriptEntry>) => {
    const entry = comp.scripts[index];
    if (!entry) return;

    const pathChanged = partial.path !== undefined && partial.path !== entry.path;

    Object.assign(entry, partial);

    // If the path changed, drop the old instance so ScriptSystem reloads it
    if (pathChanged) {
      const oldPath = partial.path !== undefined ? entry.path : (partial as any)._prevPath;
      comp._instances.delete(entry.path);
      comp._loading.delete(entry.path);
      // Also clear the stale loaded path
      for (const [p] of comp._instances) {
        if (p === entry.path) comp._instances.delete(p);
      }
    }

    persist();
  };

  const handleRemoveEntry = (index: number) => {
    const entry = comp.scripts[index];
    if (entry) {
      const inst = comp._instances.get(entry.path);
      try { inst?.onDestroy?.(); } catch {}
      comp._instances.delete(entry.path);
      comp._loading.delete(entry.path);
    }
    comp.scripts.splice(index, 1);
    persist();
  };

  const handleAddScript = () => {
    comp.scripts.push({ path: '', enabled: true, properties: {} });
    persist();
  };

  return (
    <Section title="⌨  Script" defaultOpen icon="⌨">
      {comp.scripts.map((entry, i) => (
        <ScriptEntryRow
          key={i}
          entry={entry}
          index={i}
          onChange={handleChange}
          onRemove={handleRemoveEntry}
        />
      ))}

      <button
        onClick={handleAddScript}
        style={{
          width: '100%',
          background: 'none',
          border: '1px dashed var(--border)',
          borderRadius: 4,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 11,
          padding: '4px 0',
          marginTop: 2,
        }}
      >
        + Add Script
      </button>

      <div style={{ marginTop: 6 }}>
        <RemoveComponentButton entity={entity} componentType="Script" onRemoved={onRemoved} />
      </div>
    </Section>
  );
};
