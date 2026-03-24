import React from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ accentColor: 'var(--accent)' }}
    />
    {label && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>}
  </label>
);
