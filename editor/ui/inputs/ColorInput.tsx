import React from 'react';

interface ColorInputProps {
  value: string;
  onChange: (value: string) => void;
}

export const ColorInput: React.FC<ColorInputProps> = ({ value, onChange }) => (
  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1 }}>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '24px',
        height: '24px',
        border: '1px solid var(--border)',
        borderRadius: '3px',
        padding: '0',
        cursor: 'pointer',
        background: 'none',
      }}
    />
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--text-muted)',
    }}>
      {value}
    </span>
  </div>
);
