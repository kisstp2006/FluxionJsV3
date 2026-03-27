// ============================================================
// FluxionJS V3 — Material Asset Inspector (.fluxmat / .mat)
// PBR property editing with live save.
// ============================================================

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow, Slider, ColorInput, Checkbox, AssetInput } from '../../../ui';
import { AssetInspectorProps } from '../../../core/AssetInspectorRegistry';
import { getFileSystem, normalizePath } from '../../../../src/filesystem';
import { projectManager } from '../../../../src/project/ProjectManager';
import { MaterialPreviewSphere } from '../MaterialPreviewSphere';

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
  alphaTest?: number;
  envMapIntensity?: number;
  normalScale?: number;
  aoIntensity?: number;
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

  // Base directory of the .fluxmat file for resolving texture paths
  const baseDir = useMemo(
    () => normalizePath(assetPath).replace(/\/[^/]+$/, ''),
    [assetPath],
  );

  const loadTexture = useCallback(
    (relPath: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        const p = relPath.replace(/\\/g, '/');
        const isAbsolute = p.startsWith('/') || /^[A-Za-z]:/.test(p);
        const url = isAbsolute ? `file:///${p.replace(/^\/+/, '')}` : `file:///${baseDir}/${p}`;
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      }),
    [baseDir],
  );

  const buildMaterial = useCallback(async (): Promise<THREE.Material | null> => {
    if (!data) return null;
    const mat = new THREE.MeshPhysicalMaterial();
    if (data.color) mat.color.setRGB(data.color[0], data.color[1], data.color[2]);
    mat.roughness = data.roughness ?? 0.5;
    mat.metalness = data.metalness ?? 0;
    if (data.emissive) mat.emissive.setRGB(data.emissive[0], data.emissive[1], data.emissive[2]);
    mat.emissiveIntensity = data.emissiveIntensity ?? 0;
    mat.transparent = data.transparent ?? false;
    mat.opacity = data.opacity ?? 1;
    mat.side = data.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    mat.wireframe = data.wireframe ?? false;
    mat.alphaTest = data.alphaTest ?? 0;
    mat.envMapIntensity = data.envMapIntensity ?? 1;
    if (data.albedoMap) { const t = await loadTexture(data.albedoMap).catch(() => null); mat.map = t; }
    if (data.normalMap) { const t = await loadTexture(data.normalMap).catch(() => null); if (t) { t.colorSpace = THREE.LinearSRGBColorSpace; mat.normalMap = t; } }
    if (data.roughnessMap) { const t = await loadTexture(data.roughnessMap).catch(() => null); if (t) { t.colorSpace = THREE.LinearSRGBColorSpace; mat.roughnessMap = t; } }
    if (data.metalnessMap) { const t = await loadTexture(data.metalnessMap).catch(() => null); if (t) { t.colorSpace = THREE.LinearSRGBColorSpace; mat.metalnessMap = t; } }
    if (data.aoMap) { const t = await loadTexture(data.aoMap).catch(() => null); if (t) { t.colorSpace = THREE.LinearSRGBColorSpace; mat.aoMap = t; mat.aoMapIntensity = data.aoIntensity ?? 1; } }
    if (data.emissiveMap) { const t = await loadTexture(data.emissiveMap).catch(() => null); if (t) mat.emissiveMap = t; }
    mat.needsUpdate = true;
    return mat;
  }, [data, loadTexture]);

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
      .then(() => {
        setSaving(false);
        // Notify scene to re-apply this material on all objects that reference it
        window.dispatchEvent(new CustomEvent('fluxion:material-changed', { detail: { path: assetPath } }));
      })
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
      {/* Preview sphere */}
      <MaterialPreviewSphere
        buildMaterial={buildMaterial}
        deps={[data]}
      />

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
        <PropertyRow label="Alpha Test">
          <Slider
            value={data.alphaTest ?? 0}
            onChange={(v) => update({ alphaTest: v })}
            min={0} max={1} step={0.01}
          />
        </PropertyRow>
        <PropertyRow label="Env Map Int.">
          <Slider
            value={data.envMapIntensity ?? 1}
            onChange={(v) => update({ envMapIntensity: v })}
            min={0} max={5} step={0.1}
          />
        </PropertyRow>
        <PropertyRow label="Normal Scale">
          <Slider
            value={data.normalScale ?? 1}
            onChange={(v) => update({ normalScale: v })}
            min={0} max={2} step={0.01}
          />
        </PropertyRow>
        <PropertyRow label="AO Intensity">
          <Slider
            value={data.aoIntensity ?? 1}
            onChange={(v) => update({ aoIntensity: v })}
            min={0} max={5} step={0.1}
          />
        </PropertyRow>
      </Section>

      {/* Texture Maps */}
      <Section title="Texture Maps" defaultOpen={false}>
        {(['albedoMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const).map((key) => {
          // Convert material-relative path → project-relative for AssetInput display
          const matDir = normalizePath(assetPath).substring(0, normalizePath(assetPath).lastIndexOf('/'));
          const matRelVal = data[key] as string | undefined;
          let projRelVal = '';
          if (matRelVal) {
            // Resolve to absolute then to project-relative
            const absTexture = normalizePath(matDir + '/' + matRelVal);
            projRelVal = projectManager.relativePath(absTexture);
          }
          return (
            <PropertyRow key={key} label={key.replace('Map', '')}>
              <AssetInput
                value={projRelVal}
                assetType="texture"
                placeholder="Select texture"
                onChange={(v) => {
                  if (!v) {
                    update({ [key]: undefined });
                    return;
                  }
                  // Convert project-relative → material-relative path
                  const texAbs = normalizePath(projectManager.resolvePath(v));
                  const matDirParts = matDir.split('/').filter(Boolean);
                  const texParts = texAbs.split('/').filter(Boolean);
                  let common = 0;
                  while (common < matDirParts.length && common < texParts.length && matDirParts[common].toLowerCase() === texParts[common].toLowerCase()) common++;
                  const ups = matDirParts.length - common;
                  const matRelPath = [...Array(ups).fill('..'), ...texParts.slice(common)].join('/');
                  update({ [key]: matRelPath });
                }}
              />
            </PropertyRow>
          );
        })}
      </Section>
    </>
  );
};
