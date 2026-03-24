import React, { useRef, useCallback } from 'react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction, onResize }) => {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const pos = direction === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = pos - lastPos.current;
      lastPos.current = pos;
      onResize(delta);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [direction, onResize]);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: direction === 'horizontal' ? '4px' : '100%',
        height: direction === 'horizontal' ? '100%' : '4px',
        cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
        background: 'transparent',
        flexShrink: 0,
        zIndex: 10,
        transition: 'background 150ms ease',
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLElement).style.background = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        if (!dragging.current) {
          (e.target as HTMLElement).style.background = 'transparent';
        }
      }}
    />
  );
};
