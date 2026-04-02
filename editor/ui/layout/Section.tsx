import React, { useState } from 'react';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  title,
  defaultOpen = true,
  icon,
  actions,
  children,
  noPadding = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px 0 0',
          height: '26px',
          cursor: 'pointer',
          background: hovered ? 'var(--bg-hover)' : 'var(--bg-secondary)',
          borderLeft: `2px solid ${hovered || open ? 'var(--accent)' : 'transparent'}`,
          transition: 'background var(--transition), border-color var(--transition)',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          paddingLeft: '8px',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.4px',
          color: open ? 'var(--text-primary)' : 'var(--text-secondary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <svg
            width="9" height="9" viewBox="0 0 9 9" fill="none"
            style={{
              transition: 'transform var(--transition)',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              flexShrink: 0,
              color: 'var(--text-muted)',
            }}
          >
            <path d="M2 1.5L6 4.5L2 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {icon && (
            <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              {icon}
            </span>
          )}
          {title}
        </span>
        {actions && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
          >
            {actions}
          </div>
        )}
      </div>
      {open && (
        <div style={noPadding ? undefined : { padding: '6px 10px 8px 10px' }}>
          {children}
        </div>
      )}
    </div>
  );
};
