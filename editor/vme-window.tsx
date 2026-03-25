// ============================================================
// FluxionJS V3 — Visual Material Editor (Standalone Window Entry)
// Multi-tab architecture: each .fluxvismat opens as a tab.
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { VisualMaterialEditor } from './components/panels/VisualMaterialEditor';
import { ElectronFileSystem, setGlobalFileSystem } from '../src/filesystem';

// Initialize filesystem before React renders
setGlobalFileSystem(new ElectronFileSystem());

// Read initial filePath from URL query string (set by Electron main process)
const params = new URLSearchParams(window.location.search);
const initialFilePath = params.get('filePath') || '';

interface TabInfo {
  id: string;
  filePath: string;
  label: string;
}

function fileLabel(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop()?.replace('.fluxvismat', '') || filePath;
}

const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabInfo[]>(() => {
    if (!initialFilePath) return [];
    return [{ id: '1', filePath: initialFilePath, label: fileLabel(initialFilePath) }];
  });
  const [activeTabId, setActiveTabId] = useState<string>(initialFilePath ? '1' : '');
  const nextIdRef = useRef(2);
  const dragTabRef = useRef<string | null>(null);

  // Open a new tab (or focus existing) for a filePath
  const openTab = useCallback((filePath: string) => {
    setTabs(prev => {
      const existing = prev.find(t => t.filePath === filePath);
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
    (window as any).fluxionAPI?.onVmeOpenTab?.(handler);
    return () => {
      (window as any).fluxionAPI?.offVmeOpenTab?.();
    };
  }, [openTab]);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) {
        // Last tab closed → close window
        window.fluxionAPI?.close();
        return prev;
      }
      setActiveTabId(curr => {
        if (curr !== tabId) return curr;
        // Activate neighbor tab
        const newIdx = Math.min(idx, next.length - 1);
        return next[newIdx].id;
      });
      return next;
    });
  }, []);

  // Tab drag reorder
  const handleDragStart = useCallback((tabId: string) => {
    dragTabRef.current = tabId;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragTabRef.current || dragTabRef.current === targetId) return;
    setTabs(prev => {
      const fromIdx = prev.findIndex(t => t.id === dragTabRef.current);
      const toIdx = prev.findIndex(t => t.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragTabRef.current = null;
  }, []);

  if (tabs.length === 0) {
    return (
      <div style={{ color: '#888', padding: 20, fontFamily: 'system-ui' }}>
        No material files open.
      </div>
    );
  }

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#181825',
        borderBottom: '1px solid #313244',
        height: 34,
        minHeight: 34,
        userSelect: 'none',
        paddingLeft: 4,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          overflow: 'auto',
          flex: 1,
          scrollbarWidth: 'none' as any,
        }}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              draggable
              onDragStart={() => handleDragStart(tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 10px',
                height: 34,
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'system-ui, sans-serif',
                color: tab.id === activeTab.id ? '#cdd6f4' : '#6c7086',
                background: tab.id === activeTab.id ? '#1e1e2e' : 'transparent',
                borderRight: '1px solid #313244',
                whiteSpace: 'nowrap',
                transition: 'background 0.1s, color 0.1s',
              }}
              title={tab.filePath}
            >
              <span style={{ color: '#e040fb', marginRight: 2, fontSize: 10 }}>&#9679;</span>
              {tab.label}
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  fontSize: 14,
                  lineHeight: '14px',
                  color: '#6c7086',
                  marginLeft: 4,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#45475a'; (e.target as HTMLElement).style.color = '#cdd6f4'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#6c7086'; }}
                title="Close tab"
              >
                &times;
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Editor */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: tab.id === activeTab.id ? 'block' : 'none',
            }}
          >
            <VisualMaterialEditor
              filePath={tab.filePath}
              onClose={() => closeTab(tab.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

try {
  const container = document.getElementById('vme-root');
  if (container) {
    createRoot(container).render(<App />);
  }
} catch (err: any) {
  console.error('VME window mount error:', err);
}
