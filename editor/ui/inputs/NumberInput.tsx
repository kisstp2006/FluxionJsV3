import React, { useRef, useCallback, useState } from 'react';

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

  // ── Drag-to-scrub ────────────────────────────────────────
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startVal = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const clamp = useCallback((v: number) => {
    if (min !== undefined && v < min) return min;
    if (max !== undefined && v > max) return max;
    return v;
  }, [min, max]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    if (e.button !== 0) return;
    // Only begin scrub if Alt key or middle-button is held,
    // or if the input is not focused (so normal editing still works)
    if (document.activeElement === e.currentTarget) return;
    e.preventDefault();
    dragging.current = true;
    startX.current   = e.clientX;
    startVal.current = value;
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = (ev.clientX - startX.current) * step;
      onChange(clamp(parseFloat((startVal.current + delta).toFixed(6))));
    };
    const onUp = () => {
      dragging.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [value, step, onChange, clamp]);

  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
      onMouseDown={onMouseDown}
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
        cursor: isDragging ? 'ew-resize' : 'default',
        ...style,
      }}
    />
  );
};
