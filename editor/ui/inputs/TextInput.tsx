import React from 'react';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  readOnly?: boolean;
  style?: React.CSSProperties;
}

export const TextInput: React.FC<TextInputProps> = ({
  value,
  onChange,
  placeholder,
  mono,
  readOnly,
  style,
}) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    readOnly={readOnly}
    style={{
      width: '100%',
      background: readOnly ? 'var(--bg-tertiary)' : 'var(--bg-input)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--input-radius)',
      color: readOnly ? 'var(--text-secondary)' : 'var(--text-primary)',
      padding: 'var(--input-padding)',
      fontSize: '11px',
      height: 'var(--input-height)',
      fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      outline: 'none',
      transition: 'border-color var(--transition)',
      minWidth: 0,
      ...style,
    }}
    onFocus={(e) => { if (!readOnly) e.currentTarget.style.borderColor = 'var(--border-focus)'; }}
    onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border)'; }}
  />
);
