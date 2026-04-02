// ============================================================
// FluxionJS V3 — Detached Panel Window Entry Point
// Renders a single registered panel in a standalone OS window.
// EditorState is received via IPC and actions are relayed back
// to the main window.
// ============================================================

import React, { useReducer, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './core/TauriAPIShim';
import { PanelRegistry } from './core/PanelRegistry';
import { registerBuiltInPanels } from './components/layout/PanelRegistrations';
import { EditorCtxForPanelWindow } from './core/PanelWindowContext';
import { EditorState, initialEditorState, editorReducer } from './core/EditorState';

// Register panels so PanelRegistry.get() works in this window
registerBuiltInPanels();

// ── Resolve which panel this window is for ──
const params = new URLSearchParams(window.location.search);
const panelId = params.get('panelId') ?? '';

const reg = PanelRegistry.get(panelId);
const PanelComponent = reg?.component;

// ── App ──
const PanelWindowApp: React.FC = () => {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);

  // Receive EditorState snapshots from main window via IPC
  useEffect(() => {
    window.fluxionAPI?.onPanelState?.((incoming: unknown) => {
      dispatch({ type: 'LOAD_SNAPSHOT', snapshot: incoming as EditorState });
    });
    return () => { window.fluxionAPI?.offPanelState?.(); };
  }, []);

  // Relay dispatched actions back to the main window
  const relayDispatch = (action: any) => {
    dispatch(action);
    window.fluxionAPI?.dispatchEditorAction?.(action);
  };

  if (!PanelComponent) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: '#f66', fontFamily: 'monospace', fontSize: 14,
      }}>
        Panel &quot;{panelId}&quot; not found in registry.
      </div>
    );
  }

  return (
    <EditorCtxForPanelWindow state={state} dispatch={relayDispatch}>
      <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Minimal title bar */}
        <div style={{
          height: 32, flexShrink: 0,
          background: 'var(--bg-secondary, #161b22)',
          borderBottom: '1px solid var(--border, #2a2d35)',
          display: 'flex', alignItems: 'center',
          fontSize: 12, color: 'var(--text-secondary, #8b949e)', userSelect: 'none',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', flex: 1, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {reg?.icon && <span style={{ marginRight: 6, opacity: 0.7, display: 'flex', alignItems: 'center' }}>{reg.icon}</span>}
            {reg?.title ?? panelId}
          </span>
          {/* Window controls */}
          <div style={{ display: 'flex', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {([
              { label: '─', title: 'Minimize', hover: 'var(--bg-hover, #21262d)', onClick: () => (window as any).fluxionAPI?.minimize() },
              { label: '□', title: 'Maximize', hover: 'var(--bg-hover, #21262d)', onClick: () => (window as any).fluxionAPI?.maximize() },
              { label: '✕', title: 'Close',    hover: '#c0392b',                  onClick: () => {
                if ((window as any).__TAURI__) {
                  (window as any).__TAURI__.event.emit('fluxion:panel-window-closed', panelId).catch(() => {});
                }
                (window as any).fluxionAPI?.close();
              } },
            ] as const).map(({ label, title, hover, onClick }) => (
              <button key={title} onClick={onClick} title={title}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #8b949e)', width: 40, height: 32, cursor: 'pointer', fontSize: 12 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = hover; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary, #e6edf3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary, #8b949e)'; }}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Panel body */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <PanelComponent />
        </div>
      </div>
    </EditorCtxForPanelWindow>
  );
};

// ── Mount ──
try {
  const container = document.getElementById('panel-root');
  if (container) {
    createRoot(container).render(<PanelWindowApp />);
  }
} catch (err: any) {
  document.body.innerHTML = `<pre style="color:red;padding:20px;white-space:pre-wrap;">PANEL WINDOW ERROR:\n${err?.stack ?? err}</pre>`;
}
