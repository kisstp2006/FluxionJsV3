// ============================================================
// FluxionJS V3 — Floating Panel Window (in-app)
// Used when editor.panels.useNativeWindows = false.
// Renders a detached panel as a draggable/resizable overlay
// inside the main editor window.
// ============================================================

import React, { useRef, useCallback, useEffect } from 'react';
import { PanelRegistry } from '../../core/PanelRegistry';
import { usePanelLayout, FloatingPanelEntry } from '../../core/PanelLayoutContext';

const MIN_W = 200;
const MIN_H = 140;
const HEADER_H = 32;

interface FloatingPanelWindowProps {
  entry: FloatingPanelEntry;
}

export const FloatingPanelWindow: React.FC<FloatingPanelWindowProps> = ({ entry }) => {
  const { dockPanel, updateFloatPos, updateFloatSize } = usePanelLayout();
  const reg = PanelRegistry.get(entry.id);
  if (!reg) return null;

  const Comp = reg.component;
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Header drag (move) ──
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-action]')) return;
    e.preventDefault();
    const startX = e.clientX - entry.x;
    const startY = e.clientY - entry.y;

    const onMove = (ev: MouseEvent) => {
      updateFloatPos(entry.id, ev.clientX - startX, ev.clientY - startY);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [entry.id, entry.x, entry.y, updateFloatPos]);

  // ── SE-corner resize ──
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = entry.width;
    const startH = entry.height;

    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_W, startW + (ev.clientX - startX));
      const h = Math.max(MIN_H, startH + (ev.clientY - startY));
      updateFloatSize(entry.id, w, h);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [entry.id, entry.width, entry.height, updateFloatSize]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: entry.x,
        top: entry.y,
        width: entry.width,
        height: entry.height,
        zIndex: 5000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        overflow: 'hidden',
        minWidth: MIN_W,
        minHeight: MIN_H,
      }}
    >
      {/* Title bar */}
      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          height: HEADER_H,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
          {reg.icon && <span style={{ opacity: 0.75, display: 'flex', alignItems: 'center' }}>{reg.icon}</span>}
          {reg.title}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Dock back — put panel back into its default zone */}
          <button
            data-action="dock"
            onClick={() => dockPanel(entry.id, reg.defaultZone)}
            title={`Dock to ${reg.defaultZone}`}
            style={btnStyle}
          >
            ⊟
          </button>
          {/* Close = same as dock back for floating windows */}
          <button
            data-action="close"
            onClick={() => dockPanel(entry.id, reg.defaultZone)}
            title="Close (dock back)"
            style={{ ...btnStyle, color: 'var(--accent-red, #f66)' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Comp />
      </div>

      {/* SE resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 14,
          height: 14,
          cursor: 'se-resize',
          zIndex: 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M13 1L1 13M13 7L7 13M13 13L13 13" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 13,
  padding: '0 4px',
  lineHeight: 1,
  borderRadius: 3,
};
