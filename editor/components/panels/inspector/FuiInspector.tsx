// ============================================================
// FluxionJS V3 — FUI Inspector (.fui asset, right panel)
// Shows preview + document info. Editing happens in the
// standalone FUI Editor window (opened via "Open Editor").
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Section, PropertyRow } from '../../../ui';
import { AssetInspectorProps } from '../../../core/AssetInspectorRegistry';
import { getFileSystem } from '../../../../src/filesystem';
import type { FuiDocument } from '../../../../src/ui/FuiTypes';
import { parseFuiJson } from '../../../../src/ui/FuiParser';
import { renderFuiToCanvas } from '../../../../src/ui/FuiRenderer';

// ── Helpers ──

function countNodes(node: any): number {
  let n = 1;
  for (const child of node?.children ?? []) n += countNodes(child);
  return n;
}

function walkFlat(node: any, depth = 0): Array<{ id: string; type: string; depth: number }> {
  const out: Array<{ id: string; type: string; depth: number }> = [{ id: node.id, type: node.type, depth }];
  for (const child of node?.children ?? []) out.push(...walkFlat(child, depth + 1));
  return out;
}

// ── Preview canvas ──

const FuiPreview: React.FC<{ doc: FuiDocument; scale: number }> = ({ doc, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = Math.max(1, Math.round(doc.canvas.width * scale));
    const h = Math.max(1, Math.round(doc.canvas.height * scale));
    canvas.width = w;
    canvas.height = h;
    renderFuiToCanvas(doc, ctx, { scaleX: scale, scaleY: scale });
  }, [doc, scale]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${doc.canvas.width * scale}px`,
        height: `${doc.canvas.height * scale}px`,
        border: '1px solid var(--border)',
        borderRadius: 4,
        background: '#0b1020',
        display: 'block',
        margin: '0 auto',
      }}
    />
  );
};

// ── Inspector ──

const NODE_ICONS: Record<string, string> = { panel: '□', label: 'T', button: '⬡' };

export const FuiInspector: React.FC<AssetInspectorProps> = ({ assetPath }) => {
  const fs = getFileSystem();
  const [doc, setDoc] = useState<FuiDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileName = assetPath.replace(/\\/g, '/').split('/').pop() ?? '';

  useEffect(() => {
    let cancelled = false;
    fs.readFile(assetPath)
      .then((text) => {
        if (cancelled) return;
        try { setDoc(parseFuiJson(text)); setError(null); }
        catch (e: any) { setError(e?.message ?? 'Parse error'); }
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Read error'); });
    return () => { cancelled = true; };
  }, [assetPath, fs]);

  const nodes = useMemo(() => (doc ? walkFlat(doc.root) : []), [doc]);

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--text-muted)',
  };

  if (error) {
    return (
      <Section title="FUI" defaultOpen>
        <div style={{ padding: '8px 12px', color: '#ef5350', fontSize: 11 }}>{error}</div>
      </Section>
    );
  }

  if (!doc) {
    return (
      <Section title="FUI" defaultOpen>
        <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11 }}>Loading...</div>
      </Section>
    );
  }

  return (
    <>
      {/* Preview */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
          Preview — {doc.canvas.width}×{doc.canvas.height}
        </div>
        <FuiPreview doc={doc} scale={0.25} />
      </div>

      {/* Info */}
      <Section title="FUI Document" defaultOpen>
        <PropertyRow label="File">
          <span style={labelStyle}>{fileName}</span>
        </PropertyRow>
        <PropertyRow label="Mode">
          <span style={{ ...labelStyle, color: '#58a6ff' }}>{doc.mode}</span>
        </PropertyRow>
        <PropertyRow label="Canvas">
          <span style={labelStyle}>{doc.canvas.width} × {doc.canvas.height}</span>
        </PropertyRow>
        <PropertyRow label="Nodes">
          <span style={labelStyle}>{countNodes(doc.root)}</span>
        </PropertyRow>
      </Section>

      {/* Node list (read-only) */}
      <Section title="Elements" defaultOpen>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 4px' }}>
          {nodes.map((n, i) => (
            <div
              key={`${n.id}_${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '2px 6px', paddingLeft: 6 + n.depth * 10,
                fontSize: 11, color: 'var(--text-secondary)',
                borderRadius: 3,
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 9, width: 10 }}>{NODE_ICONS[n.type] ?? '?'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.id}</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{n.type}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Open Editor button */}
      <Section title="Actions" defaultOpen>
        <div style={{ padding: '4px 12px' }}>
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('fluxion:open-fui-editor', { detail: { path: assetPath } }),
              );
            }}
            style={{
              width: '100%',
              padding: '7px 12px',
              border: '1px solid #58a6ff',
              borderRadius: 4,
              background: 'rgba(88, 166, 255, 0.1)',
              color: '#58a6ff',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.3px',
            }}
          >
            ▦ Open FUI Editor
          </button>
        </div>
      </Section>
    </>
  );
};
