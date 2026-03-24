import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'icon';
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
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid transparent',
    borderRadius: '4px',
    cursor: props.disabled ? 'default' : 'pointer',
    transition: 'all 150ms ease',
    fontFamily: 'inherit',
    opacity: props.disabled ? 0.5 : 1,
    ...style,
  };

  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: '2px 6px', fontSize: '11px', height: '22px' },
    md: { padding: '4px 10px', fontSize: '12px', height: '28px' },
    lg: { padding: '6px 14px', fontSize: '13px', height: '32px' },
  };

  const variants: Record<string, React.CSSProperties> = {
    default: {
      background: active ? 'var(--bg-active)' : 'none',
      borderColor: active ? 'var(--accent)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
    },
    primary: {
      background: 'var(--accent)',
      color: '#fff',
    },
    danger: {
      background: 'var(--accent-red)',
      color: '#fff',
    },
    ghost: {
      background: 'none',
      color: 'var(--text-secondary)',
    },
    icon: {
      background: active ? 'var(--bg-active)' : 'none',
      borderColor: active ? 'var(--accent)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      width: size === 'sm' ? '22px' : size === 'lg' ? '32px' : '28px',
      padding: '0',
    },
  };

  return (
    <button
      className={className}
      style={{ ...baseStyle, ...sizes[size], ...variants[variant] }}
      {...props}
    >
      {children}
    </button>
  );
};
