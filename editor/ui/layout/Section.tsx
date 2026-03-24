import React, { useState } from 'react';
import { Icons } from '../Icons';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  icon?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  title,
  defaultOpen = true,
  icon,
  actions,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          cursor: 'pointer',
          background: 'var(--bg-secondary)',
          fontWeight: 600,
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)',
          transition: 'background 150ms ease',
        }}
      >
        <span>
          {open ? Icons.chevronDown : Icons.chevronRight} {icon && `${icon} `}{title}
        </span>
        {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
      {open && (
        <div style={{ padding: '8px 12px' }}>
          {children}
        </div>
      )}
    </div>
  );
};
