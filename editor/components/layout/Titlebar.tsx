// ============================================================
// FluxionJS V2 — Titlebar Component
// Frameless window titlebar with menu (s&box-inspired)
// ============================================================

import React, { useState } from 'react';
import { Button, ContextMenu, Icons } from '../../ui';
import { useEditor, useEngine } from '../../core/EditorContext';
import { projectManager } from '../../../src/project/ProjectManager';
import { serializeScene, loadSceneFromFile } from '../../../src/project/SceneSerializer';

declare global {
  interface Window {
    fluxionAPI?: {
      openFileDialog: (filters?: any) => Promise<string | null>;
      saveFileDialog: (filters?: any) => Promise<string | null>;
      readFile: (path: string) => Promise<string>;
      writeFile: (path: string, data: string) => Promise<boolean>;
      listDir: (path: string) => Promise<any[]>;
      openDirDialog: () => Promise<string | null>;
      readDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>;
      mkdir: (path: string) => Promise<boolean>;
      exists: (path: string) => Promise<boolean>;
      deleteFile: (path: string) => Promise<boolean>;
      getAppDataPath: () => Promise<string>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}

export const Titlebar: React.FC<{
  onSaveScene?: () => void;
  onCloseProject?: () => void;
  onNewScene?: () => void;
  onOpenScene?: () => void;
}> = ({ onSaveScene, onCloseProject, onNewScene, onOpenScene }) => {
  const { state, dispatch, log } = useEditor();
  const engine = useEngine();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const openMenu = (menuName: string, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.bottom });
    setMenuOpen(menuName);
  };

  const fileMenuItems = [
    {
      label: 'New Scene', icon: '📄', shortcut: 'Ctrl+N',
      onClick: () => onNewScene?.(),
    },
    {
      label: 'Open Scene...', icon: '📂', shortcut: 'Ctrl+O',
      onClick: () => onOpenScene?.(),
    },
    {
      label: 'Save Scene', icon: '💾', shortcut: 'Ctrl+S',
      onClick: () => onSaveScene?.(),
    },
    { label: '', icon: '', shortcut: '', onClick: () => {}, separator: true },
    {
      label: 'Close Project', icon: '📁', shortcut: '',
      onClick: () => onCloseProject?.(),
    },
    { label: '', icon: '', shortcut: '', onClick: () => {}, separator: true },
    {
      label: 'Exit', icon: '❌', shortcut: 'Alt+F4',
      onClick: () => window.fluxionAPI?.close(),
    },
  ];

  const editMenuItems = [
    { label: 'Undo', icon: '↩', shortcut: 'Ctrl+Z', onClick: () => log('Undo', 'info') },
    { label: 'Redo', icon: '↪', shortcut: 'Ctrl+Y', onClick: () => log('Redo', 'info') },
    { label: '', icon: '', shortcut: '', onClick: () => {}, separator: true },
    { label: 'Duplicate', icon: '📋', shortcut: 'Ctrl+D', onClick: () => log('Duplicated', 'info') },
    { label: 'Delete', icon: '🗑', shortcut: 'Del', onClick: () => log('Deleted', 'info') },
  ];

  const viewMenuItems = [
    { label: 'Toggle Grid', icon: '⊞', onClick: () => log('Grid toggled', 'info') },
    { label: 'Toggle Wireframe', icon: '🔲', onClick: () => log('Wireframe toggled', 'info') },
    { label: '', icon: '', shortcut: '', onClick: () => {}, separator: true },
    { label: 'Reset Layout', icon: '↻', onClick: () => log('Layout reset', 'info') },
  ];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: '32px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      // @ts-ignore
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}>
      {/* Left: Logo + Menu */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        paddingLeft: '12px',
        flex: 1,
      }}>
        <span style={{
          fontWeight: 700,
          fontSize: '13px',
          color: 'var(--accent)',
          letterSpacing: '0.5px',
        }}>
          ⚡ FluxionJS V2
          {state.projectName && (
            <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
              {' — '}{state.projectName}
              {state.currentScenePath && ` / ${state.currentScenePath.split('/').pop()?.replace('.fluxscene', '')}`}
              {state.isSceneDirty && <span style={{ color: 'var(--accent-yellow)' }}> *</span>}
            </span>
          )}
        </span>

        <div style={{
          display: 'flex',
          gap: '2px',
          // @ts-ignore
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}>
          {[
            { label: 'File', items: fileMenuItems },
            { label: 'Edit', items: editMenuItems },
            { label: 'View', items: viewMenuItems },
          ].map(({ label, items }) => (
            <button
              key={label}
              onClick={(e) => openMenu(label, e)}
              style={{
                background: menuOpen === label ? 'var(--bg-hover)' : 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 150ms ease',
              }}
            >
              {label}
            </button>
          ))}

          <button
            onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
            style={{
              background: 'none',
              border: 'none',
              color: state.isPlaying ? 'var(--accent-yellow)' : 'var(--accent-green)',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 150ms ease',
            }}
          >
            {state.isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>
      </div>

      {/* Right: Window controls */}
      <div style={{ display: 'flex', ...({ WebkitAppRegion: 'no-drag' } as any) }}>
        {[
          { icon: Icons.minimize, onClick: () => window.fluxionAPI?.minimize(), hoverBg: 'var(--bg-hover)' },
          { icon: Icons.maximize, onClick: () => window.fluxionAPI?.maximize(), hoverBg: 'var(--bg-hover)' },
          { icon: Icons.close, onClick: () => window.fluxionAPI?.close(), hoverBg: 'var(--accent-red)' },
        ].map(({ icon, onClick, hoverBg }, i) => (
          <button
            key={i}
            onClick={onClick}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              width: '46px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = hoverBg;
              (e.target as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = 'none';
              (e.target as HTMLElement).style.color = 'var(--text-secondary)';
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Context Menu */}
      {menuOpen && (
        <ContextMenu
          items={
            menuOpen === 'File' ? fileMenuItems :
            menuOpen === 'Edit' ? editMenuItems :
            viewMenuItems
          }
          position={menuPos}
          onClose={() => setMenuOpen(null)}
        />
      )}
    </div>
  );
};
