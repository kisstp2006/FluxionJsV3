// ============================================================
// FluxionJS V3 — Auto Inspector
// Reads @field metadata from ComponentRegistry and renders the
// appropriate UI widgets automatically. No hand-written inspector
// needed for standard property types.
//
// Supported field types:
//   number, slider, boolean, string, select, color,
//   vector3 (+ uniformScale), vector2, euler, asset,
//   array (editable list), union (type picker)
//
// Extra features:
//   · group       — fields with the same group key render inside a
//                   collapsible sub-Section
//   · visibleIf   — field shown only when predicate returns true
//   · description — hover tooltip on the field label (shows ⓘ icon)
//   · diff-based memo — AutoProperty skips re-render when the
//                   field key is not present in comp.__dirtyProps
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import {
  Section, PropertyRow,
  NumberInput, Slider, Checkbox, Select, ColorInput,
  Vector3Input, Vector2Input, TextInput, AssetInput, Icons,
} from '../../../ui';
import { ComponentSection } from './ComponentSection';
import { useEngine } from '../../../core/EditorContext';
import { EntityId } from '../../../../src/core/ECS';
import { BaseComponent } from '../../../../src/core/BaseComponent';
import { ComponentRegistry } from '../../../../src/core/ComponentRegistry';
import type { FieldMeta } from '../../../../src/core/ComponentDecorators';
import { undoManager } from '../../../core/UndoService';
import { setProperty, setColorProperty, markComponentDirty } from '../../../core/ComponentService';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

// ── Default value factory ──────────────────────────────────────────────────────

function _defaultValueForType(type?: string): unknown {
  switch (type) {
    case 'number': case 'slider': return 0;
    case 'boolean': return false;
    case 'string': return '';
    case 'vector3': case 'euler': return new THREE.Vector3();
    case 'vector2': return new THREE.Vector2();
    case 'color': return new THREE.Color(1, 1, 1);
    default: return null;
  }
}

// ── Label with optional description tooltip ───────────────────────────────────

function _fieldLabel(field: FieldMeta): React.ReactNode {
  const text = field.label || field.key;
  if (!field.description) return text;
  return (
    <span title={field.description} style={{ cursor: 'help' }}>
      {text} <span style={{ fontSize: '10px', opacity: 0.6 }}>ⓘ</span>
    </span>
  );
}

// ── Per-element row inside an array field ─────────────────────────────────────

interface ArrayItemRowProps {
  index: number;
  arr: unknown[];
  itemType?: string;
  comp: BaseComponent;
  fieldKey: string;
  onUpdate: () => void;
}

const ArrayItemRow: React.FC<ArrayItemRowProps> = ({ index, arr, itemType, comp, fieldKey, onUpdate }) => {
  const value = arr[index];

  const commit = (newVal: unknown) => {
    arr[index] = newVal;
    markComponentDirty(comp, fieldKey);
    onUpdate();
  };

  const removeItem = () => {
    arr.splice(index, 1);
    markComponentDirty(comp, fieldKey);
    onUpdate();
  };

  const rowLabel = (
    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      [{index}]
    </span>
  );

  let widget: React.ReactNode = null;
  switch (itemType) {
    case 'number': case 'slider':
      widget = (
        <NumberInput
          value={typeof value === 'number' ? value : 0}
          onChange={commit}
        />
      );
      break;
    case 'boolean':
      widget = (
        <Checkbox
          checked={!!value}
          onChange={commit}
        />
      );
      break;
    case 'string':
      widget = (
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChange={commit}
        />
      );
      break;
    case 'vector3': case 'euler': {
      const v3 = (value instanceof THREE.Vector3 || value instanceof THREE.Euler)
        ? value
        : new THREE.Vector3();
      widget = (
        <Vector3Input
          value={v3 as any}
          onChange={(axis, val) => { (v3 as any)[axis] = val; commit(v3); }}
        />
      );
      break;
    }
    case 'vector2': {
      const v2 = value instanceof THREE.Vector2 ? value : new THREE.Vector2();
      widget = (
        <Vector2Input
          value={v2}
          onChange={(axis, val) => { (v2 as any)[axis] = val; commit(v2); }}
        />
      );
      break;
    }
    case 'color': {
      const col = value instanceof THREE.Color ? value : new THREE.Color(1, 1, 1);
      widget = (
        <ColorInput
          value={`#${col.getHexString()}`}
          onChange={(hex) => { col.set(hex); commit(col); }}
        />
      );
      break;
    }
    default:
      widget = <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{String(value ?? '')}</span>;
  }

  return (
    <PropertyRow label={rowLabel}>
      <div style={{ display: 'flex', gap: '4px', flex: 1, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>{widget}</div>
        <button
          onClick={removeItem}
          title="Remove element"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1,
            padding: '0 2px', flexShrink: 0,
          }}
        >×</button>
      </div>
    </PropertyRow>
  );
};

// ── Curve editor ─────────────────────────────────────────────────────────────

export interface CurveKeyframe {
  time: number;
  value: number;
  inTangent?: number;
  outTangent?: number;
}

const CURVE_W = 220;
const CURVE_H = 100;

const CurveEditorWidget: React.FC<{
  keyframes: CurveKeyframe[];
  min?: number;
  max?: number;
  onChange: (kfs: CurveKeyframe[]) => void;
}> = ({ keyframes, min = 0, max = 1, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<number | null>(null);
  const [, forceUpdate] = useState(0);

  const kfs = keyframes.length ? [...keyframes].sort((a, b) => a.time - b.time) : [
    { time: 0, value: 0 }, { time: 1, value: 1 },
  ];

  const toCanvas = (t: number, v: number) => ({
    x: t * CURVE_W,
    y: CURVE_H - ((v - min) / (max - min)) * CURVE_H,
  });
  const fromCanvas = (cx: number, cy: number) => ({
    time: Math.max(0, Math.min(1, cx / CURVE_W)),
    value: min + (1 - cy / CURVE_H) * (max - min),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, CURVE_W, CURVE_H);

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(CURVE_W * i / 4, 0); ctx.lineTo(CURVE_W * i / 4, CURVE_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, CURVE_H * i / 4); ctx.lineTo(CURVE_W, CURVE_H * i / 4); ctx.stroke();
    }

    // Curve path (cubic bezier via tangents)
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= kfs.length - 1; i++) {
      const p0 = toCanvas(kfs[i].time, kfs[i].value);
      if (i === 0) ctx.moveTo(p0.x, p0.y);
      if (i < kfs.length - 1) {
        const p1 = toCanvas(kfs[i + 1].time, kfs[i + 1].value);
        const dt = (kfs[i + 1].time - kfs[i].time) / 3;
        const outT = (kfs[i].outTangent ?? 0) * dt * CURVE_W;
        const inT  = (kfs[i + 1].inTangent  ?? 0) * dt * CURVE_W;
        ctx.bezierCurveTo(
          p0.x + outT,  p0.y - (kfs[i].outTangent ?? 0) * dt * CURVE_H,
          p1.x - inT,   p1.y + (kfs[i + 1].inTangent ?? 0) * dt * CURVE_H,
          p1.x, p1.y,
        );
      }
    }
    ctx.stroke();

    // Keyframe dots
    for (let i = 0; i < kfs.length; i++) {
      const p = toCanvas(kfs[i].time, kfs[i].value);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = draggingRef.current === i ? '#f0a500' : '#fff';
      ctx.fill();
      ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  const hitTest = (cx: number, cy: number): number => {
    for (let i = 0; i < kfs.length; i++) {
      const p = toCanvas(kfs[i].time, kfs[i].value);
      if (Math.hypot(cx - p.x, cy - p.y) <= 7) return i;
    }
    return -1;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hit = hitTest(cx, cy);
    if (e.button === 2 && hit >= 0 && kfs.length > 2) {
      // Right-click: remove keyframe
      kfs.splice(hit, 1);
      onChange([...kfs]);
      forceUpdate(n => n + 1);
      return;
    }
    if (hit >= 0) {
      draggingRef.current = hit;
    } else if (e.button === 0) {
      // Click empty: add keyframe
      const { time, value } = fromCanvas(cx, cy);
      const newKf: CurveKeyframe = { time, value };
      kfs.push(newKf);
      kfs.sort((a, b) => a.time - b.time);
      draggingRef.current = kfs.findIndex(k => k === newKf);
      onChange([...kfs]);
      forceUpdate(n => n + 1);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingRef.current === null) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const pos = fromCanvas(e.clientX - rect.left, e.clientY - rect.top);
    const idx = draggingRef.current;
    kfs[idx] = { ...kfs[idx], time: pos.time, value: pos.value };
    // Re-sort while keeping index tracking
    const moved = kfs[idx];
    kfs.sort((a, b) => a.time - b.time);
    draggingRef.current = kfs.indexOf(moved);
    onChange([...kfs]);
    forceUpdate(n => n + 1);
  };

  const onMouseUp = () => { draggingRef.current = null; };

  return (
    <canvas
      ref={canvasRef}
      width={CURVE_W}
      height={CURVE_H}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={e => e.preventDefault()}
      style={{
        display: 'block', width: '100%', height: CURVE_H,
        background: 'var(--bg-deep)', borderRadius: 4,
        border: '1px solid var(--border)', cursor: 'crosshair',
      }}
    />
  );
};

// ── Gradient editor ────────────────────────────────────────────────────────────

export interface GradientStop {
  time: number;
  color: [number, number, number]; // r, g, b in [0, 1]
}

const GRAD_W = 220;
const GRAD_H = 24;
const STOP_H = 12;

const GradientEditorWidget: React.FC<{
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}> = ({ stops, onChange }) => {
  const barRef = useRef<HTMLCanvasElement>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const draggingRef = useRef<number | null>(null);
  const [, forceUpdate] = useState(0);

  const sorted = [...stops].sort((a, b) => a.time - b.time);

  useEffect(() => {
    const canvas = barRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, GRAD_W, GRAD_H + STOP_H);

    // Gradient bar
    if (sorted.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, GRAD_W, 0);
      for (const s of sorted) {
        const [r, g, b] = s.color;
        grad.addColorStop(s.time, `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GRAD_W, GRAD_H);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, GRAD_W, GRAD_H);

    // Stop markers
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const x = s.time * GRAD_W;
      const [r, g, b] = s.color;
      ctx.beginPath();
      ctx.moveTo(x, GRAD_H);
      ctx.lineTo(x - 5, GRAD_H + STOP_H);
      ctx.lineTo(x + 5, GRAD_H + STOP_H);
      ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
      ctx.fill();
      ctx.strokeStyle = selectedIdx === i ? '#f0a500' : '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  const hitStop = (cx: number): number => {
    for (let i = 0; i < sorted.length; i++) {
      if (Math.abs(sorted[i].time * GRAD_W - cx) <= 6) return i;
    }
    return -1;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = barRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const hit = hitStop(cx);
    if (e.button === 2 && hit >= 0 && sorted.length > 2) {
      sorted.splice(hit, 1);
      onChange([...sorted]);
      setSelectedIdx(null);
      return;
    }
    if (hit >= 0) {
      draggingRef.current = hit;
      setSelectedIdx(hit);
    } else if (e.button === 0) {
      // Interpolate color at click position
      const t = Math.max(0, Math.min(1, cx / GRAD_W));
      let col: [number, number, number] = [1, 1, 1];
      for (let i = 0; i < sorted.length - 1; i++) {
        if (t >= sorted[i].time && t <= sorted[i + 1].time) {
          const alpha = (t - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
          col = sorted[i].color.map((c, ci) => c + alpha * (sorted[i + 1].color[ci] - c)) as [number, number, number];
          break;
        }
      }
      const newStop: GradientStop = { time: t, color: col };
      sorted.push(newStop);
      sorted.sort((a, b) => a.time - b.time);
      const idx = sorted.indexOf(newStop);
      draggingRef.current = idx;
      setSelectedIdx(idx);
      onChange([...sorted]);
      forceUpdate(n => n + 1);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingRef.current === null) return;
    const rect = barRef.current!.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / GRAD_W));
    const moved = sorted[draggingRef.current];
    moved.time = t;
    sorted.sort((a, b) => a.time - b.time);
    draggingRef.current = sorted.indexOf(moved);
    setSelectedIdx(draggingRef.current);
    onChange([...sorted]);
    forceUpdate(n => n + 1);
  };

  const onMouseUp = () => { draggingRef.current = null; };

  const selected = selectedIdx !== null ? sorted[selectedIdx] : null;

  return (
    <div>
      <canvas
        ref={barRef}
        width={GRAD_W}
        height={GRAD_H + STOP_H}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onContextMenu={e => e.preventDefault()}
        style={{
          display: 'block', width: '100%', height: GRAD_H + STOP_H,
          cursor: 'crosshair',
        }}
      />
      {selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            t={selected.time.toFixed(2)}
          </span>
          <ColorInput
            value={`#${selected.color.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`}
            onChange={(hex) => {
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              selected.color = [r, g, b];
              onChange([...sorted]);
              forceUpdate(n => n + 1);
            }}
          />
        </div>
      )}
    </div>
  );
};

// ── Entity picker ─────────────────────────────────────────────────────────────

const EntityPickerWidget: React.FC<{
  value: number | null;
  getEntityName: (id: number) => string;
  onChange: (id: number | null) => void;
}> = ({ value, getEntityName, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const displayName = value !== null ? `#${value} ${getEntityName(value)}` : 'None';

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        style={{
          width: '100%', background: 'var(--bg-input)', border: '1px solid var(--accent)',
          borderRadius: 3, color: 'var(--text)', padding: '2px 6px', fontSize: '12px',
        }}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const id = parseInt(draft, 10);
            onChange(isNaN(id) ? null : id);
            setEditing(false);
          } else if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        onBlur={() => setEditing(false)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
      <div
        style={{
          flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
          borderRadius: 3, padding: '2px 6px', fontSize: '12px',
          color: value !== null ? 'var(--text)' : 'var(--text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {displayName}
      </div>
      <button
        onClick={() => { setDraft(value !== null ? String(value) : ''); setEditing(true); }}
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 3,
          color: 'var(--text-muted)', fontSize: '11px', padding: '0 5px', cursor: 'pointer',
        }}
      >⊙</button>
      {value !== null && (
        <button
          onClick={() => onChange(null)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: '13px', padding: '0 2px', cursor: 'pointer',
          }}
        >×</button>
      )}
    </div>
  );
};

// ── Single field renderer ─────────────────────────────────────────────────────

interface AutoPropertyProps {
  comp: BaseComponent;
  field: FieldMeta;
  onUpdate: () => void;
  /** Increments on every parent re-render; triggers arePropsEqual evaluation. */
  _rev: number;
}

const AutoProperty = React.memo<AutoPropertyProps>(
  ({ comp, field, onUpdate }) => {
    const value = (comp as any)[field.key];
    const label = _fieldLabel(field);
    const [uniformLocked, setUniformLocked] = useState(false);
    const [arrayOpen, setArrayOpen] = useState(true);
    const [activeUnionType, setActiveUnionType] = useState<string>(
      field.unionTypes?.[0] ?? 'string',
    );

    switch (field.type) {
      case 'number':
        return (
          <PropertyRow label={label}>
            <NumberInput
              value={typeof value === 'number' ? value : 0}
              step={field.step}
              min={field.min}
              max={field.max}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'slider':
        return (
          <PropertyRow label={label}>
            <Slider
              value={typeof value === 'number' ? value : 0}
              min={field.min ?? 0}
              max={field.max ?? 1}
              step={field.step}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'boolean':
        return (
          <PropertyRow label={label}>
            <Checkbox
              checked={!!value}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'string':
        return (
          <PropertyRow label={label}>
            <TextInput
              value={value ?? ''}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'select':
        return (
          <PropertyRow label={label}>
            <Select
              value={value}
              options={field.options ?? []}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );

      case 'color': {
        if (!(value instanceof THREE.Color)) return null;
        return (
          <PropertyRow label={label}>
            <ColorInput
              value={`#${value.getHexString()}`}
              onChange={(v) => { setColorProperty(undoManager, comp, field.key, v); onUpdate(); }}
            />
          </PropertyRow>
        );
      }

      case 'vector3': {
        if (!(value instanceof THREE.Vector3)) return null;
        if (field.uniformScale) {
          return (
            <PropertyRow label={label}>
              <div style={{ display: 'flex', gap: '4px', flex: 1, alignItems: 'center' }}>
                <Vector3Input
                  value={value}
                  onChange={(axis, val) => {
                    if (uniformLocked && (value as any)[axis] !== 0) {
                      const ratio = val / (value as any)[axis];
                      value.x = axis === 'x' ? val : value.x * ratio;
                      value.y = axis === 'y' ? val : value.y * ratio;
                      value.z = axis === 'z' ? val : value.z * ratio;
                    } else {
                      (value as any)[axis] = val;
                    }
                    markComponentDirty(comp, field.key);
                    onUpdate();
                  }}
                />
                <button
                  onClick={() => setUniformLocked(l => !l)}
                  title={uniformLocked ? 'Unlock uniform scale' : 'Lock uniform scale'}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    padding: '2px 5px',
                    color: uniformLocked ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: '10px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {uniformLocked ? Icons.lock : Icons.unlock}
                </button>
              </div>
            </PropertyRow>
          );
        }
        return (
          <PropertyRow label={label}>
            <Vector3Input
              value={value}
              onChange={(axis, val) => {
                (value as any)[axis] = val;
                markComponentDirty(comp, field.key);
                onUpdate();
              }}
            />
          </PropertyRow>
        );
      }

      case 'vector2': {
        if (!(value instanceof THREE.Vector2)) return null;
        return (
          <PropertyRow label={label}>
            <Vector2Input
              value={value}
              onChange={(axis, val) => {
                (value as any)[axis] = val;
                markComponentDirty(comp, field.key);
                onUpdate();
              }}
            />
          </PropertyRow>
        );
      }

      case 'euler': {
        if (!(value instanceof THREE.Euler)) return null;
        // Convert radians (stored) ↔ degrees (displayed)
        const asDeg = {
          x: value.x * RAD2DEG,
          y: value.y * RAD2DEG,
          z: value.z * RAD2DEG,
        };
        return (
          <PropertyRow label={label}>
            <Vector3Input
              value={asDeg}
              step={0.1}
              onChange={(axis, deg) => {
                (value as any)[axis] = deg * DEG2RAD;
                markComponentDirty(comp, field.key);
                onUpdate();
              }}
            />
          </PropertyRow>
        );
      }

      case 'asset': {
        if (!field.assetType) return null;
        return (
          <PropertyRow label={label}>
            <AssetInput
              value={value}
              assetType={field.assetType}
              onChange={(v) => { setProperty(undoManager, comp, field.key, v || null); onUpdate(); }}
            />
          </PropertyRow>
        );
      }

      case 'array': {
        const arr: unknown[] = Array.isArray(value) ? value : [];
        // Ensure the component property always holds the array reference
        if (!Array.isArray((comp as any)[field.key])) {
          (comp as any)[field.key] = arr;
        }
        return (
          <div>
            <PropertyRow label={label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', flex: 1 }}>
                  {field.itemType ?? 'any'} × {arr.length}
                </span>
                <button
                  onClick={() => setArrayOpen(o => !o)}
                  title={arrayOpen ? 'Collapse' : 'Expand'}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: '11px', padding: '0 3px',
                  }}
                >
                  {arrayOpen ? '▾' : '▸'}
                </button>
                <button
                  onClick={() => {
                    arr.push(_defaultValueForType(field.itemType));
                    markComponentDirty(comp, field.key);
                    onUpdate();
                  }}
                  title="Add element"
                  style={{
                    background: 'none', border: '1px solid var(--border)',
                    borderRadius: '3px', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: '12px',
                    padding: '0 5px', lineHeight: '16px',
                  }}
                >+</button>
              </div>
            </PropertyRow>
            {arrayOpen && arr.map((_, i) => (
              <ArrayItemRow
                key={i}
                index={i}
                arr={arr}
                itemType={field.itemType}
                comp={comp}
                fieldKey={field.key}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        );
      }

      case 'union': {
        const types = field.unionTypes ?? [];
        if (types.length === 0) return null;
        // Build a synthetic FieldMeta for the active type's widget
        const syntheticField: FieldMeta = {
          ...field,
          type: activeUnionType as any,
          label: '',
          key: field.key,
        };
        return (
          <div>
            <PropertyRow label={label}>
              <Select
                value={activeUnionType}
                options={types.map(t => ({ value: t, label: t }))}
                onChange={t => setActiveUnionType(t)}
              />
            </PropertyRow>
            <AutoProperty comp={comp} field={syntheticField} onUpdate={onUpdate} _rev={0} />
          </div>
        );
      }

      default:
        return null;
    }
  },
  // Diff-based memo: skip re-render if this field is not in __dirtyProps.
  // Falls back to full re-render if dirty tracking is unavailable.
  (_prev, next) => {
    if (!next.comp.__dirtyProps) return false; // no tracking → always re-render
    return !next.comp.__dirtyProps.has(next.field.key); // skip if not dirty
  },
);

// ── Grouped field list ───────────────────────────────────────────────────────

const GroupedFields: React.FC<{
  fields: readonly FieldMeta[];
  comp: BaseComponent;
  onUpdate: () => void;
  rev: number;
}> = ({ fields, comp, onUpdate, rev }) => {
  // Partition into ungrouped (rendered inline) and grouped (sub-Sections)
  const ungrouped: FieldMeta[] = [];
  const groups = new Map<string, FieldMeta[]>();

  for (const f of fields) {
    if (f.visibleIf && !f.visibleIf(comp)) continue;
    if (f.group) {
      let arr = groups.get(f.group);
      if (!arr) { arr = []; groups.set(f.group, arr); }
      arr.push(f);
    } else {
      ungrouped.push(f);
    }
  }

  return (
    <>
      {ungrouped.map(f => (
        <AutoProperty key={f.key} comp={comp} field={f} onUpdate={onUpdate} _rev={rev} />
      ))}
      {[...groups.entries()].map(([groupName, groupFields]) => (
        <Section key={groupName} title={groupName} defaultOpen={false}>
          {groupFields.map(f => (
            <AutoProperty key={f.key} comp={comp} field={f} onUpdate={onUpdate} _rev={rev} />
          ))}
        </Section>
      ))}
    </>
  );
};

// ── Main AutoInspector ────────────────────────────────────────────────────────

export const AutoInspector: React.FC<{
  entity: EntityId;
  componentType: string;
  onRemoved: () => void;
}> = ({ entity, componentType, onRemoved }) => {
  const engine = useEngine();
  const [rev, setRev] = useState(0);
  if (!engine) return null;

  const comp = engine.engine.ecs.getComponent(entity, componentType) as BaseComponent | null;
  if (!comp) return null;

  const reg = ComponentRegistry.get(componentType);
  if (!reg) return null;

  const update = useCallback(() => setRev(r => r + 1), []);

  return (
    <ComponentSection entity={entity} componentType={componentType} onRemoved={onRemoved}>
      <GroupedFields fields={reg.fields} comp={comp} onUpdate={update} rev={rev} />
    </ComponentSection>
  );
};
