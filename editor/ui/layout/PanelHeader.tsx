import React from 'react';

interface PanelHeaderProps {
  title: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ title, actions, icon }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 10px',
    height: '28px',
    minHeight: '28px',
    fontWeight: 600,
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      {icon}
      {title}
    </span>
    {actions && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {actions}
      </div>
    )}
  </div>
);
