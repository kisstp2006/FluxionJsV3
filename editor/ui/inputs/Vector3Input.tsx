import React from 'react';
import { NumberInput } from './NumberInput';

interface Vector3InputProps {
  value: { x: number; y: number; z: number };
  onChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  step?: number;
  label?: string;
}

const axisLabelStyle = (color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '14px',
  height: '14px',
  borderRadius: '2px',
  background: color,
  color: '#fff',
  letterSpacing: '-0.3px',
  fontSize: '9px',
  fontWeight: 700,
  fontFamily: 'var(--font-mono, monospace)',
  flexShrink: 0,
  userSelect: 'none',
});

export const Vector3Input: React.FC<Vector3InputProps> = ({
  value,
  onChange,
  step = 0.1,
}) => (
  <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1 }}>
      <span style={axisLabelStyle('var(--axis-x, #f85149)')}>X</span>
      <NumberInput axis="x" value={parseFloat(value.x.toFixed(3))} onChange={(v) => onChange('x', v)} step={step} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1 }}>
      <span style={axisLabelStyle('var(--axis-y, #3fb950)')}>Y</span>
      <NumberInput axis="y" value={parseFloat(value.y.toFixed(3))} onChange={(v) => onChange('y', v)} step={step} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1 }}>
      <span style={axisLabelStyle('var(--axis-z, #58a6ff)')}>Z</span>
      <NumberInput axis="z" value={parseFloat(value.z.toFixed(3))} onChange={(v) => onChange('z', v)} step={step} />
    </div>
  </div>
);
