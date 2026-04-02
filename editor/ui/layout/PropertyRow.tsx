import React from 'react';

interface PropertyRowProps {
  label: React.ReactNode;
  children: React.ReactNode;
  labelWidth?: number;
  alignTop?: boolean;
}

export const PropertyRow: React.FC<PropertyRowProps> = ({
  label,
  children,
  labelWidth = 90,
  alignTop = false,
}) => (
  <div style={{
    display: 'flex',
    alignItems: alignTop ? 'flex-start' : 'center',
    marginBottom: '4px',
    minHeight: '22px',
    gap: '6px',
  }}>
    <span style={{
      width: `${labelWidth}px`,
      minWidth: `${labelWidth}px`,
      fontSize: '11px',
      color: 'var(--text-secondary)',
      lineHeight: '22px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      userSelect: 'none',
    }}>
      {label}
    </span>
    <div style={{ flex: 1, display: 'flex', gap: '3px', alignItems: 'center', minWidth: 0 }}>
      {children}
    </div>
  </div>
);
