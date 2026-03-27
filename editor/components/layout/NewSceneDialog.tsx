// ============================================================
// FluxionJS V3 — New Scene Dialog
// Format selector: text (.fluxscene) or binary (.fluxsceneb)
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../ui';

export type SceneFormat = 'text' | 'binary';

interface NewSceneDialogProps {
  onConfirm: (format: SceneFormat) => void;
  onCancel: () => void;
}

const FORMATS: Array<{
  id: SceneFormat;
  label: string;
  ext: string;
  description: string;
}> = [
  {
    id: 'text',
    label: 'Text',
    ext: '.fluxscene',
    description: 'Human-readable JSON. Easy to diff, debug, and version control.',
  },
  {
    id: 'binary',
    label: 'Binary',
    ext: '.fluxsceneb',
    description: 'Compact binary format. Smaller file size, faster load times.',
  },
];

export const NewSceneDialog: React.FC<NewSceneDialogProps> = ({ onConfirm, onCancel }) => {
  const [selected, setSelected] = useState<SceneFormat>('text');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm(selected);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel, onConfirm, selected]);

  const handleConfirm = useCallback(() => onConfirm(selected), [onConfirm, selected]);

  return (
    // Overlay
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Dialog box */}
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        width: '380px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border)',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}>
          New Scene
        </div>

        {/* Format cards */}
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '2px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}>
            Scene Format
          </div>

          {FORMATS.map(fmt => {
            const isSelected = selected === fmt.id;
            return (
              <div
                key={fmt.id}
                onClick={() => setSelected(fmt.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--accent-subtle, rgba(99,102,241,0.12))' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'border-color 100ms, background 100ms',
                  userSelect: 'none',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hover, var(--border))';
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Radio dot */}
                  <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--text-muted)'}`,
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    flexShrink: 0,
                    transition: 'all 100ms',
                  }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {fmt.label}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-input, var(--bg-secondary))',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    padding: '1px 5px',
                    fontFamily: 'monospace',
                  }}>
                    {fmt.ext}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '22px' }}>
                  {fmt.description}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
        }}>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleConfirm}>Create</Button>
        </div>
      </div>
    </div>
  );
};
