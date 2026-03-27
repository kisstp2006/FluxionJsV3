// ============================================================
// FluxionJS V3 — FUI Editor (Standalone Window Component)
// Interactive canvas: click-to-select, drag move/resize,
// grid/snap, undo/redo (50 steps), duplicate, alignment,
// arrow key nudge (1px / 10px w/ Shift), status bar.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelHeader, Section, PropertyRow, TextInput, NumberInput, ColorInput, Select, Slider } from '../../ui';
import { getFileSystem } from '../../../src/filesystem';
import type { FuiDocument, FuiNode, FuiMode, FuiPanelNode, FuiRect, FuiAnimation, FuiAnimationTrack, FuiKeyframe, FuiAnimatableProperty } from '../../../src/ui/FuiTypes';
import { parseFuiJson } from '../../../src/ui/FuiParser';
import { compileFui, renderFuiToCanvas } from '../../../src/ui/FuiRenderer';
import { applyAnimation } from '../../../src/ui/FuiAnimator';

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

type SelectedNode = { node: FuiNode; path: number[] } | null;
type AddNodeType = 'panel' | 'label' | 'button';
type AlignType = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';

const ANIMATABLE_PROP_OPTIONS: { value: FuiAnimatableProperty; label: string }[] = [
  { value: 'x', label: 'X' }, { value: 'y', label: 'Y' },
  { value: 'w', label: 'Width' }, { value: 'h', label: 'Height' },
  { value: 'opacity', label: 'Opacity' }, { value: 'fontSize', label: 'Font Size' },
  { value: 'borderWidth', label: 'Border Width' },
];

const EASING_OPTIONS = [
  { value: 'linear', label: 'Linear' }, { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' }, { value: 'ease-in-out', label: 'Ease In/Out' },
  { value: 'step', label: 'Step' },
];

interface DragState {
  type: 'move' | 'resize';
  handle: number; // -1 = move, 0–7 = resize handle index
  path: number[];
  startMouseDocX: number;
  startMouseDocY: number;
  startRelRect: FuiRect;
  draftRelRect: FuiRect;
}

// ═══════════════════════════════════════════
// Tree helpers
// ═══════════════════════════════════════════

function walkNodes(root: FuiNode): Array<{ node: FuiNode; depth: number; path: number[] }> {
  const out: Array<{ node: FuiNode; depth: number; path: number[] }> = [];
  const rec = (n: FuiNode, depth: number, path: number[]) => {
    out.push({ node: n, depth, path });
    if ((n as any).children)
      ((n as any).children as FuiNode[]).forEach((c, i) => rec(c, depth + 1, [...path, i]));
  };
  rec(root, 0, []);
  return out;
}

function getNodeAtPath(root: FuiNode, path: number[]): FuiNode | null {
  let cur: any = root;
  for (const idx of path) {
    if (!cur?.children) return null;
    cur = cur.children[idx];
  }
  return cur ?? null;
}

function updateNodeAtPath(root: FuiPanelNode, path: number[], updater: (n: any) => void): FuiPanelNode {
  const copy = JSON.parse(JSON.stringify(root)) as FuiPanelNode;
  if (path.length === 0) { updater(copy); return copy; }
  let cur: any = copy;
  for (let i = 0; i < path.length; i++) {
    cur = cur.children?.[path[i]];
    if (!cur) return copy;
    if (i === path.length - 1) updater(cur);
  }
  return copy;
}

function addChildToPath(root: FuiPanelNode, parentPath: number[], newNode: FuiNode): FuiPanelNode {
  return updateNodeAtPath(root, parentPath, (n) => { n.children = [...(n.children ?? []), newNode]; });
}

function deleteAtPath(root: FuiPanelNode, path: number[]): FuiPanelNode {
  if (path.length === 0) return root;
  const copy = JSON.parse(JSON.stringify(root)) as FuiPanelNode;
  let parent: any = copy;
  for (const idx of path.slice(0, -1)) { parent = parent.children?.[idx]; if (!parent) return copy; }
  parent.children?.splice(path[path.length - 1], 1);
  return copy;
}

function swapChildren(root: FuiPanelNode, parentPath: number[], i: number, j: number): FuiPanelNode {
  return updateNodeAtPath(root, parentPath, (n) => {
    const ch = n.children;
    if (!ch || i < 0 || j < 0 || i >= ch.length || j >= ch.length) return;
    [ch[i], ch[j]] = [ch[j], ch[i]];
  });
}

function makeNode(type: AddNodeType): FuiNode {
  const id = `${type}_${Date.now().toString(36)}`;
  if (type === 'panel')
    return { id, type: 'panel', rect: { x: 0, y: 0, w: 200, h: 150 }, style: {}, children: [] } as FuiPanelNode;
  if (type === 'label')
    return { id, type: 'label', rect: { x: 10, y: 10, w: 160, h: 30 }, text: 'Label', style: {} } as any;
  return { id, type: 'button', rect: { x: 10, y: 10, w: 120, h: 36 }, text: 'Button', style: {} } as any;
}

function findPathById(root: FuiNode, targetId: string): number[] | null {
  if (root.id === targetId) return [];
  if ((root as any).children) {
    for (let i = 0; i < (root as any).children.length; i++) {
      const found = findPathById((root as any).children[i], targetId);
      if (found !== null) return [i, ...found];
    }
  }
  return null;
}

function reassignIds(node: any): void {
  node.id = `${node.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  if (node.children) for (const c of node.children) reassignIds(c);
}

function duplicateNode(root: FuiPanelNode, path: number[]): { root: FuiPanelNode; newPath: number[] } {
  if (path.length === 0) return { root, newPath: [] };
  const copy = JSON.parse(JSON.stringify(root)) as FuiPanelNode;
  let parent: any = copy;
  for (const idx of path.slice(0, -1)) { parent = parent?.children?.[idx]; if (!parent) return { root: copy, newPath: path }; }
  const lastIdx = path[path.length - 1];
  const original = parent?.children?.[lastIdx];
  if (!original) return { root: copy, newPath: path };
  const cloned = JSON.parse(JSON.stringify(original));
  if (cloned.rect) { cloned.rect.x = (cloned.rect.x ?? 0) + 10; cloned.rect.y = (cloned.rect.y ?? 0) + 10; }
  reassignIds(cloned);
  parent.children.splice(lastIdx + 1, 0, cloned);
  return { root: copy, newPath: [...path.slice(0, -1), lastIdx + 1] };
}

function getParentSize(doc: FuiDocument, path: number[]): { w: number; h: number } {
  const parentPath = path.slice(0, -1);
  const parent = parentPath.length === 0 ? doc.root : getNodeAtPath(doc.root, parentPath);
  return { w: parent?.rect?.w ?? doc.canvas.width, h: parent?.rect?.h ?? doc.canvas.height };
}

function alignNode(doc: FuiDocument, path: number[], alignment: AlignType): FuiDocument {
  if (!path.length) return doc;
  const node = getNodeAtPath(doc.root, path);
  if (!node?.rect) return doc;
  const { w: nw, h: nh } = node.rect;
  const { w: pw, h: ph } = getParentSize(doc, path);
  const newRoot = updateNodeAtPath(doc.root as FuiPanelNode, path, (n) => {
    if (alignment === 'left')     n.rect.x = 0;
    if (alignment === 'center-h') n.rect.x = (pw - nw) / 2;
    if (alignment === 'right')    n.rect.x = pw - nw;
    if (alignment === 'top')      n.rect.y = 0;
    if (alignment === 'center-v') n.rect.y = (ph - nh) / 2;
    if (alignment === 'bottom')   n.rect.y = ph - nh;
  });
  return { ...doc, root: newRoot };
}

// ═══════════════════════════════════════════
// Canvas interaction helpers
// ═══════════════════════════════════════════

const HANDLE_SIZE = 8;
const HANDLE_HIT = 7;
const HANDLE_CURSORS = [
  'nw-resize', 'n-resize', 'ne-resize',
  'w-resize',              'e-resize',
  'sw-resize', 's-resize', 'se-resize',
];

function getHandlePositions(r: FuiRect): Array<{ x: number; y: number }> {
  return [
    { x: r.x,           y: r.y           }, // 0 TL
    { x: r.x + r.w / 2, y: r.y           }, // 1 TM
    { x: r.x + r.w,     y: r.y           }, // 2 TR
    { x: r.x,           y: r.y + r.h / 2 }, // 3 ML
    { x: r.x + r.w,     y: r.y + r.h / 2 }, // 4 MR
    { x: r.x,           y: r.y + r.h     }, // 5 BL
    { x: r.x + r.w / 2, y: r.y + r.h     }, // 6 BM
    { x: r.x + r.w,     y: r.y + r.h     }, // 7 BR
  ];
}

function hitTestHandle(absRect: FuiRect, sx: number, sy: number, sc: number): number {
  const handles = getHandlePositions(absRect);
  for (let i = 0; i < handles.length; i++) {
    const hx = handles[i].x * sc;
    const hy = handles[i].y * sc;
    if (Math.abs(sx - hx) <= HANDLE_HIT && Math.abs(sy - hy) <= HANDLE_HIT) return i;
  }
  return -1;
}

function applyResizeDrag(start: FuiRect, handle: number, dx: number, dy: number): FuiRect {
  let { x, y, w, h } = start;
  if (handle === 0 || handle === 1 || handle === 2) { y += dy; h -= dy; } // top edge
  if (handle === 5 || handle === 6 || handle === 7) { h += dy; }          // bottom edge
  if (handle === 0 || handle === 3 || handle === 5) { x += dx; w -= dx; } // left edge
  if (handle === 2 || handle === 4 || handle === 7) { w += dx; }          // right edge
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

function snapVal(v: number, g: number): number {
  return Math.round(v / g) * g;
}

function hitTestNodeByDocCoords(doc: FuiDocument, docX: number, docY: number): { path: number[] } | null {
  const compiled = compileFui(doc);
  for (let i = compiled.drawOrder.length - 1; i >= 0; i--) {
    const n = compiled.drawOrder[i];
    const r = n.rect;
    if (docX >= r.x && docX <= r.x + r.w && docY >= r.y && docY <= r.y + r.h) {
      const path = findPathById(doc.root, n.id);
      if (path !== null) return { path };
    }
  }
  return null;
}

// ═══════════════════════════════════════════
// InteractiveCanvas
// ═══════════════════════════════════════════

const InteractiveCanvas: React.FC<{
  doc: FuiDocument;
  scale: number;
  selectedPath: number[] | null;
  gridEnabled: boolean;
  snapEnabled: boolean;
  snapSize: number;
  statusRef: React.RefObject<HTMLSpanElement | null>;
  onSelectPath: (path: number[] | null) => void;
  onCommit: (path: number[], newRelRect: FuiRect) => void;
}> = ({ doc, scale, selectedPath, gridEnabled, snapEnabled, snapSize, statusRef, onSelectPath, onCommit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Refs for imperative handlers (avoid stale closures)
  const docRef = useRef(doc);
  const scaleRef = useRef(scale);
  const selectedPathRef = useRef(selectedPath);
  const gridEnabledRef = useRef(gridEnabled);
  const snapEnabledRef = useRef(snapEnabled);
  const snapSizeRef = useRef(snapSize);
  docRef.current = doc;
  scaleRef.current = scale;
  selectedPathRef.current = selectedPath;
  gridEnabledRef.current = gridEnabled;
  snapEnabledRef.current = snapEnabled;
  snapSizeRef.current = snapSize;

  const [cursor, setCursor] = useState('default');
  const cursorRef = useRef('default');

  // ── Draw (stable, uses only refs) ──
  const drawCanvas = useCallback((overrideDoc?: FuiDocument) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const d = overrideDoc ?? docRef.current;
    const sc = scaleRef.current;
    // Use drag path for selection if dragging (before React re-renders with new selectedPath)
    const selPath = dragRef.current ? dragRef.current.path : selectedPathRef.current;

    const cw = Math.max(1, Math.round(d.canvas.width * sc));
    const ch = Math.max(1, Math.round(d.canvas.height * sc));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }

    renderFuiToCanvas(d, ctx, { scaleX: sc, scaleY: sc });

    // Grid overlay
    if (gridEnabledRef.current) {
      const gp = Math.max(2, snapSizeRef.current * sc);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= cw + gp; x += gp) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
      for (let y = 0; y <= ch + gp; y += gp) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
      ctx.restore();
    }

    // Selection + handles
    if (selPath !== null) {
      const selNode = getNodeAtPath(d.root, selPath);
      if (selNode) {
        const compiled = compileFui(d);
        const cn = compiled.nodeById.get(selNode.id);
        if (cn) {
          const r = cn.rect;
          ctx.save();
          ctx.strokeStyle = '#58a6ff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(r.x * sc, r.y * sc, r.w * sc, r.h * sc);
          ctx.setLineDash([]);
          for (const h of getHandlePositions(r)) {
            const hx = h.x * sc, hy = h.y * sc;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
            ctx.strokeRect(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
          }
          ctx.restore();
        }
      }
    }
  }, []); // stable — uses only refs

  useEffect(() => { drawCanvas(); }, [doc, scale, selectedPath, gridEnabled, snapEnabled, snapSize, drawCanvas]);

  // ── Mouse down ──
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const sc = scaleRef.current;
    const docX = sx / sc, docY = sy / sc;
    const d = docRef.current;
    const selPath = selectedPathRef.current;

    // Check resize handles first
    if (selPath !== null) {
      const selNode = getNodeAtPath(d.root, selPath);
      if (selNode) {
        const cn = compileFui(d).nodeById.get(selNode.id);
        if (cn) {
          const handleIdx = hitTestHandle(cn.rect, sx, sy, sc);
          if (handleIdx >= 0) {
            dragRef.current = {
              type: 'resize', handle: handleIdx, path: selPath,
              startMouseDocX: docX, startMouseDocY: docY,
              startRelRect: { ...selNode.rect! }, draftRelRect: { ...selNode.rect! },
            };
            return;
          }
        }
      }
    }

    // Hit-test nodes (topmost wins)
    const hit = hitTestNodeByDocCoords(d, docX, docY);
    if (hit) {
      const hitNode = getNodeAtPath(d.root, hit.path);
      if (hitNode?.rect) {
        onSelectPath(hit.path);
        dragRef.current = {
          type: 'move', handle: -1, path: hit.path,
          startMouseDocX: docX, startMouseDocY: docY,
          startRelRect: { ...hitNode.rect }, draftRelRect: { ...hitNode.rect },
        };
      }
    } else {
      onSelectPath(null);
    }
  }, [onSelectPath]);

  // ── Mouse move ──
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const sc = scaleRef.current;
    const docX = sx / sc, docY = sy / sc;
    const d = docRef.current;
    const drag = dragRef.current;

    if (drag) {
      const rawDx = docX - drag.startMouseDocX;
      const rawDy = docY - drag.startMouseDocY;
      let nr: FuiRect;

      if (drag.type === 'move') {
        let nx = drag.startRelRect.x + rawDx;
        let ny = drag.startRelRect.y + rawDy;
        if (snapEnabledRef.current) { nx = snapVal(nx, snapSizeRef.current); ny = snapVal(ny, snapSizeRef.current); }
        nr = { ...drag.startRelRect, x: nx, y: ny };
      } else {
        nr = applyResizeDrag(drag.startRelRect, drag.handle, rawDx, rawDy);
        if (snapEnabledRef.current) {
          nr = {
            x: snapVal(nr.x, snapSizeRef.current),
            y: snapVal(nr.y, snapSizeRef.current),
            w: Math.max(1, snapVal(nr.w, snapSizeRef.current)),
            h: Math.max(1, snapVal(nr.h, snapSizeRef.current)),
          };
        }
      }

      drag.draftRelRect = nr;

      if (statusRef.current) {
        statusRef.current.textContent =
          `x: ${Math.round(nr.x)}  y: ${Math.round(nr.y)}  w: ${Math.round(nr.w)}  h: ${Math.round(nr.h)}`;
      }

      // Imperative redraw with draft (no React re-render)
      const draftDoc = {
        ...d,
        root: updateNodeAtPath(d.root as FuiPanelNode, drag.path, (n) => { n.rect = { ...nr }; }),
      };
      drawCanvas(draftDoc);
    } else {
      // Hover: update cursor
      let newCursor = 'default';
      const selPath = selectedPathRef.current;
      if (selPath !== null) {
        const selNode = getNodeAtPath(d.root, selPath);
        if (selNode) {
          const cn = compileFui(d).nodeById.get(selNode.id);
          if (cn) {
            const handleIdx = hitTestHandle(cn.rect, sx, sy, sc);
            if (handleIdx >= 0) {
              newCursor = HANDLE_CURSORS[handleIdx];
            } else {
              const r = cn.rect;
              if (docX >= r.x && docX <= r.x + r.w && docY >= r.y && docY <= r.y + r.h)
                newCursor = 'move';
            }
          }
        }
      }
      if (newCursor !== cursorRef.current) { cursorRef.current = newCursor; setCursor(newCursor); }
    }
  }, [drawCanvas, statusRef]);

  // ── Global mouse up (commit drag) ──
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (statusRef.current) statusRef.current.textContent = '';
      cursorRef.current = 'default';
      setCursor('default');
      onCommitRef.current(drag.path, drag.draftRelRect);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [statusRef]);

  const cw = doc.canvas.width * scale;
  const ch = doc.canvas.height * scale;

  return (
    <canvas
      ref={canvasRef}
      width={Math.max(1, Math.round(cw))}
      height={Math.max(1, Math.round(ch))}
      style={{ width: `${cw}px`, height: `${ch}px`, border: '1px solid var(--border)', borderRadius: 4, background: '#0b1020', cursor, display: 'block' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
    />
  );
};

// ═══════════════════════════════════════════
// Node Tree Item
// ═══════════════════════════════════════════

const NODE_ICONS: Record<string, string> = { panel: '□', label: 'T', button: '⬡' };

const NodeTreeItem: React.FC<{
  node: FuiNode; depth: number; path: number[]; isSelected: boolean; onClick: () => void;
}> = ({ node, depth, isSelected, onClick }) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 6px', paddingLeft: 6 + depth * 14,
      borderRadius: 4, cursor: 'pointer', userSelect: 'none',
      background: isSelected ? 'var(--bg-active)' : 'transparent',
    }}
  >
    <span style={{ color: 'var(--text-muted)', fontSize: 10, width: 12 }}>{NODE_ICONS[node.type] ?? '?'}</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isSelected ? 'var(--accent)' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {node.id}
    </span>
    <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.7 }}>{node.type}</span>
  </div>
);

// ═══════════════════════════════════════════
// Node Properties Panel
// ═══════════════════════════════════════════

const NodeProperties: React.FC<{
  node: FuiNode;
  onChange: (updater: (n: any) => void) => void;
  animActive?: boolean;
  onInsertKeyframe?: (prop: FuiAnimatableProperty) => void;
}> = ({ node, onChange, animActive, onInsertKeyframe }) => {
  const withKey = (input: React.ReactNode, prop: FuiAnimatableProperty): React.ReactNode => {
    if (!animActive) return input;
    return (
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>{input}</div>
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInsertKeyframe?.(prop); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', fontSize: 10, color: '#ffd740', lineHeight: 1, flexShrink: 0 }}
          title={`Insert keyframe for '${prop}' at current time`}
        >◆</button>
      </div>
    );
  };
  return (
    <>
      <PropertyRow label="ID">
        <TextInput value={node.id} onChange={(v) => onChange((n) => { n.id = v; })} />
      </PropertyRow>
      <PropertyRow label="Type">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{node.type}</span>
      </PropertyRow>
      <PropertyRow label="X">
        {withKey(<NumberInput value={node.rect?.x ?? 0} step={1} onChange={(v) => onChange((n) => { n.rect = n.rect ?? {}; n.rect.x = v; })} />, 'x')}
      </PropertyRow>
      <PropertyRow label="Y">
        {withKey(<NumberInput value={node.rect?.y ?? 0} step={1} onChange={(v) => onChange((n) => { n.rect = n.rect ?? {}; n.rect.y = v; })} />, 'y')}
      </PropertyRow>
      <PropertyRow label="Width">
        {withKey(<NumberInput value={node.rect?.w ?? 100} step={1} min={1} onChange={(v) => onChange((n) => { n.rect = n.rect ?? {}; n.rect.w = Math.max(1, v); })} />, 'w')}
      </PropertyRow>
      <PropertyRow label="Height">
        {withKey(<NumberInput value={node.rect?.h ?? 40} step={1} min={1} onChange={(v) => onChange((n) => { n.rect = n.rect ?? {}; n.rect.h = Math.max(1, v); })} />, 'h')}
      </PropertyRow>
      <PropertyRow label="Opacity">
        {withKey(<Slider
          value={typeof (node as any).style?.opacity === 'number' ? (node as any).style.opacity : 1}
          min={0} max={1} step={0.01}
          onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.opacity = v; })}
        />, 'opacity')}
      </PropertyRow>

      {node.type === 'label' && (<>
        <PropertyRow label="Text"><TextInput value={(node as any).text ?? ''} onChange={(v) => onChange((n) => { n.text = v; })} /></PropertyRow>
        <PropertyRow label="Font Size">
          {withKey(<NumberInput value={(node as any).style?.fontSize ?? 18} step={1} min={6} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.fontSize = v; })} />, 'fontSize')}
        </PropertyRow>
        <PropertyRow label="Color"><ColorInput value={(node as any).style?.color ?? '#ffffff'} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.color = v; })} /></PropertyRow>
        <PropertyRow label="Align">
          <Select value={(node as any).style?.align ?? 'left'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.align = v; })} />
        </PropertyRow>
      </>)}

      {node.type === 'button' && (<>
        <PropertyRow label="Text"><TextInput value={(node as any).text ?? ''} onChange={(v) => onChange((n) => { n.text = v; })} /></PropertyRow>
        <PropertyRow label="Background"><ColorInput value={(node as any).style?.backgroundColor ?? '#1f2a44'} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.backgroundColor = v; })} /></PropertyRow>
        <PropertyRow label="Border"><ColorInput value={(node as any).style?.borderColor ?? '#6b8cff'} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.borderColor = v; })} /></PropertyRow>
        <PropertyRow label="Brd Width">
          {withKey(<NumberInput value={(node as any).style?.borderWidth ?? 2} step={1} min={0} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.borderWidth = v; })} />, 'borderWidth')}
        </PropertyRow>
        <PropertyRow label="Radius"><NumberInput value={(node as any).style?.radius ?? 6} step={1} min={0} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.radius = v; })} /></PropertyRow>
        <PropertyRow label="Text Color"><ColorInput value={(node as any).style?.textColor ?? '#ffffff'} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.textColor = v; })} /></PropertyRow>
        <PropertyRow label="Font Size">
          {withKey(<NumberInput value={(node as any).style?.fontSize ?? 18} step={1} min={6} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.fontSize = v; })} />, 'fontSize')}
        </PropertyRow>
        <PropertyRow label="Align">
          <Select value={(node as any).style?.align ?? 'center'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.align = v; })} />
        </PropertyRow>
        <PropertyRow label="Padding"><NumberInput value={(node as any).style?.padding ?? 8} step={1} min={0} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.padding = v; })} /></PropertyRow>
      </>)}

      {node.type === 'panel' && (<>
        <PropertyRow label="Background"><ColorInput value={(node as any).style?.backgroundColor ?? '#0b1020'} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.backgroundColor = v; })} /></PropertyRow>
        <PropertyRow label="Border"><ColorInput value={(node as any).style?.borderColor ?? '#000000'} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.borderColor = v; })} /></PropertyRow>
        <PropertyRow label="Brd Width">
          {withKey(<NumberInput value={(node as any).style?.borderWidth ?? 0} step={1} min={0} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.borderWidth = v; })} />, 'borderWidth')}
        </PropertyRow>
        <PropertyRow label="Radius"><NumberInput value={(node as any).style?.radius ?? 0} step={1} min={0} onChange={(v) => onChange((n) => { n.style = n.style ?? {}; n.style.radius = v; })} /></PropertyRow>
      </>)}
    </>
  );
};

// ── Shared button style ──
const toolBtn = (active = true): React.CSSProperties => ({
  padding: '3px 8px', fontSize: 11,
  border: '1px solid var(--border)', borderRadius: 3,
  background: active ? 'var(--bg-hover)' : 'var(--bg-input)',
  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  cursor: active ? 'pointer' : 'not-allowed',
  opacity: active ? 1 : 0.5,
  fontFamily: 'var(--font-mono)',
});

// ═══════════════════════════════════════════
// FuiEditor — main component
// ═══════════════════════════════════════════

export interface FuiEditorProps { filePath: string; onClose?: () => void; }

export const FuiEditor: React.FC<FuiEditorProps> = ({ filePath, onClose }) => {
  const fs = getFileSystem();
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;

  // ── State ──
  const [text, setText] = useState('');
  const [doc, setDoc] = useState<FuiDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedNode>(null);
  const [zoom, setZoom] = useState(0.5);
  const [panX, setPanX] = useState(24);
  const [panY, setPanY] = useState(24);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | null>(null);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapSize, setSnapSize] = useState(10);

  // ── Refs ──
  const historyRef = useRef<FuiDocument[]>([]);
  const historyIdxRef = useRef(-1);
  const suppressTextEffectRef = useRef(false);
  const statusDomRef = useRef<HTMLSpanElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const viewportRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  // Keep zoom/pan in refs so wheel handler closure doesn't go stale
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  zoomRef.current = zoom;
  panXRef.current = panX;
  panYRef.current = panY;
  // Animation record context — updated every render so callbacks always read fresh values
  const animRecRef = useRef({ autoKey: false, animId: null as string | null, time: 0 });

  // ── Load file ──
  useEffect(() => {
    let cancelled = false;
    fs.readFile(filePath).then((t) => {
      if (!cancelled) setText(t);
    }).catch((e) => { if (!cancelled) setError(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [filePath, fs]);

  // ── Parse on text change (only when not suppressed by applyDocChange/undo/redo) ──
  useEffect(() => {
    if (!text) return;
    if (suppressTextEffectRef.current) {
      suppressTextEffectRef.current = false;
      return;
    }
    try {
      const parsed = parseFuiJson(text);
      // Push to history
      const truncated = historyRef.current.slice(0, historyIdxRef.current + 1);
      truncated.push(parsed);
      if (truncated.length > 50) truncated.shift();
      historyRef.current = truncated;
      historyIdxRef.current = truncated.length - 1;

      setDoc(parsed);
      setError(null);
      setSaveStatus('unsaved');
      setSelected((prev) => {
        if (!prev) return { node: parsed.root, path: [] };
        const resolved = getNodeAtPath(parsed.root, prev.path);
        return resolved ? { node: resolved, path: prev.path } : { node: parsed.root, path: [] };
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [text]);

  const nodesFlat = useMemo(() => (doc ? walkNodes(doc.root) : []), [doc]);

  // ── Apply doc change (pushes to history, suppresses text re-parse) ──
  const applyDocChange = useCallback((nextDoc: FuiDocument, overrideSelected?: SelectedNode | null) => {
    const truncated = historyRef.current.slice(0, historyIdxRef.current + 1);
    truncated.push(nextDoc);
    if (truncated.length > 50) truncated.shift();
    historyRef.current = truncated;
    historyIdxRef.current = truncated.length - 1;

    suppressTextEffectRef.current = true;
    setDoc(nextDoc);
    setText(JSON.stringify(nextDoc, null, 2));
    setSaveStatus('unsaved');
    if (overrideSelected !== undefined) {
      setSelected(overrideSelected);
    } else {
      setSelected((prev) => {
        if (!prev) return null;
        const resolved = getNodeAtPath(nextDoc.root, prev.path);
        return resolved ? { node: resolved, path: prev.path } : { node: nextDoc.root, path: [] };
      });
    }
  }, []);

  // ── Undo / Redo ──
  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const prevDoc = historyRef.current[historyIdxRef.current];
    suppressTextEffectRef.current = true;
    setDoc(prevDoc);
    setText(JSON.stringify(prevDoc, null, 2));
    setSaveStatus('unsaved');
    setSelected((prev) => {
      if (!prev) return null;
      const resolved = getNodeAtPath(prevDoc.root, prev.path);
      return resolved ? { node: resolved, path: prev.path } : { node: prevDoc.root, path: [] };
    });
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const nextDoc = historyRef.current[historyIdxRef.current];
    suppressTextEffectRef.current = true;
    setDoc(nextDoc);
    setText(JSON.stringify(nextDoc, null, 2));
    setSaveStatus('unsaved');
    setSelected((prev) => {
      if (!prev) return null;
      const resolved = getNodeAtPath(nextDoc.root, prev.path);
      return resolved ? { node: resolved, path: prev.path } : { node: nextDoc.root, path: [] };
    });
  }, []);

  const canUndo = historyIdxRef.current > 0;
  const canRedo = historyIdxRef.current < historyRef.current.length - 1;

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (saveBusy) return;
    setSaveBusy(true);
    try {
      await fs.writeFile(filePath, text);
      setSaveStatus('saved');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaveBusy(false);
    }
  }, [filePath, fs, text, saveBusy]);

  // ── Update selected node property (with optional auto-key) ──
  const updateSelected = useCallback((updater: (n: any) => void) => {
    if (!doc || !selected) return;
    const { autoKey: ak, animId: sid, time: ct } = animRecRef.current;
    const oldNode = getNodeAtPath(doc.root, selected.path);
    const newRoot = updateNodeAtPath(doc.root as FuiPanelNode, selected.path, updater);
    let nextDoc: FuiDocument = { ...doc, root: newRoot };

    if (ak && sid) {
      const currentAnim = doc.animations?.find(a => a.id === sid);
      if (currentAnim) {
        const newNode = getNodeAtPath(newRoot, selected.path);
        const getVal = (n: FuiNode | null, prop: FuiAnimatableProperty): number | undefined => {
          if (!n) return undefined;
          if (prop === 'x') return n.rect?.x ?? 0;
          if (prop === 'y') return n.rect?.y ?? 0;
          if (prop === 'w') return n.rect?.w ?? 0;
          if (prop === 'h') return n.rect?.h ?? 0;
          return (n as any).style?.[prop] as number | undefined;
        };
        const ALL_ANIM_PROPS: FuiAnimatableProperty[] = ['x', 'y', 'w', 'h', 'opacity', 'fontSize', 'borderWidth'];
        const changedProps = ALL_ANIM_PROPS.filter(p => {
          const ov = getVal(oldNode, p); const nv = getVal(newNode, p);
          return nv !== undefined && ov !== nv;
        });
        if (changedProps.length > 0) {
          const nodeId = selected.node.id;
          const clampedTime = Math.max(0, Math.min(currentAnim.duration, ct));
          const compiled = compileFui(nextDoc);
          const animations = (nextDoc.animations ?? []).map(a => {
            if (a.id !== sid) return a;
            let tracks = [...a.tracks];
            for (const prop of changedProps) {
              const cn = compiled.nodeById.get(nodeId);
              let value = 0;
              if (cn) {
                if (prop === 'x') value = cn.rect.x; else if (prop === 'y') value = cn.rect.y;
                else if (prop === 'w') value = cn.rect.w; else if (prop === 'h') value = cn.rect.h;
                else value = (cn.style as any)?.[prop] ?? (prop === 'opacity' ? 1 : 0);
              }
              let ti = tracks.findIndex(t => t.nodeId === nodeId && t.property === prop);
              if (ti < 0) { tracks = [...tracks, { nodeId, property: prop, keyframes: [] }]; ti = tracks.length - 1; }
              const kfs = [...tracks[ti].keyframes.filter(k => Math.abs(k.time - clampedTime) > 0.001),
                { time: clampedTime, value, easing: 'linear' as const }].sort((a2, b2) => a2.time - b2.time);
              tracks = tracks.map((t, i) => i === ti ? { ...t, keyframes: kfs } : t);
            }
            return { ...a, tracks };
          });
          nextDoc = { ...nextDoc, animations: animations.length > 0 ? animations : undefined };
        }
      }
    }
    applyDocChange(nextDoc);
  }, [doc, selected, applyDocChange]);

  // ── Commit from interactive canvas drag (with optional auto-key) ──
  const handleCommit = useCallback((path: number[], newRelRect: FuiRect) => {
    const currentDoc = docRef.current;
    if (!currentDoc) return;
    const { autoKey: ak, animId: sid, time: ct } = animRecRef.current;
    const oldNode = getNodeAtPath(currentDoc.root, path);
    const newRoot = updateNodeAtPath(currentDoc.root as FuiPanelNode, path, (n) => { n.rect = { ...newRelRect }; });
    let nextDoc: FuiDocument = { ...currentDoc, root: newRoot };

    if (ak && sid && oldNode?.rect) {
      const anim = currentDoc.animations?.find(a => a.id === sid);
      if (anim) {
        const nodeId = oldNode.id;
        const clampedTime = Math.max(0, Math.min(anim.duration, ct));
        const moved: FuiAnimatableProperty[] = [];
        if (oldNode.rect.x !== newRelRect.x) moved.push('x');
        if (oldNode.rect.y !== newRelRect.y) moved.push('y');
        if (oldNode.rect.w !== newRelRect.w) moved.push('w');
        if (oldNode.rect.h !== newRelRect.h) moved.push('h');
        if (moved.length > 0) {
          const animations = (nextDoc.animations ?? []).map(a => {
            if (a.id !== sid) return a;
            let tracks = [...a.tracks];
            for (const prop of moved) {
              const val = prop === 'x' ? newRelRect.x : prop === 'y' ? newRelRect.y : prop === 'w' ? newRelRect.w : newRelRect.h;
              let ti = tracks.findIndex(t => t.nodeId === nodeId && t.property === prop);
              if (ti < 0) { tracks = [...tracks, { nodeId, property: prop, keyframes: [] }]; ti = tracks.length - 1; }
              const kfs = [...tracks[ti].keyframes.filter(k => Math.abs(k.time - clampedTime) > 0.001),
                { time: clampedTime, value: val, easing: 'linear' as const }].sort((a2, b2) => a2.time - b2.time);
              tracks = tracks.map((t, i) => i === ti ? { ...t, keyframes: kfs } : t);
            }
            return { ...a, tracks };
          });
          nextDoc = { ...nextDoc, animations: animations.length > 0 ? animations : undefined };
        }
      }
    }
    applyDocChange(nextDoc);
  }, [applyDocChange]);

  // ── Select from canvas ──
  const handleSelectPath = useCallback((path: number[] | null) => {
    const currentDoc = docRef.current;
    if (!path || !currentDoc) { setSelected(null); return; }
    const node = getNodeAtPath(currentDoc.root, path);
    if (node) setSelected({ node, path });
  }, []);

  // ── Add node ──
  const handleAddNode = useCallback((type: AddNodeType) => {
    if (!doc) return;
    const parentPath = selected?.node.type === 'panel' ? selected.path : [];
    const newNode = makeNode(type);
    const newRoot = addChildToPath(doc.root as FuiPanelNode, parentPath, newNode);
    const parentEntry = nodesFlat.find((e) => e.path.length === parentPath.length && e.path.every((v, i) => v === parentPath[i]));
    const parentNode = parentEntry ? (parentEntry.node as any) : doc.root;
    const childIdx = (parentNode.children?.length ?? 1) - 1;
    applyDocChange({ ...doc, root: newRoot }, { node: newNode, path: [...parentPath, childIdx] });
  }, [doc, selected, nodesFlat, applyDocChange]);

  // ── Delete ──
  const handleDelete = useCallback(() => {
    if (!doc || !selected || selected.path.length === 0) return;
    const newRoot = deleteAtPath(doc.root as FuiPanelNode, selected.path);
    applyDocChange({ ...doc, root: newRoot }, { node: newRoot, path: [] });
  }, [doc, selected, applyDocChange]);

  // ── Move up/down ──
  const handleMoveUp = useCallback(() => {
    if (!doc || !selected || selected.path.length === 0) return;
    const idx = selected.path[selected.path.length - 1];
    if (idx === 0) return;
    const parentPath = selected.path.slice(0, -1);
    const newRoot = swapChildren(doc.root as FuiPanelNode, parentPath, idx, idx - 1);
    const newPath = [...parentPath, idx - 1];
    const movedNode = getNodeAtPath(newRoot, newPath);
    applyDocChange({ ...doc, root: newRoot }, movedNode ? { node: movedNode, path: newPath } : null);
  }, [doc, selected, applyDocChange]);

  const handleMoveDown = useCallback(() => {
    if (!doc || !selected || selected.path.length === 0) return;
    const parentPath = selected.path.slice(0, -1);
    const idx = selected.path[selected.path.length - 1];
    const parentNode = parentPath.length === 0 ? doc.root : getNodeAtPath(doc.root, parentPath);
    const siblingCount = (parentNode as any)?.children?.length ?? 0;
    if (idx >= siblingCount - 1) return;
    const newRoot = swapChildren(doc.root as FuiPanelNode, parentPath, idx, idx + 1);
    const newPath = [...parentPath, idx + 1];
    const movedNode = getNodeAtPath(newRoot, newPath);
    applyDocChange({ ...doc, root: newRoot }, movedNode ? { node: movedNode, path: newPath } : null);
  }, [doc, selected, applyDocChange]);

  // ── Duplicate ──
  const handleDuplicate = useCallback(() => {
    if (!doc || !selected || selected.path.length === 0) return;
    const { root: newRoot, newPath } = duplicateNode(doc.root as FuiPanelNode, selected.path);
    const newNode = getNodeAtPath(newRoot, newPath);
    applyDocChange({ ...doc, root: newRoot }, newNode ? { node: newNode, path: newPath } : null);
  }, [doc, selected, applyDocChange]);

  // ── Align ──
  const handleAlign = useCallback((alignment: AlignType) => {
    if (!doc || !selected || selected.path.length === 0) return;
    applyDocChange(alignNode(doc, selected.path, alignment));
  }, [doc, selected, applyDocChange]);

  // ── Document-level prop change ──
  const updateDocProp = useCallback((updater: (d: FuiDocument) => FuiDocument) => {
    if (!doc) return;
    applyDocChange(updater(doc));
  }, [doc, applyDocChange]);

  // ── Pan/Zoom ──
  // Using non-passive wheel listener so preventDefault works
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.05, Math.min(4.0, zoomRef.current * factor));
      const zf = newZoom / zoomRef.current;
      setPanX(Math.round(mx - zf * (mx - panXRef.current)));
      setPanY(Math.round(my - zf * (my - panYRef.current)));
      setZoom(newZoom);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []); // attach once — uses refs

  const handleViewportPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 1) return;
    e.preventDefault();
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: panXRef.current, panY: panYRef.current };
    viewportRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const handleViewportPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return;
    setPanX(panStartRef.current.panX + (e.clientX - panStartRef.current.x));
    setPanY(panStartRef.current.panY + (e.clientY - panStartRef.current.y));
  }, []);

  const handleViewportPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 1) return;
    isPanningRef.current = false;
  }, []);

  const handleFit = useCallback(() => {
    const el = viewportRef.current;
    const d = docRef.current;
    if (!el || !d) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const padding = 32;
    const scaleX = (vw - padding * 2) / d.canvas.width;
    const scaleY = (vh - padding * 2) / d.canvas.height;
    const newZoom = Math.max(0.05, Math.min(4.0, Math.min(scaleX, scaleY)));
    const cx = (vw - d.canvas.width * newZoom) / 2;
    const cy = (vh - d.canvas.height * newZoom) / 2;
    setZoom(newZoom);
    setPanX(Math.round(cx));
    setPanY(Math.round(cy));
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') { e.preventDefault(); handleSave(); return; }
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); handleRedo(); return; }
      if (ctrl && e.key === 'd') { e.preventDefault(); handleDuplicate(); return; }

      // Arrow nudge — skip when focused on inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!selected || selected.path.length === 0 || !doc) return;

      const step = e.shiftKey ? 10 : 1;
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0],
        ArrowUp:   [0, -step], ArrowDown:  [0, step],
      };
      if (deltas[e.key]) {
        e.preventDefault();
        const [dx, dy] = deltas[e.key];
        const newRoot = updateNodeAtPath(doc.root as FuiPanelNode, selected.path, (n) => {
          n.rect = n.rect ?? { x: 0, y: 0, w: 100, h: 40 };
          n.rect.x = (n.rect.x ?? 0) + dx;
          n.rect.y = (n.rect.y ?? 0) + dy;
        });
        applyDocChange({ ...doc, root: newRoot });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleUndo, handleRedo, handleDuplicate, selected, doc, applyDocChange]);

  // ── Animation state ──
  const [animPanelOpen, setAnimPanelOpen] = useState(false);
  const [animPanelHeight, setAnimPanelHeight] = useState(220);
  const [selectedAnimId, setSelectedAnimId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ trackIdx: number; kfIdx: number } | null>(null);
  const [addingTrack, setAddingTrack] = useState(false);
  const [addTrackNodeId, setAddTrackNodeId] = useState('');
  const [addTrackProp, setAddTrackProp] = useState<FuiAnimatableProperty>('opacity');
  const [autoKey, setAutoKey] = useState(false);
  const playRafRef = useRef<number | null>(null);
  const playLastTimeRef = useRef<number>(0);
  const animResizingRef = useRef(false);
  const animResizeStartRef = useRef({ y: 0, height: 0 });

  // ── Animation playback ──
  useEffect(() => {
    if (!isPlaying) { if (playRafRef.current) cancelAnimationFrame(playRafRef.current); return; }
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - playLastTimeRef.current) / 1000);
      playLastTimeRef.current = now;
      const anim = docRef.current?.animations?.find(a => a.id === selectedAnimId);
      if (!anim) { setIsPlaying(false); return; }
      setCurrentTime(t => {
        const next = anim.loop ? ((t + dt) % anim.duration + anim.duration) % anim.duration : Math.min(t + dt, anim.duration);
        if (!anim.loop && next >= anim.duration) setIsPlaying(false);
        return next;
      });
      playRafRef.current = requestAnimationFrame(tick);
    };
    playLastTimeRef.current = performance.now();
    playRafRef.current = requestAnimationFrame(tick);
    return () => { if (playRafRef.current) cancelAnimationFrame(playRafRef.current); };
  }, [isPlaying, selectedAnimId]);

  // ── Animation panel resize (drag top border) ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!animResizingRef.current) return;
      const dy = animResizeStartRef.current.y - e.clientY;
      setAnimPanelHeight(Math.max(120, Math.min(600, animResizeStartRef.current.height + dy)));
    };
    const onUp = () => { animResizingRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── Animation CRUD ──
  const updateAnimations = useCallback((updater: (anims: FuiAnimation[]) => FuiAnimation[]) => {
    if (!doc) return;
    const current = doc.animations ?? [];
    const next = updater(current);
    applyDocChange({ ...doc, animations: next.length > 0 ? next : undefined });
  }, [doc, applyDocChange]);

  const handleAddAnimation = useCallback(() => {
    const id = `anim_${Date.now().toString(36)}`;
    updateAnimations(anims => [...anims, { id, name: 'New Animation', duration: 1, loop: false, tracks: [] }]);
    setSelectedAnimId(id);
    setCurrentTime(0);
  }, [updateAnimations]);

  const handleDeleteAnimation = useCallback((id: string) => {
    updateAnimations(anims => anims.filter(a => a.id !== id));
    setSelectedAnimId(prev => prev === id ? null : prev);
    setCurrentTime(0); setIsPlaying(false);
  }, [updateAnimations]);

  const handleUpdateAnimation = useCallback((id: string, patch: Partial<Omit<FuiAnimation, 'id' | 'tracks'>>) => {
    updateAnimations(anims => anims.map(a => a.id === id ? { ...a, ...patch } : a));
  }, [updateAnimations]);

  const handleAddTrack = useCallback((nodeId: string, property: FuiAnimatableProperty) => {
    if (!selectedAnimId) return;
    updateAnimations(anims => anims.map(a => {
      if (a.id !== selectedAnimId) return a;
      if (a.tracks.some(t => t.nodeId === nodeId && t.property === property)) return a; // already exists
      return { ...a, tracks: [...a.tracks, { nodeId, property, keyframes: [] }] };
    }));
    setAddingTrack(false);
  }, [selectedAnimId, updateAnimations]);

  const handleDeleteTrack = useCallback((trackIdx: number) => {
    if (!selectedAnimId) return;
    updateAnimations(anims => anims.map(a => {
      if (a.id !== selectedAnimId) return a;
      const tracks = a.tracks.filter((_, i) => i !== trackIdx);
      return { ...a, tracks };
    }));
    setSelectedKeyframe(null);
  }, [selectedAnimId, updateAnimations]);

  const handleAddKeyframe = useCallback((trackIdx: number, time: number) => {
    if (!selectedAnimId || !doc) return;
    const anim = doc.animations?.find(a => a.id === selectedAnimId);
    if (!anim) return;
    const track = anim.tracks[trackIdx];
    if (!track) return;
    // Sample current value from base doc
    const compiled = compileFui(doc);
    const cn = compiled.nodeById.get(track.nodeId);
    let value = 0;
    if (cn) {
      if (track.property === 'x') value = cn.rect.x;
      else if (track.property === 'y') value = cn.rect.y;
      else if (track.property === 'w') value = cn.rect.w;
      else if (track.property === 'h') value = cn.rect.h;
      else value = (cn.style as any)?.[track.property] ?? (track.property === 'opacity' ? 1 : 0);
    }
    const clampedTime = Math.max(0, Math.min(anim.duration, time));
    updateAnimations(anims => anims.map(a => {
      if (a.id !== selectedAnimId) return a;
      const tracks = a.tracks.map((t, i) => {
        if (i !== trackIdx) return t;
        const filtered = t.keyframes.filter(k => Math.abs(k.time - clampedTime) > 0.001);
        const keyframes = [...filtered, { time: clampedTime, value, easing: 'linear' as const }]
          .sort((a, b) => a.time - b.time);
        return { ...t, keyframes };
      });
      return { ...a, tracks };
    }));
  }, [selectedAnimId, doc, updateAnimations]);

  const handleDeleteKeyframe = useCallback((trackIdx: number, kfIdx: number) => {
    if (!selectedAnimId) return;
    updateAnimations(anims => anims.map(a => {
      if (a.id !== selectedAnimId) return a;
      const tracks = a.tracks.map((t, i) => {
        if (i !== trackIdx) return t;
        return { ...t, keyframes: t.keyframes.filter((_, j) => j !== kfIdx) };
      });
      return { ...a, tracks };
    }));
    setSelectedKeyframe(null);
  }, [selectedAnimId, updateAnimations]);

  const handleUpdateKeyframe = useCallback((trackIdx: number, kfIdx: number, patch: Partial<FuiKeyframe>) => {
    if (!selectedAnimId) return;
    updateAnimations(anims => anims.map(a => {
      if (a.id !== selectedAnimId) return a;
      const tracks = a.tracks.map((t, i) => {
        if (i !== trackIdx) return t;
        let keyframes = t.keyframes.map((k, j) => j === kfIdx ? { ...k, ...patch } : k);
        if (patch.time !== undefined) keyframes = keyframes.sort((a, b) => a.time - b.time);
        return { ...t, keyframes };
      });
      return { ...a, tracks };
    }));
  }, [selectedAnimId, updateAnimations]);

  // ── Insert keyframe by nodeId+property (used by key icon buttons) ──
  const handleInsertKeyframe = useCallback((nodeId: string, property: FuiAnimatableProperty) => {
    if (!selectedAnimId || !doc) return;
    const anim = doc.animations?.find(a => a.id === selectedAnimId);
    if (!anim) return;
    const clampedTime = Math.max(0, Math.min(anim.duration, currentTime));
    const compiled = compileFui(doc);
    const cn = compiled.nodeById.get(nodeId);
    let value = 0;
    if (cn) {
      if (property === 'x') value = cn.rect.x; else if (property === 'y') value = cn.rect.y;
      else if (property === 'w') value = cn.rect.w; else if (property === 'h') value = cn.rect.h;
      else value = (cn.style as any)?.[property] ?? (property === 'opacity' ? 1 : 0);
    }
    updateAnimations(anims => anims.map(a => {
      if (a.id !== selectedAnimId) return a;
      let tracks = [...a.tracks];
      let ti = tracks.findIndex(t => t.nodeId === nodeId && t.property === property);
      if (ti < 0) { tracks = [...tracks, { nodeId, property, keyframes: [] }]; ti = tracks.length - 1; }
      const kfs = [...tracks[ti].keyframes.filter(k => Math.abs(k.time - clampedTime) > 0.001),
        { time: clampedTime, value, easing: 'linear' as const }].sort((a2, b2) => a2.time - b2.time);
      tracks = tracks.map((t, i) => i === ti ? { ...t, keyframes: kfs } : t);
      return { ...a, tracks };
    }));
  }, [selectedAnimId, doc, currentTime, updateAnimations]);

  // ── Derived ──
  const fallbackDoc: FuiDocument = {
    version: 1, mode: 'screen',
    canvas: { width: 800, height: 600 },
    root: { id: 'root', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 600 }, style: {}, children: [] },
  };
  const baseDoc = doc ?? fallbackDoc;
  const selectedAnim = baseDoc.animations?.find(a => a.id === selectedAnimId) ?? null;
  // Keep animRecRef in sync so callbacks declared above can read fresh values
  animRecRef.current = { autoKey, animId: selectedAnimId, time: currentTime };
  const previewDoc: FuiDocument = useMemo(() => {
    if (!selectedAnim || currentTime === 0) return baseDoc;
    return applyAnimation(baseDoc, selectedAnim, currentTime);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, selectedAnimId, currentTime]);
  const canAddChild = selected?.node.type === 'panel' || !selected;
  const canDelete = !!selected && selected.path.length > 0;
  const selectedIdx = selected ? selected.path[selected.path.length - 1] : -1;
  const canMoveUp = canDelete && selectedIdx > 0;
  const canMoveDown = (() => {
    if (!canDelete || !selected || selected.path.length === 0) return false;
    const parentPath = selected.path.slice(0, -1);
    const parentNode = parentPath.length === 0 ? doc?.root : (doc ? getNodeAtPath(doc.root, parentPath) : null);
    return selectedIdx < ((parentNode as any)?.children?.length ?? 0) - 1;
  })();
  const canAlign = canDelete;

  // ── Render ──
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <PanelHeader
        title={`FUI Editor — ${fileName}`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={handleUndo} disabled={!canUndo} style={toolBtn(canUndo)} title="Undo (Ctrl+Z)">↩</button>
            <button onClick={handleRedo} disabled={!canRedo} style={toolBtn(canRedo)} title="Redo (Ctrl+Y)">↪</button>
            {saveStatus && (
              <span style={{ fontSize: 10, color: saveStatus === 'saved' ? '#66bb6a' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                {saveStatus === 'saved' ? '✓ Saved' : '● Unsaved'}
              </span>
            )}
            <button onClick={handleSave} disabled={saveBusy} style={{ padding: '4px 14px', fontSize: 11, background: 'var(--accent)', border: 'none', borderRadius: 4, color: '#fff', cursor: saveBusy ? 'not-allowed' : 'pointer', opacity: saveBusy ? 0.6 : 1 }}>
              Save
            </button>
          </div>
        }
      />

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Left: Node Tree ── */}
        <div style={{ width: 220, minWidth: 180, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Add toolbar */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: '100%', marginBottom: 2 }}>
              Add {canAddChild ? 'child to selected' : '(select a panel)'}
            </span>
            {(['panel', 'label', 'button'] as AddNodeType[]).map((t) => (
              <button key={t} onClick={() => canAddChild && handleAddNode(t)} style={toolBtn(canAddChild)} title={`Add ${t}`}>
                {NODE_ICONS[t]} {t}
              </button>
            ))}
          </div>
          {/* Order / Delete / Duplicate */}
          <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={handleMoveUp} disabled={!canMoveUp} style={toolBtn(canMoveUp)} title="Move up">▲</button>
            <button onClick={handleMoveDown} disabled={!canMoveDown} style={toolBtn(canMoveDown)} title="Move down">▼</button>
            <button onClick={handleDuplicate} disabled={!canDelete} style={toolBtn(canDelete)} title="Duplicate (Ctrl+D)">⧉</button>
            <button onClick={handleDelete} disabled={!canDelete} style={{ ...toolBtn(canDelete), marginLeft: 'auto', color: canDelete ? '#ef5350' : undefined, borderColor: canDelete ? '#ef535044' : undefined }} title="Delete">✕</button>
          </div>
          {/* Tree */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {nodesFlat.map((entry, i) => (
              <NodeTreeItem
                key={`${entry.node.id}_${i}`}
                node={entry.node} depth={entry.depth} path={entry.path}
                isSelected={selected !== null && selected.path.length === entry.path.length && selected.path.every((v, j) => v === entry.path[j])}
                onClick={() => setSelected({ node: entry.node, path: entry.path })}
              />
            ))}
            {nodesFlat.length === 0 && (
              <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>No nodes</div>
            )}
          </div>
        </div>

        {/* ── Center: Canvas ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
          {/* Toolbar row 1: zoom + grid/snap */}
          <div style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {/* Zoom controls */}
            <button onClick={() => { const nz = Math.max(0.05, zoom / 1.25); setZoom(nz); }} style={toolBtn()} title="Zoom out (−)">−</button>
            <input
              type="text"
              value={`${Math.round(zoom * 100)}%`}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const v = parseInt(e.target.value.replace('%', ''), 10);
                if (!isNaN(v) && v > 0) setZoom(Math.max(0.05, Math.min(4.0, v / 100)));
              }}
              style={{ width: 46, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '2px 4px' }}
            />
            <button onClick={() => { const nz = Math.min(4.0, zoom * 1.25); setZoom(nz); }} style={toolBtn()} title="Zoom in (+)">+</button>
            <button onClick={handleFit} style={toolBtn()} title="Fit canvas to viewport">Fit</button>
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
            {/* Grid / Snap */}
            <button onClick={() => setGridEnabled((v) => !v)} style={{ ...toolBtn(true), background: gridEnabled ? 'var(--accent)' : 'var(--bg-hover)', color: gridEnabled ? '#fff' : 'var(--text-secondary)' }} title="Toggle grid">⊞ Grid</button>
            <button onClick={() => setSnapEnabled((v) => !v)} style={{ ...toolBtn(true), background: snapEnabled ? 'var(--accent)' : 'var(--bg-hover)', color: snapEnabled ? '#fff' : 'var(--text-secondary)' }} title="Toggle snap">⊡ Snap</button>
            <NumberInput value={snapSize} step={1} min={1} max={100} onChange={(v) => setSnapSize(Math.max(1, v))} style={{ width: 44 }} />
          </div>
          {/* Toolbar row 2: align */}
          <div style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>Align</span>
            {([
              ['left',     '←L', 'Align left'],
              ['center-h', '↔C', 'Center horizontally'],
              ['right',    '→R', 'Align right'],
              ['top',      '↑T', 'Align top'],
              ['center-v', '↕C', 'Center vertically'],
              ['bottom',   '↓B', 'Align bottom'],
            ] as [AlignType, string, string][]).map(([align, label, title]) => (
              <button key={align} onClick={() => handleAlign(align)} disabled={!canAlign} style={toolBtn(canAlign)} title={title}>{label}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {canAlign ? 'relative to parent' : 'select a node'}
            </span>
          </div>
          {/* Canvas viewport (pan/zoom) */}
          <div
            ref={viewportRef}
            style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#0d1117' }}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={handleViewportPointerUp}
          >
            {error ? (
              <div style={{ padding: 12, color: '#ef5350', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', position: 'absolute', top: 0, left: 0 }}>{error}</div>
            ) : (
              <div style={{ position: 'absolute', left: panX, top: panY }}>
                <InteractiveCanvas
                  doc={previewDoc}
                  scale={zoom}
                  selectedPath={selected?.path ?? null}
                  gridEnabled={gridEnabled}
                  snapEnabled={snapEnabled}
                  snapSize={snapSize}
                  statusRef={statusDomRef}
                  onSelectPath={handleSelectPath}
                  onCommit={handleCommit}
                />
              </div>
            )}
          </div>
          {/* Status bar */}
          <div style={{ padding: '2px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', minHeight: 20, display: 'flex', alignItems: 'center' }}>
            <span ref={statusDomRef} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }} />
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              {selected ? `${selected.node.type} · ${selected.node.id}` : 'wheel=zoom · MMB=pan · click=select · drag=move'}
            </span>
          </div>
        </div>

        {/* ── Right: Properties ── */}
        <div style={{ width: 260, minWidth: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Document settings */}
          <Section title="Document" defaultOpen>
            <PropertyRow label="Mode">
              <Select value={doc?.mode ?? 'screen'} options={[{ value: 'screen', label: 'Screen Space' }, { value: 'world', label: 'World Space' }]} onChange={(v) => updateDocProp((d) => ({ ...d, mode: v as FuiMode }))} />
            </PropertyRow>
            <PropertyRow label="Width">
              <NumberInput value={doc?.canvas.width ?? 800} step={1} min={1} onChange={(v) => updateDocProp((d) => ({ ...d, canvas: { ...d.canvas, width: Math.max(1, v) } }))} />
            </PropertyRow>
            <PropertyRow label="Height">
              <NumberInput value={doc?.canvas.height ?? 600} step={1} min={1} onChange={(v) => updateDocProp((d) => ({ ...d, canvas: { ...d.canvas, height: Math.max(1, v) } }))} />
            </PropertyRow>
          </Section>

          {/* Selected node properties */}
          <Section title={selected ? `${selected.node.type} — ${selected.node.id}` : 'Properties'} defaultOpen>
            {!selected ? (
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>Select a node</div>
            ) : (
              <NodeProperties
                node={selected.node}
                onChange={updateSelected}
                animActive={animPanelOpen && selectedAnim !== null}
                onInsertKeyframe={(prop) => handleInsertKeyframe(selected.node.id, prop)}
              />
            )}
          </Section>

          {/* Raw JSON */}
          <Section title="Raw JSON" defaultOpen={false}>
            <div style={{ padding: '0 8px 8px' }}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={{ width: '100%', height: 220, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                spellCheck={false}
              />
            </div>
          </Section>
        </div>
      </div>

      {/* ── Animation Panel ── */}
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Toggle bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '2px 8px', gap: 6, minHeight: 24, userSelect: 'none' }}>
          <button
            onClick={() => setAnimPanelOpen(v => !v)}
            style={{ ...toolBtn(), fontSize: 10, padding: '1px 6px', background: animPanelOpen ? 'var(--accent)' : 'var(--bg-hover)', color: animPanelOpen ? '#fff' : 'var(--text-secondary)' }}
          >{animPanelOpen ? '▼' : '▶'} Animations{doc?.animations?.length ? ` (${doc.animations.length})` : ''}</button>
          {animPanelOpen && selectedAnim && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {selectedAnim.name} · {selectedAnim.duration.toFixed(2)}s {selectedAnim.loop ? '↺' : '→'}
            </span>
          )}
        </div>
        {animPanelOpen && (
          <div style={{ height: animPanelHeight, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
            {/* Resize handle (drag top border to resize panel height) */}
            <div
              style={{ height: 4, cursor: 'row-resize', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}
              onMouseDown={(e) => { e.preventDefault(); animResizingRef.current = true; animResizeStartRef.current = { y: e.clientY, height: animPanelHeight }; }}
            />
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', paddingTop: 4 }}>

              {/* Animation list */}
              <div style={{ width: 160, minWidth: 120, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ padding: '3px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>Animations</span>
                  <button onClick={handleAddAnimation} style={{ ...toolBtn(), fontSize: 10, padding: '1px 5px' }} title="Add animation">+</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(doc?.animations ?? []).map(anim => (
                    <div key={anim.id}
                      onClick={() => { setSelectedAnimId(anim.id); setCurrentTime(0); setIsPlaying(false); }}
                      style={{ display: 'flex', alignItems: 'center', padding: '3px 8px', cursor: 'pointer', background: selectedAnimId === anim.id ? 'var(--bg-active)' : 'transparent', borderBottom: '1px solid var(--border)' }}
                    >
                      <span style={{ flex: 1, fontSize: 11, color: selectedAnimId === anim.id ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anim.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteAnimation(anim.id); }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', fontSize: 11, lineHeight: 1 }} title="Delete">✕</button>
                    </div>
                  ))}
                  {!(doc?.animations?.length) && (
                    <div style={{ padding: 8, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>No animations</div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                {selectedAnim ? (<>
                  {/* Controls bar */}
                  <div style={{ padding: '2px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, flexWrap: 'wrap' }}>
                    <button onClick={() => { if (!isPlaying) playLastTimeRef.current = performance.now(); setIsPlaying(v => !v); }}
                      style={{ ...toolBtn(), padding: '1px 5px', fontSize: 11 }} title={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? '⏸' : '▶'}</button>
                    <button onClick={() => { setIsPlaying(false); setCurrentTime(0); }} style={{ ...toolBtn(), padding: '1px 5px', fontSize: 11 }} title="Stop">⏹</button>
                    <button onClick={() => handleUpdateAnimation(selectedAnim.id, { loop: !selectedAnim.loop })}
                      style={{ ...toolBtn(), padding: '1px 5px', fontSize: 11, background: selectedAnim.loop ? 'var(--accent)' : 'var(--bg-hover)', color: selectedAnim.loop ? '#fff' : 'var(--text-secondary)' }} title="Loop">↺</button>
                    <button onClick={() => setAutoKey(v => !v)}
                      style={{ ...toolBtn(), padding: '1px 5px', fontSize: 10, background: autoKey ? '#ef5350' : 'var(--bg-hover)', color: autoKey ? '#fff' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                      title="Auto-key: record property changes as keyframes">● REC</button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', minWidth: 44 }}>{currentTime.toFixed(2)}s</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>/</span>
                    <input type="number" value={selectedAnim.duration} step={0.1} min={0.1}
                      onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) handleUpdateAnimation(selectedAnim.id, { duration: v }); }}
                      style={{ width: 44, fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '1px 3px' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>s</span>
                    <input type="text" value={selectedAnim.name} onChange={(e) => handleUpdateAnimation(selectedAnim.id, { name: e.target.value })}
                      style={{ flex: 1, minWidth: 60, fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '1px 4px' }} />
                    <button onClick={() => { setAddingTrack(v => !v); if (!addingTrack && nodesFlat.length > 0) setAddTrackNodeId(nodesFlat[0].node.id); }}
                      style={{ ...toolBtn(), padding: '1px 6px', fontSize: 10, background: addingTrack ? 'var(--accent)' : 'var(--bg-hover)', color: addingTrack ? '#fff' : 'var(--text-secondary)' }}>+ Track</button>
                  </div>

                  {/* Add track inline UI */}
                  {addingTrack && (
                    <div style={{ padding: '3px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center', background: 'var(--bg-input)', flexShrink: 0 }}>
                      <select value={addTrackNodeId} onChange={(e) => setAddTrackNodeId(e.target.value)}
                        style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 3px' }}>
                        {nodesFlat.map(e => <option key={e.node.id} value={e.node.id}>{e.node.id} ({e.node.type})</option>)}
                      </select>
                      <select value={addTrackProp} onChange={(e) => setAddTrackProp(e.target.value as FuiAnimatableProperty)}
                        style={{ width: 86, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 3px' }}>
                        {ANIMATABLE_PROP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button onClick={() => handleAddTrack(addTrackNodeId, addTrackProp)} style={{ ...toolBtn(), padding: '1px 5px', fontSize: 10 }}>Add</button>
                      <button onClick={() => setAddingTrack(false)} style={{ ...toolBtn(), padding: '1px 5px', fontSize: 10 }}>✕</button>
                    </div>
                  )}

                  {/* Selected keyframe inspector */}
                  {selectedKeyframe !== null && (() => {
                    const track = selectedAnim.tracks[selectedKeyframe.trackIdx];
                    const kf = track?.keyframes[selectedKeyframe.kfIdx];
                    if (!kf) return null;
                    return (
                      <div style={{ padding: '2px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 5, alignItems: 'center', background: 'var(--bg-input)', flexShrink: 0, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>t=</span>
                        <input type="number" value={kf.time.toFixed(3)} step={0.01} min={0} max={selectedAnim.duration}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleUpdateKeyframe(selectedKeyframe.trackIdx, selectedKeyframe.kfIdx, { time: v }); }}
                          style={{ width: 50, fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '1px 3px' }} />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>val=</span>
                        <input type="number" value={kf.value.toFixed(2)} step={0.1}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleUpdateKeyframe(selectedKeyframe.trackIdx, selectedKeyframe.kfIdx, { value: v }); }}
                          style={{ width: 50, fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', padding: '1px 3px' }} />
                        <select value={kf.easing ?? 'linear'}
                          onChange={(e) => handleUpdateKeyframe(selectedKeyframe.trackIdx, selectedKeyframe.kfIdx, { easing: e.target.value as FuiKeyframe['easing'] })}
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 3px' }}>
                          {EASING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button onClick={() => handleDeleteKeyframe(selectedKeyframe.trackIdx, selectedKeyframe.kfIdx)}
                          style={{ ...toolBtn(), padding: '1px 5px', fontSize: 10, color: '#ef5350', marginLeft: 'auto' }}>✕ kf</button>
                      </div>
                    );
                  })()}

                  {/* Track area with ruler + keyframe rows */}
                  <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
                    {(() => {
                      const dur = selectedAnim.duration;
                      const tickInt = dur <= 5 ? 0.1 : dur <= 20 ? 0.5 : dur <= 60 ? 1 : 5;
                      const majorMult = tickInt < 0.5 ? 10 : 2;
                      const numTicks = Math.floor(dur / tickInt);
                      const labelW = 120;
                      return (<>
                        {/* Sticky ruler */}
                        <div style={{ display: 'flex', height: 22, position: 'sticky', top: 0, background: '#0d1117', borderBottom: '1px solid var(--border)', zIndex: 5 }}>
                          <div style={{ width: labelW, flexShrink: 0, borderRight: '1px solid var(--border)' }} />
                          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'ew-resize' }}
                            onMouseDown={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const getT = (cx: number) => Math.max(0, Math.min(dur, ((cx - rect.left) / rect.width) * dur));
                              setCurrentTime(getT(e.clientX));
                              const onMv = (me: MouseEvent) => setCurrentTime(getT(me.clientX));
                              const onUp = () => { document.removeEventListener('mousemove', onMv); document.removeEventListener('mouseup', onUp); };
                              document.addEventListener('mousemove', onMv); document.addEventListener('mouseup', onUp);
                            }}
                          >
                            {Array.from({ length: numTicks + 1 }, (_, i) => {
                              const t = i * tickInt;
                              const pct = dur > 0 ? (t / dur) * 100 : 0;
                              const major = i % majorMult === 0;
                              return (
                                <div key={i} style={{ position: 'absolute', left: `${pct}%`, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                                  <div style={{ width: 1, height: major ? 10 : 5, background: major ? '#666' : '#333', marginTop: major ? 0 : 5 }} />
                                  {major && <span style={{ fontSize: 8, color: '#888', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', marginTop: 1 }}>{t.toFixed(t < 1 ? 1 : 0)}s</span>}
                                </div>
                              );
                            })}
                            {/* Scrubber on ruler */}
                            <div style={{ position: 'absolute', left: `${dur > 0 ? (currentTime / dur) * 100 : 0}%`, top: 0, width: 2, height: 999, background: '#ff4081cc', pointerEvents: 'none', transform: 'translateX(-50%)', zIndex: 3 }} />
                          </div>
                        </div>

                        {/* Track rows */}
                        {selectedAnim.tracks.map((track, trackIdx) => (
                          <div key={`${track.nodeId}-${track.property}-${trackIdx}`}
                            style={{ display: 'flex', height: 24, borderBottom: '1px solid var(--border)', alignItems: 'stretch' }}>
                            <div style={{ width: labelW, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 5px', gap: 3, borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
                              <span style={{ flex: 1, fontSize: 9, fontFamily: 'var(--font-mono)', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${track.nodeId}.${track.property}`}>
                                {track.nodeId}.<b style={{ color: '#ccc' }}>{track.property}</b>
                              </span>
                              <button onClick={() => handleDeleteTrack(trackIdx)}
                                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0, fontSize: 9, lineHeight: 1, flexShrink: 0 }}>✕</button>
                            </div>
                            <div style={{ flex: 1, position: 'relative', background: trackIdx % 2 === 0 ? '#0d1117' : '#0a0f1a', cursor: 'crosshair', overflow: 'hidden' }}
                              onMouseDown={(e) => {
                                if ((e.target as HTMLElement).dataset.kf) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const t = Math.max(0, Math.min(dur, ((e.clientX - rect.left) / rect.width) * dur));
                                handleAddKeyframe(trackIdx, t);
                              }}
                            >
                              <div style={{ position: 'absolute', left: `${dur > 0 ? (currentTime / dur) * 100 : 0}%`, top: 0, width: 1, height: '100%', background: '#ff408155', pointerEvents: 'none', transform: 'translateX(-50%)' }} />
                              {track.keyframes.map((kf, kfIdx) => {
                                const isSel = selectedKeyframe?.trackIdx === trackIdx && selectedKeyframe?.kfIdx === kfIdx;
                                const pct = dur > 0 ? (kf.time / dur) * 100 : 0;
                                return (
                                  <div key={kfIdx} data-kf="1"
                                    title={`t=${kf.time.toFixed(3)} val=${kf.value.toFixed(2)}`}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      setSelectedKeyframe({ trackIdx, kfIdx });
                                      setCurrentTime(kf.time);
                                      const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                                      const onMv = (me: MouseEvent) => {
                                        const t2 = Math.max(0, Math.min(dur, ((me.clientX - rect.left) / rect.width) * dur));
                                        handleUpdateKeyframe(trackIdx, kfIdx, { time: t2 });
                                        setCurrentTime(t2);
                                      };
                                      const onUp = () => { document.removeEventListener('mousemove', onMv); document.removeEventListener('mouseup', onUp); };
                                      document.addEventListener('mousemove', onMv); document.addEventListener('mouseup', onUp);
                                    }}
                                    style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%) rotate(45deg)', width: 8, height: 8, background: isSel ? '#ff4081' : '#ffd740', border: `1px solid ${isSel ? '#ff4081' : '#ffab00'}`, cursor: 'grab', zIndex: 2 }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {selectedAnim.tracks.length === 0 && (
                          <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>No tracks — click "+ Track" to add one</div>
                        )}
                      </>);
                    })()}
                  </div>
                </>) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                    Select or create an animation
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

    </div>
  );
};
