import React, { useState } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, label, disabled }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        userSelect: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: '14px',
          height: '14px',
          minWidth: '14px',
          borderRadius: '2px',
          border: `1px solid ${checked ? 'var(--accent)' : hovered ? 'var(--text-secondary)' : 'var(--border)'}`,
          background: checked ? 'var(--accent)' : hovered ? 'var(--bg-hover)' : 'var(--bg-input)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background var(--transition), border-color var(--transition)',
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg
            width="9" height="9" viewBox="0 0 9 9" fill="none"
            style={{ pointerEvents: 'none' }}
          >
            <polyline
              points="1.5,4.5 3.5,6.5 7.5,2"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      {label && (
        <span style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          lineHeight: 1,
        }}>
          {label}
        </span>
      )}
    </label>
  );
};
