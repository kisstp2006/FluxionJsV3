import React from 'react';

interface PanelHeaderProps {
  title: string;
  actions?: React.ReactNode;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ title, actions }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    fontWeight: 600,
    fontSize: '12px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  }}>
    <span>{title}</span>
    {actions}
  </div>
);
