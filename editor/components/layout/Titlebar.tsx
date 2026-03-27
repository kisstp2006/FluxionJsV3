// ============================================================
// FluxionJS V2 — Titlebar Component
// Frameless window titlebar with menu (s&box-inspired)
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { ContextMenu, Icons } from '../../ui';
import { useEditor } from '../../core/EditorContext';
import { undoManager } from '../../core/UndoService';

export const Titlebar: React.FC<{
  onSaveScene?: () => void;
  onCloseProject?: () => void;
  onNewScene?: () => void;
  onOpenScene?: () => void;
  onOpenSettings?: () => void;
  onOpenProjectSettings?: () => void;
}> = ({ onSaveScene, onCloseProject, onNewScene, onOpenScene, onOpenSettings, onOpenProjectSettings }) => {
  const { state, dispatch, log } = useEditor();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [, forceUpdate] = useState(0);

  // Re-render when undo stack changes so buttons reflect canUndo/canRedo
  useEffect(() => {
    return undoManager.subscribe(() => forceUpdate(n => n + 1));
  }, []);

  const handleUndo = useCallback(() => {
    const cmd = undoManager.undo();
    if (cmd) log(`Undo: ${cmd.label}`, 'info');
  }, [log]);

  const handleRedo = useCallback(() => {
    const cmd = undoManager.redo();
    if (cmd) log(`Redo: ${cmd.label}`, 'info');
  }, [log]);

  const openMenu = (menuName: string, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.bottom });
    setMenuOpen(menuName);
  };

  const fileMenuItems = [
    {
      label: 'New Scene', icon: Icons.file, shortcut: 'Ctrl+N',
      onClick: () => onNewScene?.(),
    },
    {
      label: 'Open Scene...', icon: Icons.folderOpen, shortcut: 'Ctrl+O',
      onClick: () => onOpenScene?.(),
    },
    {
      label: 'Save Scene', icon: Icons.save, shortcut: 'Ctrl+S',
      onClick: () => onSaveScene?.(),
    },
    { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
    {
      label: 'Close Project', icon: Icons.folder, shortcut: '',
      onClick: () => onCloseProject?.(),
    },
    { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
    {
      label: 'Exit', icon: Icons.close, shortcut: 'Alt+F4',
      onClick: () => window.fluxionAPI?.close(),
    },
  ];

  const canUndo = undoManager.canUndo();
  const canRedo = undoManager.canRedo();

  const editMenuItems = [
    {
      label: `Undo${undoManager.undoLabel ? ` ${undoManager.undoLabel}` : ''}`,
      icon: Icons.undo, shortcut: 'Ctrl+Z',
      onClick: handleUndo,
      disabled: !canUndo,
    },
    {
      label: `Redo${undoManager.redoLabel ? ` ${undoManager.redoLabel}` : ''}`,
      icon: Icons.redo, shortcut: 'Ctrl+Y',
      onClick: handleRedo,
      disabled: !canRedo,
    },
    { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
    { label: 'Duplicate', icon: Icons.copy, shortcut: 'Ctrl+D', onClick: () => {} },
    { label: 'Delete', icon: Icons.trash, shortcut: 'Del', onClick: () => {} },
  ];

  const viewMenuItems = [
    { label: 'Toggle Grid', icon: Icons.grid, onClick: () => log('Grid toggled', 'info') },
    { label: 'Toggle Wireframe', icon: Icons.eye, onClick: () => log('Wireframe toggled', 'info') },
    { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
    { label: 'Settings', icon: Icons.settings, onClick: () => onOpenSettings?.() },
    { label: 'Project Settings', icon: Icons.clipboard, onClick: () => onOpenProjectSettings?.() },
    { label: '', icon: undefined, shortcut: '', onClick: () => {}, separator: true },
    { label: 'Reset Layout', icon: Icons.refresh, onClick: () => log('Layout reset', 'info') },
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
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
        }}>
          {Icons.zap} FluxionJS V3
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
            { label: 'File', icon: Icons.folder,   items: fileMenuItems },
            { label: 'Edit', icon: Icons.pencil,   items: editMenuItems },
            { label: 'View', icon: Icons.eye,      items: viewMenuItems },
          ].map(({ label, icon, items: _items }) => (
            <button
              key={label}
              onClick={(e) => openMenu(label, e)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
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
              {icon}{label}
            </button>
          ))}

          {/* Undo / Redo quick buttons */}
          <div style={{ display: 'flex', gap: '1px', marginLeft: '4px', marginRight: '4px' }}>
            {[
              { icon: Icons.undo, onClick: handleUndo, disabled: !canUndo, title: canUndo ? `Undo: ${undoManager.undoLabel}` : 'Nothing to undo' },
              { icon: Icons.redo, onClick: handleRedo, disabled: !canRedo, title: canRedo ? `Redo: ${undoManager.redoLabel}` : 'Nothing to redo' },
            ].map(({ icon, onClick, disabled, title }, i) => (
              <button
                key={i}
                onClick={onClick}
                disabled={disabled}
                title={title}
                style={{
                  background: 'none',
                  border: 'none',
                  color: disabled ? 'var(--text-disabled, #444)' : 'var(--text-secondary)',
                  padding: '4px 7px',
                  borderRadius: '4px',
                  cursor: disabled ? 'default' : 'pointer',
                  fontSize: '12px',
                  transition: 'all 150ms ease',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {icon}
              </button>
            ))}
          </div>

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
            {state.isPlaying ? <>{Icons.pause} Pause</> : <>{Icons.play} Play</>}
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
