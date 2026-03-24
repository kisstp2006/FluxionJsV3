import React from 'react';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  style?: React.CSSProperties;
}

export const TextInput: React.FC<TextInputProps> = ({
  value,
  onChange,
  placeholder,
  mono,
  style,
}) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{
      width: '100%',
      background: 'var(--bg-input)',
      border: '1px solid var(--border)',
      borderRadius: '3px',
      color: 'var(--text-primary)',
      padding: '3px 6px',
      fontSize: '12px',
      fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      outline: 'none',
      transition: 'border-color 150ms ease',
      ...style,
    }}
  />
);
