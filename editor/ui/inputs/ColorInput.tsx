// ============================================================
// FluxionJS V3 — Professional HSV Color Picker
// External API unchanged: value="#rrggbb", onChange(hex)
// No external dependencies — pure React + CSS gradients.
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ── Color math ────────────────────────────────────────────────────────────────

function hexToHsv(hex: string): [number, number, number] {
  const c = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? (d / max) * 100 : 0, max * 100];
}

function hsvToHex(h: number, s: number, v: number): string {
  s /= 100; v /= 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  const pad = (n: number) => n.toString(16).padStart(2, '0');
  return `#${pad(f(5))}${pad(f(3))}${pad(f(1))}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const isValidHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

// ── Popup ─────────────────────────────────────────────────────────────────────

interface PopupProps {
  value: string;
  pos: { x: number; y: number };
  onChange: (hex: string) => void;
  onClose: () => void;
}

const ColorPickerPopup = React.memo<PopupProps>(({ value, pos, onChange, onClose }) => {
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(value));
  const [hexStr, setHexStr] = useState(value);
  const [rgb, setRgb] = useState<[string, string, string]>(() => {
    const [r, g, b] = hexToRgb(value);
    return [String(r), String(g), String(b)];
  });

  // Stable refs — allow stable callbacks without stale closures
  const hsvRef     = useRef(hsv);
  hsvRef.current   = hsv;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const dragRef    = useRef<'sv' | 'hue' | null>(null);
  const svAreaRef  = useRef<HTMLDivElement>(null);
  const hueAreaRef = useRef<HTMLDivElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);

  // ── Apply new HSV: update all derived state + fire onChange ──────────────
  const applyHsv = useCallback((next: [number, number, number]) => {
    hsvRef.current = next;
    setHsv(next);
    const hex = hsvToHex(next[0], next[1], next[2]);
    setHexStr(hex);
    const [r, g, b] = hexToRgb(hex);
    setRgb([String(r), String(g), String(b)]);
    onChangeRef.current(hex);
  }, []);

  // ── Drag handlers (stable — only use refs inside) ─────────────────────────
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const [ch, cs, cv] = hsvRef.current;

    if (dragRef.current === 'sv' && svAreaRef.current) {
      const rect = svAreaRef.current.getBoundingClientRect();
      const s = clamp((e.clientX - rect.left) / rect.width,  0, 1) * 100;
      const v = (1 - clamp((e.clientY - rect.top)  / rect.height, 0, 1)) * 100;
      applyHsv([ch, s, v]);
    } else if (dragRef.current === 'hue' && hueAreaRef.current) {
      const rect = hueAreaRef.current.getBoundingClientRect();
      const h = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 360;
      applyHsv([h, cs, cv]);
    }
  }, [applyHsv]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup',   handleMouseUp);
  }, [handleMouseMove]);

  const startDrag = useCallback((target: 'sv' | 'hue', e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = target;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup',   handleMouseUp);
    handleMouseMove(e.nativeEvent);  // apply on click too
  }, [handleMouseMove, handleMouseUp]);

  // Cleanup on unmount
  useEffect(() => () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup',   handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Hex commit ─────────────────────────────────────────────────────────────
  const commitHex = useCallback((raw: string) => {
    const norm = raw.startsWith('#') ? raw : `#${raw}`;
    if (isValidHex(norm)) {
      applyHsv(hexToHsv(norm));
    } else {
      // revert display
      const [h, s, v] = hsvRef.current;
      setHexStr(hsvToHex(h, s, v));
    }
  }, [applyHsv]);

  // ── RGB channel commit ─────────────────────────────────────────────────────
  const commitChannel = useCallback((idx: 0 | 1 | 2, raw: string) => {
    const parsed = parseInt(raw, 10);
    const [h, s, v] = hsvRef.current;
    const [r, g, b] = hexToRgb(hsvToHex(h, s, v));
    const channels: [number, number, number] = [r, g, b];
    if (isNaN(parsed)) {
      // revert
      setRgb(prev => { const n = [...prev] as typeof prev; n[idx] = String(channels[idx]); return n; });
      return;
    }
    channels[idx] = clamp(parsed, 0, 255);
    applyHsv(hexToHsv(`#${channels.map(x => x.toString(16).padStart(2, '0')).join('')}`));
  }, [applyHsv]);

  const [h, s, v] = hsv;
  const pureHue   = hsvToHex(h, 100, 100);
  const currentHex = hsvToHex(h, s, v);

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top:  pos.y,
        zIndex: 10000,
        width: '220px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── SV gradient picker ── */}
      <div
        ref={svAreaRef}
        onMouseDown={(e) => startDrag('sv', e)}
        style={{
          position: 'relative',
          width: '100%',
          height: '150px',
          background: pureHue,
          cursor: 'crosshair',
        }}
      >
        {/* White → transparent overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #fff, transparent)' }} />
        {/* Transparent → black overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent, #000)' }} />
        {/* Thumb */}
        <div style={{
          position: 'absolute',
          left:   `${s}%`,
          top:    `${100 - v}%`,
          transform: 'translate(-50%, -50%)',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.2)',
          background: currentHex,
          pointerEvents: 'none',
        }} />
      </div>

      {/* ── Controls ── */}
      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

        {/* Hue slider */}
        <div
          ref={hueAreaRef}
          onMouseDown={(e) => startDrag('hue', e)}
          style={{
            position: 'relative',
            height: '12px',
            borderRadius: '6px',
            background: 'linear-gradient(to right,#f00 0%,#ff0 16.67%,#0f0 33.33%,#0ff 50%,#00f 66.67%,#f0f 83.33%,#f00 100%)',
            cursor: 'ew-resize',
          }}
        >
          {/* Hue thumb */}
          <div style={{
            position: 'absolute',
            left: `${(h / 360) * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.4)',
            background: pureHue,
            pointerEvents: 'none',
          }} />
        </div>

        {/* Preview swatch + hex input */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{
            width: '30px',
            height: '30px',
            flexShrink: 0,
            borderRadius: '5px',
            background: currentHex,
            border: '1px solid var(--border)',
          }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.4px' }}>HEX</span>
            <input
              value={hexStr}
              onChange={(e) => setHexStr(e.target.value)}
              onBlur={(e) => commitHex(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitHex(hexStr); e.currentTarget.blur(); } }}
              spellCheck={false}
              style={{
                width: '100%',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
                padding: '3px 6px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* RGB channel inputs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['R', 'G', 'B'] as const).map((label, i) => (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.4px' }}>
                {label}
              </span>
              <input
                value={rgb[i]}
                onChange={(e) => setRgb(prev => {
                  const n = [...prev] as typeof prev;
                  n[i] = e.target.value;
                  return n;
                })}
                onBlur={(e) => commitChannel(i as 0 | 1 | 2, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { commitChannel(i as 0 | 1 | 2, rgb[i]); e.currentTarget.blur(); }
                }}
                style={{
                  width: '100%',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  padding: '3px 0',
                  textAlign: 'center',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ── Trigger (swatch + hex label) ──────────────────────────────────────────────

interface ColorInputProps {
  value: string;
  onChange: (value: string) => void;
}

export const ColorInput: React.FC<ColorInputProps> = ({ value, onChange }) => {
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState({ x: 0, y: 0 });
  const swatchRef         = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(() => {
    const rect = swatchRef.current?.getBoundingClientRect();
    if (!rect) return;
    const POPUP_H = 298;
    const POPUP_W = 220;
    const y = rect.bottom + 6 + POPUP_H > window.innerHeight
      ? rect.top - POPUP_H - 6
      : rect.bottom + 6;
    const x = rect.left + POPUP_W > window.innerWidth
      ? window.innerWidth - POPUP_W - 8
      : rect.left;
    setPos({ x, y });
    setOpen(true);
  }, []);

  return (
    <>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1, cursor: 'pointer' }} onClick={handleOpen}>
        <div
          ref={swatchRef}
          title={value}
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '4px',
            background: value,
            border: '1px solid var(--border)',
            flexShrink: 0,
          }}
        />
        <span style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}>
          {value}
        </span>
      </div>

      {open && (
        <ColorPickerPopup
          value={value}
          pos={pos}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
