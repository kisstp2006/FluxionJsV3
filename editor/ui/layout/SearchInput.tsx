import React, { useRef } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  noBorder?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  autoFocus,
  noBorder,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{
      padding: '5px 8px',
      borderBottom: noBorder ? 'none' : '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none"
          style={{
            position: 'absolute',
            left: '7px',
            pointerEvents: 'none',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{
            width: '100%',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            color: 'var(--text-primary)',
            padding: '3px 24px 3px 26px',
            fontSize: '11px',
            height: '22px',
            outline: 'none',
            transition: 'border-color var(--transition)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-focus)'; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            style={{
              position: 'absolute',
              right: '5px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0',
              lineHeight: 1,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
