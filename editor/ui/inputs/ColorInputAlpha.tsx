// ============================================================
// FluxionJS V3 — HSV Color Picker with Alpha
// value/onChange use "#RRGGBBAA" (8-digit hex).
// Accepts "#RRGGBB" on input — alpha defaults to FF.
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ── Color math ────────────────────────────────────────────────

function hexToHsva(hex: string): [number, number, number, number] {
  const c = hex.replace('#', '').padEnd(8, 'ff');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const a = parseInt(c.slice(6, 8), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? (d / max) * 100 : 0, max * 100, a * 100];
}

function hsvaToHex(h: number, s: number, v: number, a: number): string {
  s /= 100; v /= 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  const pad = (n: number) => n.toString(16).padStart(2, '0');
  const aa = Math.round((a / 100) * 255);
  return `#${pad(f(5))}${pad(f(3))}${pad(f(1))}${pad(aa)}`;
}

function hexToRgba(hex: string): [number, number, number, number] {
  const c = hex.replace('#', '').padEnd(8, 'ff');
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
    parseInt(c.slice(6, 8), 16),
  ];
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

const isValidHex = (s: string) => /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s);

// ── Checkerboard swatch background ───────────────────────────

const CHECKER = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\'%3E%3Crect width=\'5\' height=\'5\' fill=\'%23ccc\'/%3E%3Crect x=\'5\' y=\'5\' width=\'5\' height=\'5\' fill=\'%23ccc\'/%3E%3Crect x=\'5\' width=\'5\' height=\'5\' fill=\'%23fff\'/%3E%3Crect y=\'5\' width=\'5\' height=\'5\' fill=\'%23fff\'/%3E%3C/svg%3E")';

// ── Popup ─────────────────────────────────────────────────────

interface PopupProps {
  value: string;
  pos: { x: number; y: number };
  onChange: (hex8: string) => void;
  onClose: () => void;
}

const ColorAlphaPickerPopup = React.memo<PopupProps>(({ value, pos, onChange, onClose }) => {
  const [hsva, setHsva] = useState<[number, number, number, number]>(() => hexToHsva(value));
  const [hexStr, setHexStr] = useState(() => {
    const c = value.replace('#', '').padEnd(8, 'ff');
    return `#${c.slice(0, 6)}`;
  });
  const [alphaStr, setAlphaStr] = useState(() => {
    const c = value.replace('#', '').padEnd(8, 'ff');
    return String(parseInt(c.slice(6, 8), 16));
  });
  const [rgba, setRgba] = useState<[string, string, string, string]>(() => {
    const [r, g, b, a] = hexToRgba(value);
    return [String(r), String(g), String(b), String(a)];
  });

  const hsvaRef = useRef(hsva);
  hsvaRef.current = hsva;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const dragRef    = useRef<'sv' | 'hue' | 'alpha' | null>(null);
  const svAreaRef  = useRef<HTMLDivElement>(null);
  const hueAreaRef = useRef<HTMLDivElement>(null);
  const alphaAreaRef = useRef<HTMLDivElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);

  const applyHsva = useCallback((next: [number, number, number, number]) => {
    hsvaRef.current = next;
    setHsva(next);
    const hex8 = hsvaToHex(next[0], next[1], next[2], next[3]);
    const [r, g, b, a] = hexToRgba(hex8);
    setHexStr(`#${hex8.slice(1, 7)}`);
    setAlphaStr(String(a));
    setRgba([String(r), String(g), String(b), String(a)]);
    onChangeRef.current(hex8);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const [ch, cs, cv, ca] = hsvaRef.current;
    if (dragRef.current === 'sv' && svAreaRef.current) {
      const rect = svAreaRef.current.getBoundingClientRect();
      const s = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 100;
      const v = (1 - clamp((e.clientY - rect.top) / rect.height, 0, 1)) * 100;
      applyHsva([ch, s, v, ca]);
    } else if (dragRef.current === 'hue' && hueAreaRef.current) {
      const rect = hueAreaRef.current.getBoundingClientRect();
      const h = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 360;
      applyHsva([h, cs, cv, ca]);
    } else if (dragRef.current === 'alpha' && alphaAreaRef.current) {
      const rect = alphaAreaRef.current.getBoundingClientRect();
      const a = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 100;
      applyHsva([ch, cs, cv, a]);
    }
  }, [applyHsva]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const startDrag = useCallback((target: 'sv' | 'hue' | 'alpha', e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = target;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    handleMouseMove(e.nativeEvent);
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const commitHex = useCallback((raw: string) => {
    const norm = raw.startsWith('#') ? raw : `#${raw}`;
    if (/^#[0-9a-fA-F]{6}$/.test(norm)) {
      const [, , , ca] = hsvaRef.current;
      const [h, s, v] = hexToHsva(norm + 'ff');
      applyHsva([h, s, v, ca]);
    } else {
      setHexStr(`#${hsvaToHex(hsvaRef.current[0], hsvaRef.current[1], hsvaRef.current[2], 100).slice(1, 7)}`);
    }
  }, [applyHsva]);

  const commitChannel = useCallback((idx: 0 | 1 | 2, raw: string) => {
    const parsed = parseInt(raw, 10);
    const [h, s, v, ca] = hsvaRef.current;
    const [r, g, b] = hexToRgba(hsvaToHex(h, s, v, 100));
    const ch: [number, number, number] = [r, g, b];
    if (isNaN(parsed)) {
      setRgba(prev => { const n = [...prev] as typeof prev; n[idx] = String(ch[idx]); return n; });
      return;
    }
    ch[idx] = clamp(parsed, 0, 255);
    const [nh, ns, nv] = hexToHsva(`#${ch.map(x => x.toString(16).padStart(2, '0')).join('')}ff`);
    applyHsva([nh, ns, nv, ca]);
  }, [applyHsva]);

  const commitAlpha = useCallback((raw: string) => {
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) { setAlphaStr(String(Math.round((hsvaRef.current[3] / 100) * 255))); return; }
    const [ch, cs, cv] = hsvaRef.current;
    applyHsva([ch, cs, cv, (clamp(parsed, 0, 255) / 255) * 100]);
  }, [applyHsva]);

  const [h, s, v, a] = hsva;
  const pureHue = hsvaToHex(h, 100, 100, 100).slice(0, 7);
  const currentRgbHex = hsvaToHex(h, s, v, 100).slice(0, 7);
  const currentFull = hsvaToHex(h, s, v, a);
  const alphaFraction = a / 100;

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 10000,
        width: '220px', background: 'var(--bg-panel)',
        border: '1px solid var(--border)', borderRadius: '8px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.55)', overflow: 'hidden', userSelect: 'none',
      }}
    >
      {/* SV area */}
      <div ref={svAreaRef} onMouseDown={(e) => startDrag('sv', e)}
        style={{ position: 'relative', width: '100%', height: '150px', background: pureHue, cursor: 'crosshair' }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #fff, transparent)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent, #000)' }} />
        <div style={{
          position: 'absolute', left: `${s}%`, top: `${100 - v}%`,
          transform: 'translate(-50%, -50%)', width: '12px', height: '12px',
          borderRadius: '50%', border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.2)',
          background: currentRgbHex, pointerEvents: 'none',
        }} />
      </div>

      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Hue */}
        <div ref={hueAreaRef} onMouseDown={(e) => startDrag('hue', e)}
          style={{
            position: 'relative', height: '12px', borderRadius: '6px',
            background: 'linear-gradient(to right,#f00 0%,#ff0 16.67%,#0f0 33.33%,#0ff 50%,#00f 66.67%,#f0f 83.33%,#f00 100%)',
            cursor: 'ew-resize',
          }}
        >
          <div style={{
            position: 'absolute', left: `${(h / 360) * 100}%`, top: '50%',
            transform: 'translate(-50%, -50%)', width: '16px', height: '16px',
            borderRadius: '50%', border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.4)',
            background: pureHue, pointerEvents: 'none',
          }} />
        </div>

        {/* Alpha */}
        <div ref={alphaAreaRef} onMouseDown={(e) => startDrag('alpha', e)}
          style={{ position: 'relative', height: '12px', borderRadius: '6px', cursor: 'ew-resize', overflow: 'hidden' }}
        >
          <div style={{ position: 'absolute', inset: 0, backgroundImage: CHECKER, backgroundSize: '10px 10px' }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '6px',
            background: `linear-gradient(to right, transparent, ${currentRgbHex})`,
          }} />
          <div style={{
            position: 'absolute', left: `${alphaFraction * 100}%`, top: '50%',
            transform: 'translate(-50%, -50%)', width: '16px', height: '16px',
            borderRadius: '50%', border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.4)',
            background: currentFull, pointerEvents: 'none',
          }} />
        </div>

        {/* Swatch + hex */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{
            width: '30px', height: '30px', flexShrink: 0, borderRadius: '5px',
            border: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: CHECKER, backgroundSize: '10px 10px' }} />
            <div style={{ position: 'absolute', inset: 0, background: currentFull }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.4px' }}>HEX</span>
            <input
              value={hexStr}
              onChange={(e) => setHexStr(e.target.value)}
              onBlur={(e) => commitHex(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitHex(hexStr); e.currentTarget.blur(); } }}
              spellCheck={false}
              style={{
                width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: '4px', color: 'var(--text-primary)', fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)', padding: '3px 6px',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* RGBA inputs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['R', 'G', 'B'] as const).map((label, i) => (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.4px' }}>{label}</span>
              <input
                value={rgba[i]}
                onChange={(e) => setRgba(prev => { const n = [...prev] as typeof prev; n[i] = e.target.value; return n; })}
                onBlur={(e) => commitChannel(i as 0 | 1 | 2, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { commitChannel(i as 0 | 1 | 2, rgba[i]); e.currentTarget.blur(); } }}
                style={{
                  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: '4px', color: 'var(--text-primary)', fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)', padding: '3px 0',
                  textAlign: 'center', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.4px' }}>A</span>
            <input
              value={rgba[3]}
              onChange={(e) => setRgba(prev => { const n = [...prev] as typeof prev; n[3] = e.target.value; return n; })}
              onBlur={(e) => commitAlpha(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitAlpha(rgba[3]); e.currentTarget.blur(); } }}
              style={{
                width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: '4px', color: 'var(--text-primary)', fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)', padding: '3px 0',
                textAlign: 'center', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Trigger ───────────────────────────────────────────────────

interface ColorInputAlphaProps {
  /** Current value as "#RRGGBB" or "#RRGGBBAA". */
  value: string;
  /** Called with "#RRGGBBAA". */
  onChange: (value: string) => void;
}

export const ColorInputAlpha: React.FC<ColorInputAlphaProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ x: 0, y: 0 });
  const swatchRef       = useRef<HTMLDivElement>(null);

  const norm = value.replace('#', '').padEnd(8, 'ff');
  const rgbHex  = `#${norm.slice(0, 6)}`;
  const alphaByte = parseInt(norm.slice(6, 8), 16);
  const alphaFrac = alphaByte / 255;

  const handleOpen = useCallback(() => {
    const rect = swatchRef.current?.getBoundingClientRect();
    if (!rect) return;
    const POPUP_H = 340;
    const POPUP_W = 220;
    const y = rect.bottom + 6 + POPUP_H > window.innerHeight ? rect.top - POPUP_H - 6 : rect.bottom + 6;
    const x = rect.left + POPUP_W > window.innerWidth ? window.innerWidth - POPUP_W - 8 : rect.left;
    setPos({ x, y });
    setOpen(true);
  }, []);

  const display = value.length === 9 ? value : `#${norm.slice(0, 6)}`;

  return (
    <>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1, cursor: 'pointer' }} onClick={handleOpen}>
        <div ref={swatchRef} title={value}
          style={{
            width: '22px', height: '22px', borderRadius: '4px',
            border: '1px solid var(--border)', flexShrink: 0,
            position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, backgroundImage: CHECKER, backgroundSize: '10px 10px' }} />
          <div style={{ position: 'absolute', inset: 0, background: `rgba(${parseInt(norm.slice(0,2),16)},${parseInt(norm.slice(2,4),16)},${parseInt(norm.slice(4,6),16)},${alphaFrac})` }} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: 'var(--text-muted)' }}>
          {display}
        </span>
      </div>

      {open && (
        <ColorAlphaPickerPopup
          value={`#${norm}`}
          pos={pos}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
