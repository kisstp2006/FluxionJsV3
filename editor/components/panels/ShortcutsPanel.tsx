// ============================================================
// FluxionJS V3 — Keyboard Shortcuts Reference Panel
// Modal overlay listing all editor keyboard shortcuts.
// ============================================================

import React, { useEffect } from 'react';

interface ShortcutRow {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  label: string;
  rows: ShortcutRow[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Tools',
    rows: [
      { keys: 'Q',       description: 'Select tool' },
      { keys: 'W',       description: 'Move tool' },
      { keys: 'E',       description: 'Rotate tool' },
      { keys: 'R',       description: 'Scale tool' },
    ],
  },
  {
    label: 'Viewport',
    rows: [
      { keys: 'F',         description: 'Focus selected entity' },
      { keys: 'RMB drag',  description: 'Orbit camera' },
      { keys: 'MMB drag',  description: 'Pan camera' },
      { keys: 'Scroll',    description: 'Zoom camera' },
      { keys: 'RMB',       description: 'Viewport context menu' },
    ],
  },
  {
    label: 'Scene',
    rows: [
      { keys: 'Ctrl+S',   description: 'Save scene' },
      { keys: 'Ctrl+N',   description: 'New scene' },
      { keys: 'Ctrl+O',   description: 'Open scene' },
    ],
  },
  {
    label: 'Entities',
    rows: [
      { keys: 'Ctrl+D',   description: 'Duplicate selected entity' },
      { keys: 'Ctrl+C',   description: 'Copy selected entity' },
      { keys: 'Ctrl+V',   description: 'Paste copied entity' },
      { keys: 'Del',      description: 'Delete selected entity' },
      { keys: 'F2',       description: 'Rename (in Hierarchy)' },
    ],
  },
  {
    label: 'History',
    rows: [
      { keys: 'Ctrl+Z',       description: 'Undo' },
      { keys: 'Ctrl+Y',       description: 'Redo' },
      { keys: 'Ctrl+Shift+Z', description: 'Redo (alt)' },
    ],
  },
  {
    label: 'Play Mode',
    rows: [
      { keys: 'Play button',  description: 'Start / pause simulation' },
      { keys: 'Stop button',  description: 'Stop and restore scene' },
    ],
  },
];

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd style={{
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-primary)',
    boxShadow: '0 1px 0 var(--border)',
    whiteSpace: 'nowrap',
  }}>
    {children}
  </kbd>
);

export const ShortcutsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          width: '540px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
            Keyboard Shortcuts
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, padding: '2px 6px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.label}>
              <div style={{
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.5px', color: 'var(--text-muted)',
                marginBottom: '6px',
              }}>
                {group.label}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {group.rows.map(row => (
                    <tr key={row.keys} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 0', width: '180px' }}>
                        <Key>{row.keys}</Key>
                      </td>
                      <td style={{ padding: '4px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {row.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          Press Esc or click outside to close
        </div>
      </div>
    </div>
  );
};
