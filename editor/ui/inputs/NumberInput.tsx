import React from 'react';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  axis?: 'x' | 'y' | 'z';
  style?: React.CSSProperties;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  axis,
  style,
}) => {
  const axisColors: Record<string, string> = {
    x: 'var(--axis-x)',
    y: 'var(--axis-y)',
    z: 'var(--axis-z)',
  };

  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      step={step}
      min={min}
      max={max}
      style={{
        width: '100%',
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderLeft: axis ? `2px solid ${axisColors[axis]}` : undefined,
        borderRadius: '3px',
        color: 'var(--text-primary)',
        padding: '3px 6px',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        outline: 'none',
        transition: 'border-color 150ms ease',
        ...style,
      }}
    />
  );
};
