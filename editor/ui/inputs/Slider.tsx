import React from 'react';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  showValue = true,
}) => {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1 }}>
      <div style={{ flex: 1, position: 'relative', height: '22px', display: 'flex', alignItems: 'center' }}>
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '3px',
          background: 'var(--border)',
          borderRadius: '2px',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--accent)',
            borderRadius: '2px',
            transition: 'width var(--transition-fast)',
          }} />
        </div>
        <input
          type="range"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={min}
          max={max}
          step={step}
          style={{
            width: '100%',
            appearance: 'none' as any,
            WebkitAppearance: 'none',
            background: 'transparent',
            outline: 'none',
            cursor: 'pointer',
            margin: 0,
            position: 'relative',
          }}
        />
      </div>
      {showValue && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          width: '38px',
          textAlign: 'right',
          flexShrink: 0,
        }}>
          {value.toFixed(2)}
        </span>
      )}
    </div>
  );
};
