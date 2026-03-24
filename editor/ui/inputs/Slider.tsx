import React from 'react';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const Slider: React.FC<SliderProps> = ({ value, onChange, min = 0, max = 1, step = 0.01 }) => (
  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1 }}>
    <input
      type="range"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      min={min}
      max={max}
      step={step}
      style={{ flex: 1, accentColor: 'var(--accent)' }}
    />
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--text-muted)',
      width: '40px',
      textAlign: 'right',
    }}>
      {value.toFixed(2)}
    </span>
  </div>
);
