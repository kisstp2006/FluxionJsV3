// ============================================================
// FluxionJS V3 — Build Panel
// Web (HTML5) export UI: settings form, streaming console,
// npm plugin manager.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons, PathInput } from '../../ui';
import { useEditor } from '../../core/EditorContext';
import { buildService } from '../../../src/project/BuildService';
import type { BuildEvent } from '../../../src/project/BuildService';
import { npmProjectService, FluxionPlugin } from '../../../src/project/NpmProjectService';
import { projectManager } from '../../../src/project/ProjectManager';
import type { BuildSettings } from '../../../src/project/ProjectManager';

// ── Styles ───────────────────────────────────────────────────

const ROOT: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-panel)',
  color: 'var(--text)',
  fontSize: 12,
  overflow: 'hidden',
};

const TABS_ROW: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-panel)',
  flexShrink: 0,
};

const TAB_BTN = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  color: active ? 'var(--text)' : 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 12,
});

const SECTION: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '10px 14px',
};

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
};

const LABEL: React.CSSProperties = {
  width: 130,
  flexShrink: 0,
  color: 'var(--text-muted)',
};

const INPUT: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text)',
  padding: '3px 6px',
  fontSize: 12,
};

const BTN = (variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 12px',
  border: 'none',
  borderRadius: 3,
  fontSize: 12,
  cursor: 'pointer',
  background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? '#c0392b' : 'var(--bg-input)',
  color: variant === 'secondary' ? 'var(--text)' : '#fff',
});

const LOG_AREA: React.CSSProperties = {
  flex: 1,
  background: '#0d1117',
  fontFamily: 'monospace',
  fontSize: 11,
  overflowY: 'auto',
  padding: '6px 10px',
  color: '#cdd9e5',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const TOOLBAR: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  borderTop: '1px solid var(--border)',
  flexShrink: 0,
};

// ── Log entry ────────────────────────────────────────────────

interface LogEntry {
  id: number;
  type: 'stdout' | 'stderr' | 'info' | 'done' | 'error';
  text: string;
}

let logIdCtr = 0;

// ── Component ────────────────────────────────────────────────

type PanelTab = 'settings' | 'console' | 'plugins';

export const BuildPanel: React.FC = () => {
  useEditor(); // subscribe to editor updates
  const [tab, setTab] = useState<PanelTab>('settings');

  // ── Settings state ──────────────────────────────
  const config = projectManager.config;
  const [settings, setSettings] = useState<BuildSettings>(() =>
    config?.build ?? {
      outputDir: 'Build/Web',
      startScene: 'Scenes/Main.fluxscene',
      gameName: config?.name ?? '',
      gameVersion: '1.0.0',
      minify: true,
      includeSourceMaps: false,
    }
  );

  // Sync settings when project changes
  useEffect(() => {
    if (config?.build) setSettings({ ...config.build });
  }, [config?.build]);

  const updateSetting = <K extends keyof BuildSettings>(key: K, value: BuildSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      if (projectManager.config) {
        projectManager.config.build = next;
        projectManager.markDirty();
      }
      return next;
    });
  };

  // ── Build state ─────────────────────────────────────────────
  const [building, setBuilding] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const appendLog = useCallback((type: LogEntry['type'], text: string) => {
    setLog(prev => [...prev, { id: ++logIdCtr, type, text }]);
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // ── Plugin state ────────────────────────────────────────────
  const [plugins, setPlugins] = useState<FluxionPlugin[]>([]);
  const [npmInput, setNpmInput] = useState('');
  const [npmRunning, setNpmRunning] = useState(false);

  const refreshPlugins = useCallback(async () => {
    const dir = projectManager.projectDir;
    if (!dir) return;
    const found = await npmProjectService.discoverPlugins(dir);
    setPlugins(found);
  }, []);

  useEffect(() => {
    if (tab === 'plugins') refreshPlugins();
  }, [tab, refreshPlugins]);

  // ── Build trigger ────────────────────────────────────
  const handleBuild = async () => {
    const projectDir = projectManager.projectDir;
    if (!projectDir) { appendLog('error', 'No project loaded.'); return; }

    const api = (window as any).fluxionAPI;
    const engineRoot: string = await api?.getEngineRoot?.() ?? '';
    if (!engineRoot) { appendLog('error', 'Cannot determine engine root.'); return; }

    setBuilding(true);
    setTab('console');
    setLog([]);
    appendLog('info', `▶ Build: ${settings.gameName || config?.name} v${settings.gameVersion}`);
    appendLog('info', `  Output → ${settings.outputDir}`);

    try {
      // Phase 1: generate files (BuildService)
      const prepared = await buildService.prepare({
        projectDir,
        engineRoot,
        settings,
        onProgress: (ev: BuildEvent) => {
          if (ev.type === 'progress') appendLog('info', '  ' + ev.data);
        },
      });

      appendLog('info', 'Starting webpack…');

      // Phase 2: subscribe to IPC events before starting webpack
      api?.build?.offEvent();
      api?.build?.onEvent((ev: { jobId: string; type: string; data: string }) => {
        if (ev.type === 'stdout')      appendLog('stdout', ev.data.trimEnd());
        else if (ev.type === 'stderr') appendLog('stderr', ev.data.trimEnd());
        else if (ev.type === 'done') {
          appendLog('done', ev.data);
          buildService.writeBuildManifest(prepared.outputDir, settings).catch(() => {});
          setBuilding(false);
          setJobId(null);
          api?.build?.offEvent();
        } else if (ev.type === 'error') {
          appendLog('error', ev.data);
          setBuilding(false);
          setJobId(null);
          api?.build?.offEvent();
        }
      });

      // Phase 3: spawn webpack via IPC
      const id: string = await api?.build?.run(engineRoot, prepared.configPath);
      setJobId(id ?? null);

    } catch (e: any) {
      appendLog('error', String(e?.message ?? e));
      setBuilding(false);
    }
  };

  const handleCancel = async () => {
    const api = (window as any).fluxionAPI;
    if (jobId) {
      await api?.build?.cancel(jobId);
      api?.build?.offEvent();
    }
    appendLog('info', 'Build cancelled.');
    setBuilding(false);
    setJobId(null);
  };

  const handleOpenOutput = () => {
    const projectDir = projectManager?.projectDir;
    if (!projectDir) return;
    const abs = settings.outputDir.startsWith('/') || settings.outputDir.match(/^[A-Z]:/i)
      ? settings.outputDir
      : projectDir + '/' + settings.outputDir;
    (window as any).fluxionAPI?.showItemInFolder?.(abs.replace(/\//g, '\\'));
  };

  // ── npm install ──────────────────────────────────────────────
  const handleNpmInstall = async () => {
    const projectDir = projectManager?.projectDir;
    if (!projectDir || !npmInput.trim()) return;
    const api = (window as any).fluxionAPI;
    if (!api?.npm) { appendLog('error', 'npm IPC not available.'); return; }

    setNpmRunning(true);
    setTab('console');
    appendLog('info', `Running: npm install ${npmInput.trim()}`);

    api.npm.offEvent();
    api.npm.onEvent((ev: BuildStreamEvent) => {
      if (ev.type === 'stdout') appendLog('stdout', ev.data.trimEnd());
      else if (ev.type === 'stderr') appendLog('stderr', ev.data.trimEnd());
      else {
        appendLog(ev.type as any, ev.data);
        setNpmRunning(false);
        api.npm.offEvent();
        refreshPlugins();
        setNpmInput('');
      }
    });

    await api.npm.run(projectDir, ['install', ...npmInput.trim().split(/\s+/)]);
  };

  const handleNpmKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNpmInstall();
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <div style={ROOT}>
      {/* Tab bar */}
      <div style={TABS_ROW}>
        {(['settings', 'console', 'plugins'] as PanelTab[]).map(t => (
          <button key={t} style={TAB_BTN(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {building && (
          <span style={{ padding: '6px 12px', color: 'var(--accent)', fontSize: 11 }}>
            ⚙ Building…
          </span>
        )}
      </div>

      {/* Settings tab */}
      {tab === 'settings' && (
        <div style={SECTION}>
          <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 11 }}>
            Web (HTML5) export settings — stored in the .fluxproj file.
          </div>

          <SettingRow label="Game Name">
            <input style={INPUT} value={settings.gameName}
              onChange={e => updateSetting('gameName', e.target.value)} />
          </SettingRow>
          <SettingRow label="Version">
            <input style={INPUT} value={settings.gameVersion}
              onChange={e => updateSetting('gameVersion', e.target.value)} />
          </SettingRow>
          <SettingRow label="Output Directory">
            <PathInput
              value={settings.outputDir}
              onChange={v => updateSetting('outputDir', v)}
              mode="folder"
              placeholder="Choose output folder…"
            />
          </SettingRow>
          <SettingRow label="Start Scene">
            <PathInput
              value={settings.startScene}
              onChange={v => updateSetting('startScene', v)}
              mode="file"
              filters={[{ name: 'FluxionJS Scene', extensions: ['fluxscene', 'fluxsceneb'] }]}
              placeholder="Choose start scene…"
            />
          </SettingRow>
          <SettingRow label="Minify">
            <input type="checkbox" checked={settings.minify}
              onChange={e => updateSetting('minify', e.target.checked)} />
          </SettingRow>
          <SettingRow label="Source Maps">
            <input type="checkbox" checked={settings.includeSourceMaps}
              onChange={e => updateSetting('includeSourceMaps', e.target.checked)} />
          </SettingRow>
        </div>
      )}

      {/* Console tab */}
      {tab === 'console' && (
        <div ref={logRef} style={LOG_AREA}>
          {log.length === 0 && (
            <span style={{ color: '#555' }}>Build output will appear here.</span>
          )}
          {log.map(entry => (
            <div key={entry.id} style={{
              color: entry.type === 'error' ? '#f87171'
                : entry.type === 'stderr' ? '#fbbf24'
                : entry.type === 'done'   ? '#4ade80'
                : entry.type === 'info'   ? '#7dd3fc'
                : '#cdd9e5',
            }}>
              {entry.text}
            </div>
          ))}
        </div>
      )}

      {/* Plugins tab */}
      {tab === 'plugins' && (
        <div style={SECTION}>
          <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 11 }}>
            Install npm packages that follow the <code>fluxion-plugin-*</code> naming convention
            or have <code>"fluxionPlugin": true</code> in their package.json.
          </div>

          {/* Install form */}
          <div style={{ ...ROW, marginBottom: 16 }}>
            <input
              style={{ ...INPUT, flex: 1 }}
              placeholder="fluxion-plugin-pathfinding"
              value={npmInput}
              onChange={e => setNpmInput(e.target.value)}
              onKeyDown={handleNpmKeyDown}
              disabled={npmRunning}
            />
            <button style={BTN('primary')} onClick={handleNpmInstall} disabled={npmRunning || !npmInput.trim()}>
              {Icons.download}
              Install
            </button>
            <button style={BTN('secondary')} onClick={refreshPlugins} disabled={npmRunning}>
              {Icons.refresh}
            </button>
          </div>

          {/* Installed plugins */}
          {plugins.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              No Fluxion plugins installed in this project.
            </div>
          ) : (
            plugins.map(p => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', marginBottom: 4,
                background: 'var(--bg-input)', borderRadius: 3,
              }}>
                {Icons.model}
                <span style={{ flex: 1 }}>{p.displayName}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>v{p.version}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bottom toolbar */}
      <div style={TOOLBAR}>
        {!building ? (
          <button style={BTN('primary')} onClick={handleBuild} disabled={!projectManager.isLoaded}>
            {Icons.play}
            Build
          </button>
        ) : (
          <button style={BTN('danger')} onClick={handleCancel}>
            {Icons.stop}
            Cancel
          </button>
        )}
        <button style={BTN('secondary')} onClick={handleOpenOutput} disabled={!projectManager.isLoaded}>
          {Icons.folder}
          Open Output
        </button>
      </div>
    </div>
  );
};

// ── SettingRow ────────────────────────────────────────────────

const SettingRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={ROW}>
    <span style={LABEL}>{label}</span>
    {children}
  </div>
);
