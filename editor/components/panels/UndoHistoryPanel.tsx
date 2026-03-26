// ============================================================
// FluxionJS V3 — Undo History Panel
// Shows the full undo/redo stack with the current position
// highlighted. Read-only view — operations are done via
// Ctrl+Z / Ctrl+Y or the Titlebar buttons.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { undoManager } from '../../core/UndoService';
import { useEditor } from '../../core/EditorContext';

const ROW_H = 26;

export const UndoHistoryPanel: React.FC = () => {
  const { log } = useEditor();
  const [, forceUpdate] = useState(0);
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return undoManager.subscribe(() => forceUpdate(n => n + 1));
  }, []);

  // Scroll current position into view when stack changes
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  });

  const undoStack = undoManager.getUndoStack();
  const redoStack = undoManager.getRedoStack();

  const handleUndo = () => {
    const cmd = undoManager.undo();
    if (cmd) log(`Undo: ${cmd.label}`, 'info');
  };

  const handleRedo = () => {
    const cmd = undoManager.redo();
    if (cmd) log(`Redo: ${cmd.label}`, 'info');
  };

  const canUndo = undoManager.canUndo();
  const canRedo = undoManager.canRedo();

  // Build the display list: redo stack (future, reversed) + current marker + undo stack (past, reversed)
  // Display order: oldest at top → newest undo → [current] → redo items → most future at bottom
  const undoItems = [...undoStack]; // oldest at [0]
  const redoItems = [...redoStack].reverse(); // redo stack is stored newest-first; reverse for display

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-panel)',
      fontSize: '12px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Undo History
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={btnStyle(!canUndo)}
          >
            ↩ Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            style={btnStyle(!canRedo)}
          >
            Redo ↪
          </button>
        </div>
      </div>

      {/* Stack list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {undoItems.length === 0 && redoItems.length === 0 && (
          <div style={{ color: 'var(--text-muted, #555)', padding: '12px 16px', fontStyle: 'italic' }}>
            No history yet
          </div>
        )}

        {/* Scene Start marker */}
        {undoItems.length === 0 && (redoItems.length > 0 || true) && (
          <HistoryRow
            label="Scene Opened"
            isCurrent={undoItems.length === 0}
            isScene
            currentRef={undoItems.length === 0 ? currentRef : undefined}
          />
        )}

        {/* Undo items (past actions, oldest first) */}
        {undoItems.map((cmd, i) => {
          const isCurrent = i === undoItems.length - 1 && redoItems.length === 0;
          return (
            <HistoryRow
              key={`undo-${i}`}
              label={cmd.label}
              isCurrent={isCurrent}
              isPast={!isCurrent}
              index={i + 1}
              currentRef={isCurrent ? currentRef : undefined}
            />
          );
        })}

        {/* Current position marker (when there are redo items) */}
        {redoItems.length > 0 && (
          <div
            ref={currentRef}
            style={{
              height: '2px',
              margin: '2px 8px',
              background: 'var(--accent)',
              borderRadius: '1px',
              position: 'relative',
            }}
          >
            <span style={{
              position: 'absolute',
              right: 0,
              top: '-9px',
              fontSize: '10px',
              color: 'var(--accent)',
              fontWeight: 600,
            }}>
              ◀ current
            </span>
          </div>
        )}

        {/* Redo items (future actions) */}
        {redoItems.map((cmd, i) => (
          <HistoryRow
            key={`redo-${i}`}
            label={cmd.label}
            isFuture
            index={undoItems.length + 1 + i}
          />
        ))}
      </div>

      {/* Footer stats */}
      <div style={{
        padding: '4px 10px',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-muted, #555)',
        fontSize: '11px',
        display: 'flex',
        gap: '12px',
        flexShrink: 0,
      }}>
        <span>{undoItems.length} action{undoItems.length !== 1 ? 's' : ''}</span>
        {redoItems.length > 0 && <span style={{ color: 'var(--accent-yellow)' }}>{redoItems.length} redo available</span>}
        <span style={{ marginLeft: 'auto' }}>Max: {undoManager.maxHistory}</span>
      </div>
    </div>
  );
};

// ── Sub-components ──

interface HistoryRowProps {
  label: string;
  isCurrent?: boolean;
  isPast?: boolean;
  isFuture?: boolean;
  isScene?: boolean;
  index?: number;
  currentRef?: React.RefObject<HTMLDivElement>;
}

const HistoryRow: React.FC<HistoryRowProps> = ({ label, isCurrent, isPast, isFuture, isScene, index, currentRef }) => {
  const [hovered, setHovered] = useState(false);

  let textColor = 'var(--text-secondary)';
  let bg = 'transparent';
  let opacity = 1;

  if (isCurrent) { bg = 'var(--accent-subtle, rgba(88,166,255,0.12))'; textColor = 'var(--accent)'; }
  else if (isFuture) { opacity = 0.45; }
  else if (isScene) { textColor = 'var(--text-muted, #555)'; }

  if (hovered) bg = 'var(--bg-hover)';

  return (
    <div
      ref={currentRef as React.RefObject<HTMLDivElement>}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        height: `${ROW_H}px`,
        padding: '0 12px',
        background: bg,
        cursor: 'default',
        opacity,
        transition: 'background 100ms',
        userSelect: 'none',
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: '11px', color: isScene ? 'var(--text-muted, #555)' : isFuture ? 'var(--accent-yellow)' : 'var(--accent-blue, #58a6ff)', minWidth: '14px' }}>
        {isScene ? '⊙' : isFuture ? '○' : '●'}
      </span>

      {/* Index */}
      {index !== undefined && (
        <span style={{ color: 'var(--text-muted, #555)', minWidth: '22px', fontSize: '10px', textAlign: 'right' }}>
          {index}
        </span>
      )}

      {/* Label */}
      <span style={{ color: textColor, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>

      {/* Current badge */}
      {isCurrent && (
        <span style={{
          fontSize: '9px',
          background: 'var(--accent)',
          color: '#000',
          borderRadius: '3px',
          padding: '1px 5px',
          fontWeight: 700,
          letterSpacing: '0.3px',
        }}>
          NOW
        </span>
      )}
    </div>
  );
};

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? 'transparent' : 'var(--bg-hover)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: disabled ? 'var(--text-muted, #555)' : 'var(--text-secondary)',
    padding: '2px 8px',
    fontSize: '11px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
