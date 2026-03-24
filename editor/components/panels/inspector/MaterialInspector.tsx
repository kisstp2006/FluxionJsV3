// ============================================================
// FluxionJS V3 — Material Asset Inspector (.fluxmat / .mat)
// PBR property editing with live save.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Section, PropertyRow, Slider, ColorInput, Checkbox } from '../../../ui';
import { AssetInspectorProps } from '../../../core/AssetInspectorRegistry';
import { getFileSystem } from '../../../../src/filesystem';

interface FluxMatData {
  type?: string;
  color?: [number, number, number];
  roughness?: number;
  metalness?: number;
  emissive?: [number, number, number];
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  doubleSided?: boolean;
  wireframe?: boolean;
  albedoMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  aoMap?: string;
  emissiveMap?: string;
}

function color3ToHex(c: [number, number, number]): string {
  const r = Math.round(Math.max(0, Math.min(1, c[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, c[2])) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToColor3(hex: string): [number, number, number] {
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;
  return [r, g, b];
}

export const MaterialInspector: React.FC<AssetInspectorProps> = ({ assetPath }) => {
  const [data, setData] = useState<FluxMatData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fileName = assetPath.replace(/\\/g, '/').split('/').pop() || '';

  // Load material data
  useEffect(() => {
    let cancelled = false;
    getFileSystem().readFile(assetPath).then((text) => {
      if (cancelled) return;
      try {
        setData(JSON.parse(text));
        setError(null);
      } catch {
        setError('Invalid material JSON');
      }
    }).catch(() => {
      if (!cancelled) setError('Failed to read material file');
    });
    return () => { cancelled = true; };
  }, [assetPath]);

  // Auto-save with debounce
  const saveData = useCallback((updated: FluxMatData) => {
    setSaving(true);
    getFileSystem().writeFile(assetPath, JSON.stringify(updated, null, 2))
      .then(() => setSaving(false))
      .catch(() => setSaving(false));
  }, [assetPath]);

  const update = useCallback((partial: Partial<FluxMatData>) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      saveData(next);
      return next;
    });
  }, [saveData]);

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    fontSize: '11px',
  };

  const mapSlotStyle: React.CSSProperties = {
    padding: '3px 6px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: '3px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '150px',
  };

  if (error) {
    return (
      <Section title="Material" defaultOpen>
        <div style={{ padding: '8px 12px', color: 'var(--accent-red)', fontSize: '11px' }}>{error}</div>
      </Section>
    );
  }

  if (!data) {
    return (
      <Section title="Material" defaultOpen>
        <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>Loading...</div>
      </Section>
    );
  }

  return (
    <>
      {/* File Info */}
      <Section title="Material" defaultOpen>
        <PropertyRow label="File">
          <span style={labelStyle}>{fileName}</span>
        </PropertyRow>
        <PropertyRow label="Type">
          <span style={{ ...labelStyle, color: '#f06292' }}>{data.type || 'standard'}</span>
        </PropertyRow>
        {saving && (
          <div style={{ padding: '2px 12px', fontSize: '10px', color: 'var(--accent)' }}>Saving...</div>
        )}
      </Section>

      {/* PBR Properties */}
      <Section title="PBR Properties" defaultOpen>
        <PropertyRow label="Color">
          <ColorInput
            value={color3ToHex(data.color || [1, 1, 1])}
            onChange={(hex) => update({ color: hexToColor3(hex) })}
          />
        </PropertyRow>
        <PropertyRow label="Roughness">
          <Slider
            value={data.roughness ?? 0.5}
            onChange={(v) => update({ roughness: v })}
            min={0} max={1} step={0.01}
          />
        </PropertyRow>
        <PropertyRow label="Metalness">
          <Slider
            value={data.metalness ?? 0}
            onChange={(v) => update({ metalness: v })}
            min={0} max={1} step={0.01}
          />
        </PropertyRow>
      </Section>

      {/* Emission */}
      <Section title="Emission" defaultOpen={false}>
        <PropertyRow label="Emissive">
          <ColorInput
            value={color3ToHex(data.emissive || [0, 0, 0])}
            onChange={(hex) => update({ emissive: hexToColor3(hex) })}
          />
        </PropertyRow>
        <PropertyRow label="Intensity">
          <Slider
            value={data.emissiveIntensity ?? 0}
            onChange={(v) => update({ emissiveIntensity: v })}
            min={0} max={10} step={0.1}
          />
        </PropertyRow>
      </Section>

      {/* Rendering */}
      <Section title="Rendering" defaultOpen={false}>
        <PropertyRow label="Transparent">
          <Checkbox
            checked={data.transparent ?? false}
            onChange={(v) => update({ transparent: v })}
          />
        </PropertyRow>
        {data.transparent && (
          <PropertyRow label="Opacity">
            <Slider
              value={data.opacity ?? 1}
              onChange={(v) => update({ opacity: v })}
              min={0} max={1} step={0.01}
            />
          </PropertyRow>
        )}
        <PropertyRow label="Double Sided">
          <Checkbox
            checked={data.doubleSided ?? false}
            onChange={(v) => update({ doubleSided: v })}
          />
        </PropertyRow>
        <PropertyRow label="Wireframe">
          <Checkbox
            checked={data.wireframe ?? false}
            onChange={(v) => update({ wireframe: v })}
          />
        </PropertyRow>
      </Section>

      {/* Texture Maps */}
      <Section title="Texture Maps" defaultOpen={false}>
        {(['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const).map((key) => (
          <PropertyRow key={key} label={key.replace('Map', '')}>
            <div
              style={mapSlotStyle}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; }}
              onDrop={(e) => {
                e.preventDefault();
                const relPath = e.dataTransfer.getData('application/x-fluxion-asset');
                if (relPath) update({ [key]: relPath });
              }}
            >
              {data[key] ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(data[key] as string).replace(/\\/g, '/').split('/').pop()}
                  </span>
                  <span
                    style={{ cursor: 'pointer', color: 'var(--accent-red)', fontSize: '12px' }}
                    onClick={() => update({ [key]: undefined })}
                  >✕</span>
                </span>
              ) : (
                <span style={{ color: 'var(--text-disabled)', fontStyle: 'italic' }}>
                  Drop texture here
                </span>
              )}
            </div>
          </PropertyRow>
        ))}
      </Section>
    </>
  );
};
