import React from 'react';
import { NumberInput } from './NumberInput';

interface Vector3InputProps {
  value: { x: number; y: number; z: number };
  onChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  step?: number;
  label?: string;
}

export const Vector3Input: React.FC<Vector3InputProps> = ({
  value,
  onChange,
  step = 0.1,
  label: _label,
}) => (
  <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
    <NumberInput axis="x" value={parseFloat(value.x.toFixed(3))} onChange={(v) => onChange('x', v)} step={step} />
    <NumberInput axis="y" value={parseFloat(value.y.toFixed(3))} onChange={(v) => onChange('y', v)} step={step} />
    <NumberInput axis="z" value={parseFloat(value.z.toFixed(3))} onChange={(v) => onChange('z', v)} step={step} />
  </div>
);
