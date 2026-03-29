// ============================================================
// FluxionJS V3 — FUI Editor Standalone Window Entry Point
// Multi-tab architecture: each .fui file opens as a tab.
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { FuiEditor } from './components/panels/FuiEditor';
import { SvgIcon } from './ui/SvgIcon';
import layoutSvg from './ui/icons/layout.svg';
import xSvg from './ui/icons/x.svg';
import { ElectronFileSystem, setGlobalFileSystem } from '../src/filesystem';
import { projectManager } from '../src/project/ProjectManager';
import { normalizePath } from '../src/filesystem/FileSystem';

// Initialize filesystem before React renders
const _fs = new ElectronFileSystem((window as any).fluxionAPI);
setGlobalFileSystem(_fs);

// Read initial filePath from URL query string (set by Electron main process)
const params = new URLSearchParams(window.location.search);
const initialFilePath = params.get('filePath') || '';

// Derive project root by walking up to find .fluxproj
(async () => {
  if (!initialFilePath) return;
  let dir = normalizePath(initialFilePath);
  dir = dir.substring(0, dir.lastIndexOf('/'));
  while (dir && dir.length > 3) {
    try {
      const entries = await _fs.readDir(dir);
      if (entries.some((e) => e.name.endsWith('.fluxproj'))) {
        const projFile = entries.find((e) => e.name.endsWith('.fluxproj'))!;
        await projectManager.openProject(normalizePath(projFile.path));
        break;
      }
    } catch { /* ignore */ }
    const parent = dir.substring(0, dir.lastIndexOf('/'));
    if (parent === dir) break;
    dir = parent;
  }
})();

// ── Tab management ──

interface TabInfo {
  id: string;
  filePath: string;
  label: string;
}

function fileLabel(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop()?.replace('.fui', '') || filePath;
}

const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabInfo[]>(() => {
    if (!initialFilePath) return [];
    return [{ id: '1', filePath: initialFilePath, label: fileLabel(initialFilePath) }];
  });
  const [activeTabId, setActiveTabId] = useState<string>(initialFilePath ? '1' : '');
  const nextIdRef = useRef(2);
  const dragTabRef = useRef<string | null>(null);

  const openTab = useCallback((filePath: string) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.filePath === filePath);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const id = String(nextIdRef.current++);
      setActiveTabId(id);
      return [...prev, { id, filePath, label: fileLabel(filePath) }];
    });
  }, []);

  // Listen for 'open-tab' IPC from main process
  useEffect(() => {
    const handler = (_: any, filePath: string) => openTab(filePath);
    (window as any).fluxionAPI?.onFuiOpenTab?.(handler);
    return () => { (window as any).fluxionAPI?.offFuiOpenTab?.(); };
  }, [openTab]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) {
        window.fluxionAPI?.close();
        return prev;
      }
      setActiveTabId((curr) => {
        if (curr !== tabId) return curr;
        return next[Math.min(idx, next.length - 1)].id;
      });
      return next;
    });
  }, []);

  const handleDragStart = useCallback((tabId: string) => { dragTabRef.current = tabId; }, []);
  const handleDragEnd = useCallback(() => { dragTabRef.current = null; }, []);
  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragTabRef.current || dragTabRef.current === targetId) return;
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.id === dragTabRef.current);
      const to = prev.findIndex((t) => t.id === targetId);
      if (from < 0 || to < 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }, []);

  if (tabs.length === 0) {
    return (
      <div style={{ color: '#888', padding: 20, fontFamily: 'system-ui' }}>
        No FUI files open.
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#181825', borderBottom: '1px solid #313244',
        height: 34, minHeight: 34, userSelect: 'none', paddingLeft: 4, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflow: 'auto', flex: 1, scrollbarWidth: 'none' as any }}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              draggable
              onDragStart={() => handleDragStart(tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px', height: 34, cursor: 'pointer',
                fontSize: 12, fontFamily: 'system-ui, sans-serif',
                color: tab.id === activeTab.id ? '#cdd6f4' : '#6c7086',
                background: tab.id === activeTab.id ? '#1e1e2e' : 'transparent',
                borderRight: '1px solid #313244', whiteSpace: 'nowrap',
                transition: 'background 0.1s, color 0.1s',
              }}
              title={tab.filePath}
            >
              <SvgIcon svg={layoutSvg} size={12} color="#58a6ff" />
              {tab.label}
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 3, color: '#6c7086', marginLeft: 4, cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#45475a'; (e.currentTarget as HTMLElement).style.color = '#cdd6f4'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#6c7086'; }}
                title="Close tab"
              >
                <SvgIcon svg={xSvg} size={10} color="currentColor" />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Editor */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{ position: 'absolute', inset: 0, display: tab.id === activeTab.id ? 'block' : 'none' }}
          >
            <FuiEditor filePath={tab.filePath} onClose={() => closeTab(tab.id)} />
          </div>
        ))}
      </div>
    </div>
  );
};

try {
  const container = document.getElementById('fui-root');
  if (container) {
    createRoot(container).render(<App />);
  }
} catch (err: any) {
  console.error('FUI window mount error:', err);
}
