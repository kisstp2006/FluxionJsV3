// ============================================================
// FluxionJS V3 — Build Popup
// Compact floating popup triggered from the Toolbar.
// Shows build settings + run/cancel button + mini console.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons, PathInput } from '../../ui';
import { buildService } from '../../../src/project/BuildService';
import type { BuildEvent } from '../../../src/project/BuildService';
import { projectManager } from '../../../src/project/ProjectManager';
import type { BuildSettings } from '../../../src/project/ProjectManager';

// ── Styles ────────────────────────────────────────────────────

const OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
};

const POPUP: React.CSSProperties = {
  position: 'fixed',
  top: 42,
  right: 8,
  width: 420,
  maxHeight: 'calc(100vh - 60px)',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 2001,
  overflow: 'hidden',
};

const HEADER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  gap: 8,
  flexShrink: 0,
  background: 'var(--bg-panel)',
};

const SECTION: React.CSSProperties = {
  padding: '10px 12px',
  overflowY: 'auto',
  flex: 1,
};

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: 8,
  gap: 8,
};

const LABEL: React.CSSProperties = {
  width: 110,
  flexShrink: 0,
  fontSize: 11,
  color: 'var(--text-muted)',
};

const INPUT: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text)',
  padding: '3px 6px',
  fontSize: 11,
};

const BTN = (variant: 'primary' | 'secondary' | 'danger', small = false): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: small ? '3px 10px' : '5px 14px',
  border: 'none',
  borderRadius: 3,
  fontSize: small ? 11 : 12,
  cursor: 'pointer',
  background:
    variant === 'primary' ? 'var(--accent)'
    : variant === 'danger' ? '#c0392b'
    : 'var(--bg-input)',
  color: variant === 'secondary' ? 'var(--text)' : '#fff',
  fontWeight: variant === 'primary' ? 600 : 400,
});

const CONSOLE: React.CSSProperties = {
  background: '#1a1a1a',
  fontFamily: 'monospace',
  fontSize: 10,
  overflowY: 'auto',
  padding: '6px 10px',
  color: '#cdd9e5',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: 180,
  flexShrink: 0,
  borderTop: '1px solid var(--border)',
};

const FOOTER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderTop: '1px solid var(--border)',
  background: 'var(--bg-panel)',
  flexShrink: 0,
};

// ── Types ─────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  type: 'stdout' | 'stderr' | 'info' | 'done' | 'error';
  text: string;
}

let logId = 0;

// ── Component ─────────────────────────────────────────────────

export const BuildPopup: React.FC<{ onClose: () => void }> = ({ onClose }) => {
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

  // Sync when project changes
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

  // ── Build state ──────────────────────────────────────────────
  const [building, setBuilding] = useState(false);
  const [jobId, setJobId]       = useState<string | null>(null);
  const [log, setLog]           = useState<LogEntry[]>([]);
  const [showLog, setShowLog]   = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const append = useCallback((type: LogEntry['type'], text: string) => {
    setLog(prev => [...prev, { id: ++logId, type, text }]);
    setShowLog(true);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const handleBuild = async () => {
    const projectDir = projectManager.projectDir;
    if (!projectDir) { append('error', 'No project loaded.'); return; }

    const api = (window as any).fluxionAPI;
    const engineRoot: string = await api?.getEngineRoot?.() ?? '';
    if (!engineRoot) { append('error', 'Cannot determine engine root.'); return; }

    setBuilding(true);
    setLog([]);
    setShowLog(true);
    append('info', `▶ Build: ${settings.gameName || config?.name} v${settings.gameVersion}`);
    append('info', `  Output → ${settings.outputDir}`);

    try {
      const prepared = await buildService.prepare({
        projectDir,
        engineRoot,
        settings,
        onProgress: (ev: BuildEvent) => {
          if (ev.type === 'progress') append('info', '  ' + ev.data);
        },
      });

      append('info', 'Starting webpack…');

      api?.build?.onEvent((ev: { jobId: string; type: string; data: string }) => {
        if (ev.type === 'stdout')      append('stdout', ev.data.trimEnd());
        else if (ev.type === 'stderr') append('stderr', ev.data.trimEnd());
        else if (ev.type === 'done') {
          append('done', ev.data);
          buildService.writeBuildManifest(prepared.outputDir, settings).catch(() => {});
          setBuilding(false);
          setJobId(null);
          api?.build?.offEvent();
        } else if (ev.type === 'error') {
          append('error', ev.data);
          setBuilding(false);
          setJobId(null);
          api?.build?.offEvent();
        }
      });

      const id: string = await api?.build?.run(engineRoot, prepared.configPath);
      setJobId(id ?? null);

    } catch (e: any) {
      append('error', String(e?.message ?? e));
      setBuilding(false);
    }
  };

  const handleCancel = async () => {
    const api = (window as any).fluxionAPI;
    if (jobId) {
      await api?.build?.cancel(jobId);
      api?.build?.offEvent();
    }
    append('info', 'Build cancelled.');
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

  // Close on outside click
  const popupRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Click-away overlay */}
      <div style={OVERLAY} onMouseDown={onClose} />

      {/* Popup */}
      <div style={POPUP} ref={popupRef} onMouseDown={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={HEADER}>
          <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>{Icons.download}</span>
          <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Build — Web (HTML5)</span>
          {building && (
            <span style={{ fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              ⚙ Building…
            </span>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
            title="Close"
          >×</button>
        </div>

        {/* Settings */}
        <div style={SECTION}>
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
          <div style={{ display: 'flex', gap: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.minify}
                onChange={e => updateSetting('minify', e.target.checked)} />
              Minify
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.includeSourceMaps}
                onChange={e => updateSetting('includeSourceMaps', e.target.checked)} />
              Source Maps
            </label>
          </div>
        </div>

        {/* Mini console */}
        {showLog && (
          <div ref={logRef} style={CONSOLE}>
            {log.map(entry => (
              <div key={entry.id} style={{
                color: entry.type === 'error'  ? '#f87171'
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

        {/* Footer */}
        <div style={FOOTER}>
          {!building ? (
            <button style={BTN('primary')} onClick={handleBuild} disabled={!projectManager.isLoaded}>
              {Icons.play} Build
            </button>
          ) : (
            <button style={BTN('danger')} onClick={handleCancel}>
              {Icons.stop} Cancel
            </button>
          )}
          <button style={BTN('secondary')} onClick={handleOpenOutput} disabled={!projectManager.isLoaded}>
            {Icons.folder} Open Output
          </button>
          <div style={{ flex: 1 }} />
          {log.length > 0 && (
            <button
              onClick={() => setShowLog(v => !v)}
              style={{ ...BTN('secondary', true), fontSize: 10 }}
            >
              {showLog ? 'Hide Log' : `Log (${log.length})`}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

// ── SettingRow ────────────────────────────────────────────────

const SettingRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={ROW}>
    <span style={LABEL}>{label}</span>
    {children}
  </div>
);
