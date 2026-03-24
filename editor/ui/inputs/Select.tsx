import React from 'react';

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  style?: React.CSSProperties;
}

export const Select: React.FC<SelectProps> = ({ value, onChange, options, style }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: '100%',
      background: 'var(--bg-input)',
      border: '1px solid var(--border)',
      borderRadius: '3px',
      color: 'var(--text-primary)',
      padding: '3px 6px',
      fontSize: '12px',
      outline: 'none',
      ...style,
    }}
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);
