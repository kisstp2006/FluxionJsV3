import React from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({ value, onChange, placeholder = 'Search...' }) => (
  <div style={{
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
  }}>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        color: 'var(--text-primary)',
        padding: '5px 8px',
        fontSize: '12px',
        outline: 'none',
        transition: 'border-color 150ms ease',
      }}
    />
  </div>
);
