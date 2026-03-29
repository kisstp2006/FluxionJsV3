// ============================================================
// FluxionJS V3 — Sprite Reactive Inspector
// Unity-style event group inspector for SpriteReactiveComponent.
// Shows OnClick / OnPointerEnter / OnPointerExit / OnPointerDown / OnPointerUp
// event groups, each with a list of (entity, method) entries.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Icons } from '../../../ui';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import {
  SpriteReactiveComponent,
  SpriteReactiveEventGroup,
  SpriteReactiveEntry,
  ScriptComponent,
} from '../../../../src/core/Components';
import { ComponentSection } from './ComponentSection';
import { ComponentInspectorRegistry } from '../../../core/ComponentInspectorRegistry';
import { compileScript } from '../../../../src/scripting/ScriptCompiler';
import { getFileSystem } from '../../../../src/filesystem';
import { projectManager } from '../../../../src/project/ProjectManager';

// ── Helpers ──────────────────────────────────────────────────

const EXCLUDED_METHODS = new Set([
  'constructor', 'start', 'update', 'fixedUpdate', 'lateUpdate', 'onDestroy',
  'startCoroutine', 'stopCoroutine', 'getComponent', 'getComponentOf',
  'hasComponent', 'addComponent', 'removeComponent',
]);

function getProtoMethods(instance: any): string[] {
  const methods: string[] = [];
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key.startsWith('_')) continue;
      if (EXCLUDED_METHODS.has(key)) continue;
      if (typeof proto[key] !== 'function') continue;
      if (!methods.includes(key)) methods.push(key);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return methods.sort();
}

async function getMethodsFromScript(scriptPath: string): Promise<string[]> {
  try {
    const fs = getFileSystem();
    let absPath: string;
    try { absPath = projectManager.resolvePath(scriptPath); } catch { absPath = scriptPath; }
    const source = await fs.readFile(absPath);

    if (scriptPath.endsWith('.lua')) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FluxionBehaviour } = await import('../../../../src/scripting/FluxionBehaviour');
    const { EntityRef } = await import('../../../../src/scripting/EntityRef');
    const { FuiRef } = await import('../../../../src/scripting/FuiRef');
    const { MaterialRef } = await import('../../../../src/scripting/MaterialRef');
    const { TextureRef } = await import('../../../../src/scripting/TextureRef');

    const mod: { default: any } = { default: null };
    try {
      // eslint-disable-next-line no-new-func
      new Function('exports', 'FluxionBehaviour', 'FluxionScript', 'EntityRef', 'FuiRef', 'MaterialRef', 'TextureRef', 'console', compileScript(source, absPath))(
        mod, FluxionBehaviour, FluxionBehaviour, EntityRef, FuiRef, MaterialRef, TextureRef, console,
      );
    } catch { return []; }
    if (!mod.default) return [];
    try {
      const probe = new mod.default();
      return getProtoMethods(probe);
    } catch { return []; }
  } catch { return []; }
}

// ── Entity method picker ──────────────────────────────────────

const MethodSelect: React.FC<{
  targetEntityId: EntityId | null;
  value: string;
  onChange: (v: string) => void;
}> = ({ targetEntityId, value, onChange }) => {
  const engine = useEngine();
  const [methods, setMethods] = useState<string[]>([]);

  useEffect(() => {
    setMethods([]);
    if (!targetEntityId || !engine) return;
    const ecs = engine.engine.ecs;

    // First try live instances
    const scriptComp = ecs.getComponent<ScriptComponent>(targetEntityId, 'Script');
    if (scriptComp) {
      const live: string[] = [];
      for (const [, inst] of (scriptComp as any)._instances as Map<string, any>) {
        for (const m of getProtoMethods(inst)) {
          if (!live.includes(m)) live.push(m);
        }
      }
      if (live.length > 0) { setMethods(live.sort()); return; }

      // Fall back to static analysis
      (async () => {
        const all: string[] = [];
        for (const entry of scriptComp.scripts) {
          if (!entry.path) continue;
          const ms = await getMethodsFromScript(entry.path);
          for (const m of ms) { if (!all.includes(m)) all.push(m); }
        }
        setMethods(all.sort());
      })();
    }
  }, [targetEntityId, engine]);

  const sel: React.CSSProperties = {
    flex: 1, minWidth: 0,
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: value ? 'var(--text-primary)' : 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 5px',
  };

  if (methods.length === 0) {
    return (
      <input
        style={sel}
        value={value}
        placeholder="No Function"
        onChange={e => onChange(e.target.value)}
      />
    );
  }

  return (
    <select style={sel} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">No Function</option>
      {methods.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
  );
};

// ── Entity picker ─────────────────────────────────────────────

const EntityPick: React.FC<{
  entityId: EntityId | null;
  onChange: (id: EntityId | null) => void;
}> = ({ entityId, onChange }) => {
  const engine = useEngine();
  const ecs = engine?.engine?.ecs;
  if (!ecs) return null;

  const candidates: Array<{ id: EntityId; name: string }> = [];
  for (const id of ecs.getAllEntities()) {
    candidates.push({ id, name: ecs.getEntityName(id) || `Entity ${id}` });
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name));

  const s: React.CSSProperties = {
    flex: '0 0 120px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: entityId == null ? 'var(--text-muted)' : 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '3px 5px',
  };

  return (
    <select style={s} value={entityId ?? ''} onChange={e => {
      const v = e.target.value;
      onChange(v === '' ? null : Number(v) as EntityId);
    }}>
      <option value="">None (Object)</option>
      {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
};

// ── Single event group ────────────────────────────────────────

const EventGroup: React.FC<{
  label: string;
  group: SpriteReactiveEventGroup;
  onChange: (g: SpriteReactiveEventGroup) => void;
}> = ({ label, group, onChange }) => {
  const setEntry = (i: number, patch: Partial<SpriteReactiveEntry>) => {
    const entries = group.entries.map((e, idx) => idx === i ? { ...e, ...patch } : e);
    onChange({ entries });
  };
  const addEntry = () => onChange({ entries: [...group.entries, { targetEntityId: null, methodName: '' }] });
  const removeEntry = (i: number) => onChange({ entries: group.entries.filter((_, idx) => idx !== i) });

  const sectionStyle: React.CSSProperties = {
    marginBottom: 6,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 6px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-input)',
  };

  const modeStyle: React.CSSProperties = {
    flex: '0 0 90px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text-muted)',
    fontSize: 10,
    padding: '3px 4px',
  };

  const btnStyle: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '1px 6px',
    lineHeight: 1.4,
  };

  const footerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 4,
    padding: '3px 6px',
    background: 'var(--bg-panel)',
  };

  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>{label}</div>
      {group.entries.map((entry, i) => (
        <div key={i} style={rowStyle}>
          <select style={modeStyle} value="RuntimeOnly" onChange={() => {}}>
            <option value="RuntimeOnly">Runtime Only</option>
          </select>
          <EntityPick
            entityId={entry.targetEntityId}
            onChange={id => setEntry(i, { targetEntityId: id })}
          />
          <MethodSelect
            targetEntityId={entry.targetEntityId}
            value={entry.methodName}
            onChange={v => setEntry(i, { methodName: v })}
          />
          <button style={{ ...btnStyle, color: 'var(--text-muted)' }} onClick={() => removeEntry(i)} title="Remove">{Icons.close}</button>
        </div>
      ))}
      <div style={footerStyle}>
        <button style={btnStyle} onClick={addEntry} title="Add listener">+</button>
        <button style={btnStyle} onClick={() => group.entries.length > 0 && removeEntry(group.entries.length - 1)} title="Remove last listener">-</button>
      </div>
    </div>
  );
};

// ── Main inspector ────────────────────────────────────────────

const EVENT_GROUPS: Array<{ key: keyof SpriteReactiveComponent; label: string }> = [
  { key: 'onClick',        label: 'On Click ()' },
  { key: 'onPointerEnter', label: 'On Pointer Enter ()' },
  { key: 'onPointerExit',  label: 'On Pointer Exit ()' },
  { key: 'onPointerDown',  label: 'On Pointer Down ()' },
  { key: 'onPointerUp',    label: 'On Pointer Up ()' },
];

const SpriteReactiveInspector: React.FC<{ entity: EntityId; onRemoved: () => void }> = ({ entity, onRemoved }) => {
  const engine = useEngine();
  const [, forceUpdate] = useState(0);
  const refresh = useCallback(() => forceUpdate(v => v + 1), []);

  if (!engine) return null;
  const comp = engine.engine.ecs.getComponent<SpriteReactiveComponent>(entity, 'SpriteReactive');
  if (!comp) return null;

  const setGroup = (key: keyof SpriteReactiveComponent, g: SpriteReactiveEventGroup) => {
    (comp as any)[key] = g;
    refresh();
  };

  return (
    <ComponentSection
      componentType="SpriteReactive"
      entity={entity}
      onRemoved={onRemoved}
    >
      {EVENT_GROUPS.map(({ key, label }) => (
        <EventGroup
          key={key}
          label={label}
          group={(comp as any)[key] as SpriteReactiveEventGroup}
          onChange={g => setGroup(key, g)}
        />
      ))}
    </ComponentSection>
  );
};

// Self-register
ComponentInspectorRegistry.register('SpriteReactive', SpriteReactiveInspector);

export { SpriteReactiveInspector };
