import React from 'react';
import { NumberInput } from './NumberInput';

interface Vector2InputProps {
  value: { x: number; y: number };
  onChange: (axis: 'x' | 'y', value: number) => void;
  step?: number;
}

export const Vector2Input: React.FC<Vector2InputProps> = ({
  value,
  onChange,
  step = 0.1,
}) => (
  <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
    <NumberInput axis="x" value={parseFloat(value.x.toFixed(3))} onChange={(v) => onChange('x', v)} step={step} />
    <NumberInput axis="y" value={parseFloat(value.y.toFixed(3))} onChange={(v) => onChange('y', v)} step={step} />
  </div>
);
