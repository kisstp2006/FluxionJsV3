// ============================================================
// FluxionJS V3 — SplitPane Component
// Universal resizable split container. Splits two children with
// a draggable resize handle. Supports horizontal/vertical,
// start/end primary pane, min/max size constraints.
// Avoids stale-closure issues by tracking absolute delta from
// the mousedown start position.
// ============================================================

import React, { useRef, useCallback } from 'react';

export interface SplitPaneProps {
  /** Split axis: 'horizontal' = side-by-side, 'vertical' = stacked */
  direction: 'horizontal' | 'vertical';
  /** Which child is the fixed-size (primary) pane */
  primaryPosition: 'start' | 'end';
  /** Current size of the primary pane in pixels */
  size: number;
  /** Minimum primary pane size (default: 100) */
  minSize?: number;
  /** Maximum primary pane size (default: 600) */
  maxSize?: number;
  /** Called during drag with the new clamped size */
  onSizeChange: (newSize: number) => void;
  /** Exactly two children: [start pane content, end pane content] */
  children: [React.ReactNode, React.ReactNode];
}

const HANDLE_SIZE = 4;

export const SplitPane: React.FC<SplitPaneProps> = ({
  direction,
  primaryPosition,
  size,
  minSize = 100,
  maxSize = 600,
  onSizeChange,
  children,
}) => {
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);
  const handleRef = useRef<HTMLDivElement>(null);

  const isHorizontal = direction === 'horizontal';
  const cursor = isHorizontal ? 'col-resize' : 'row-resize';

  // Refs avoid stale closures in the mousemove handler
  const onSizeChangeRef = useRef(onSizeChange);
  onSizeChangeRef.current = onSizeChange;
  const minRef = useRef(minSize);
  minRef.current = minSize;
  const maxRef = useRef(maxSize);
  maxRef.current = maxSize;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startPos.current = isHorizontal ? e.clientX : e.clientY;
    startSize.current = size;

    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';

    if (handleRef.current) {
      handleRef.current.style.background = 'var(--accent)';
    }

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const pos = isHorizontal ? ev.clientX : ev.clientY;
      const totalDelta = pos - startPos.current;
      const sign = primaryPosition === 'start' ? 1 : -1;
      const raw = startSize.current + totalDelta * sign;
      const clamped = Math.max(minRef.current, Math.min(maxRef.current, raw));
      onSizeChangeRef.current(clamped);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (handleRef.current) {
        handleRef.current.style.background = 'transparent';
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [isHorizontal, cursor, primaryPosition, size]);

  // ── Styles ──

  const primaryStyle: React.CSSProperties = {
    flexShrink: 0,
    flexGrow: 0,
    overflow: 'hidden',
    ...(isHorizontal
      ? { width: `${size}px`, height: '100%' }
      : { height: `${size}px`, width: '100%' }),
  };

  const secondaryStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
    minHeight: 0,
  };

  const handleStyle: React.CSSProperties = {
    flexShrink: 0,
    cursor,
    background: 'transparent',
    transition: 'background 150ms ease',
    zIndex: 10,
    ...(isHorizontal
      ? { width: `${HANDLE_SIZE}px`, height: '100%' }
      : { width: '100%', height: `${HANDLE_SIZE}px` }),
  };

  const [first, second] = children;

  return (
    <div style={{
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Start pane */}
      <div style={primaryPosition === 'start' ? primaryStyle : secondaryStyle}>
        {first}
      </div>

      {/* Resize handle */}
      <div
        ref={handleRef}
        style={handleStyle}
        onMouseDown={onMouseDown}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          if (!dragging.current) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      />

      {/* End pane */}
      <div style={primaryPosition === 'end' ? primaryStyle : secondaryStyle}>
        {second}
      </div>
    </div>
  );
};
