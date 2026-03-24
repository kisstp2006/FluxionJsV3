import React, { useRef, useEffect } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  onClick: () => void;
  separator?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10000,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '4px 0',
        minWidth: '180px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        animation: 'fadeIn 0.1s ease',
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
        ) : (
          <div
            key={i}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
              fontSize: '12px',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) (e.target as HTMLElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = 'transparent';
            }}
          >
            <span>
              {item.icon && <span style={{ marginRight: '8px', opacity: 0.7 }}>{item.icon}</span>}
              {item.label}
            </span>
            {item.shortcut && (
              <span style={{
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}>
                {item.shortcut}
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
};
