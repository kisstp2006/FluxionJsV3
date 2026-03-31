// ============================================================
// FluxionJS V3 — Titlebar Component
// Frameless window titlebar with registry-driven menus.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ContextMenu, Icons } from '../../ui';
import { useEditor, useEngine } from '../../core/EditorContext';
import { undoManager } from '../../core/UndoService';
import { MenuRegistry } from '../../core/MenuRegistry';
import { usePanelLayout } from '../../core/PanelLayoutContext';

// Default panel sizes (used by View > Reset Layout)
const DEFAULT_LEFT   = 260;
const DEFAULT_RIGHT  = 300;
const DEFAULT_BOTTOM = 220;

export const Titlebar: React.FC<{
  onSaveScene?: () => void;
  onCloseProject?: () => void;
  onNewScene?: () => void;
  onOpenScene?: () => void;
  onOpenSettings?: () => void;
  onOpenProjectSettings?: () => void;
}> = ({ onSaveScene, onCloseProject, onNewScene, onOpenScene, onOpenSettings, onOpenProjectSettings }) => {
  const { state, dispatch, log } = useEditor();
  const engine = useEngine();
  const { setPanelSize } = usePanelLayout();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [, forceUpdate] = useState(0);

  // Re-render when undo stack changes so Undo/Redo labels and disabled states update
  useEffect(() => undoManager.subscribe(() => forceUpdate(n => n + 1)), []);

  const handleUndo = useCallback(() => {
    const cmd = undoManager.undo();
    if (cmd) log(`Undo: ${cmd.label}`, 'info');
  }, [log]);

  const handleRedo = useCallback(() => {
    const cmd = undoManager.redo();
    if (cmd) log(`Redo: ${cmd.label}`, 'info');
  }, [log]);

  const resetPanelLayout = useCallback(() => {
    setPanelSize('left',   DEFAULT_LEFT);
    setPanelSize('right',  DEFAULT_RIGHT);
    setPanelSize('bottom', DEFAULT_BOTTOM);
  }, [setPanelSize]);

  // Build the full MenuContext — re-built on every render so dynamic
  // labels / disabled states pick up the latest state.
  const menuCtx = useMemo(() => ({
    state, dispatch, log, engine,
    onNewScene, onOpenScene, onSaveScene, onCloseProject,
    onOpenSettings, onOpenProjectSettings,
    resetPanelLayout,
  }), [
    state, dispatch, log, engine,
    onNewScene, onOpenScene, onSaveScene, onCloseProject,
    onOpenSettings, onOpenProjectSettings,
    resetPanelLayout,
  ]);

  const openMenu = (menuName: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.bottom });
    setMenuOpen(menuName);
  };

  const menuNames = MenuRegistry.getMenuNames();
  const canUndo = undoManager.canUndo();
  const canRedo = undoManager.canRedo();

  // Menu icon mapping (fallback to no icon for custom menus)
  const menuIcons: Record<string, React.ReactNode> = {
    File: Icons.folder,
    Edit: Icons.pencil,
    View: Icons.eye,
  };

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
          {/* Dynamic menu buttons from MenuRegistry */}
          {menuNames.map((name) => (
            <button
              key={name}
              onClick={(e) => openMenu(name, e)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: menuOpen === name ? 'var(--bg-hover)' : 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 150ms ease',
              }}
            >
              {menuIcons[name]}{name}
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
            onClick={() => {
              if (!state.isPlaying) dispatch({ type: 'TOGGLE_PLAY' });
              else dispatch({ type: 'TOGGLE_PAUSE' });
            }}
            style={{
              background: 'none',
              border: 'none',
              color: !state.isPlaying ? 'var(--accent-green)'
                   : state.isPaused  ? 'var(--accent)'
                   : 'var(--accent-yellow)',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 150ms ease',
            }}
          >
            {!state.isPlaying && <>{Icons.play} Play</>}
            {state.isPlaying && !state.isPaused && <>{Icons.pause} Pause</>}
            {state.isPlaying && state.isPaused && <>{Icons.play} Resume</>}
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
              (e.currentTarget as HTMLElement).style.background = hoverBg;
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'none';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Active context menu — resolved from registry at open time */}
      {menuOpen && (
        <ContextMenu
          items={MenuRegistry.resolveItems(menuOpen, menuCtx)}
          position={menuPos}
          onClose={() => setMenuOpen(null)}
        />
      )}
    </div>
  );
};
