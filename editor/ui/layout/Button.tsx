import React, { useState } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'icon' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'md',
  active = false,
  className = '',
  children,
  style,
  ...props
}) => {
  const [hovered, setHovered] = useState(false);

  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: '0 6px',  fontSize: '11px', height: '20px', gap: '3px' },
    md: { padding: '0 8px',  fontSize: '11px', height: '22px', gap: '4px' },
    lg: { padding: '0 12px', fontSize: '12px', height: '26px', gap: '5px' },
  };

  const iconWidths: Record<string, string> = {
    sm: '20px', md: '22px', lg: '26px',
  };

  const getVariantStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'default':
        return {
          background: active
            ? 'var(--bg-active)'
            : hovered ? 'var(--bg-hover)' : '#333337',
          border: '1px solid',
          borderColor: active ? 'var(--accent)' : '#3c3c40',
          color: active ? 'var(--accent)' : 'var(--text-primary)',
        };
      case 'primary':
        return {
          background: hovered ? 'var(--accent-hover)' : 'var(--accent)',
          border: '1px solid transparent',
          color: '#fff',
        };
      case 'danger':
        return {
          background: hovered ? '#c53030' : 'var(--accent-red)',
          border: '1px solid transparent',
          color: '#fff',
        };
      case 'ghost':
        return {
          background: hovered ? 'var(--bg-hover)' : 'transparent',
          border: '1px solid transparent',
          color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        };
      case 'subtle':
        return {
          background: hovered ? 'var(--bg-hover)' : 'transparent',
          border: '1px solid transparent',
          color: 'var(--text-secondary)',
        };
      case 'icon':
        return {
          background: active
            ? 'var(--bg-active)'
            : hovered ? 'var(--bg-hover)' : 'transparent',
          border: '1px solid',
          borderColor: active ? 'var(--accent)' : 'transparent',
          color: active ? 'var(--accent)' : hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
          width: iconWidths[size],
          padding: '0',
          flexShrink: 0,
        };
      default:
        return {};
    }
  };

  return (
    <button
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '3px',
        cursor: props.disabled ? 'default' : 'pointer',
        transition: 'all var(--transition-fast)',
        fontFamily: 'inherit',
        opacity: props.disabled ? 0.4 : 1,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        ...sizes[size],
        ...getVariantStyle(),
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
    >
      {children}
    </button>
  );
};
