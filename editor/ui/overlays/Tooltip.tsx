import React, { useState, useRef } from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
      style={{ display: 'inline-flex' }}
    >
      {children}
      {show && (
        <div
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: 'translateX(-50%)',
            background: '#333337',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '3px 7px',
            fontSize: '11px',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            zIndex: 10001,
            pointerEvents: 'none',
            boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
            animation: 'fadeIn 80ms ease',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
};
