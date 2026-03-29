import React from 'react';

interface PropertyRowProps {
  label: React.ReactNode;
  children: React.ReactNode;
  labelWidth?: number;
}

export const PropertyRow: React.FC<PropertyRowProps> = ({ label, children, labelWidth = 80 }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    marginBottom: '6px',
    gap: '8px',
  }}>
    <span style={{
      width: `${labelWidth}px`,
      minWidth: `${labelWidth}px`,
      fontSize: '11px',
      color: 'var(--text-secondary)',
    }}>
      {label}
    </span>
    <div style={{ flex: 1, display: 'flex', gap: '4px' }}>
      {children}
    </div>
  </div>
);
