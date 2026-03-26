// ============================================================
// FluxionJS V3 — Visual Material Inspector (.fluxvismat)
// Right-panel inspector for visual material assets.
// ============================================================

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { Section, PropertyRow } from '../../../ui';
import { AssetInspectorProps } from '../../../core/AssetInspectorRegistry';
import { getFileSystem, normalizePath } from '../../../../src/filesystem';
import { VisualMaterialFile, validateGraph } from '../../../../src/materials/VisualMaterialGraph';
import { compileVisualMaterial, buildVisualMaterial } from '../../../../src/materials/VisualMaterialCompiler';
import { MaterialPreviewSphere } from '../MaterialPreviewSphere';

export const VisualMaterialInspector: React.FC<AssetInspectorProps> = ({ assetPath }) => {
  const [data, setData] = useState<VisualMaterialFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileName = assetPath.replace(/\\/g, '/').split('/').pop() || '';

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
    const { material } = await buildVisualMaterial(data, loadTexture);
    return material;
  }, [data, loadTexture]);

  useEffect(() => {
    let cancelled = false;
    getFileSystem()
      .readFile(assetPath)
      .then((text) => {
        if (cancelled) return;
        try {
          setData(JSON.parse(text));
          setError(null);
        } catch {
          setError('Invalid visual material JSON');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to read file');
      });
    return () => { cancelled = true; };
  }, [assetPath]);

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    fontSize: '11px',
  };

  if (error) {
    return (
      <Section title="Visual Material" defaultOpen>
        <div style={{ padding: '8px 12px', color: 'var(--accent-red)', fontSize: '11px' }}>{error}</div>
      </Section>
    );
  }

  if (!data) {
    return (
      <Section title="Visual Material" defaultOpen>
        <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>Loading...</div>
      </Section>
    );
  }

  const validation = validateGraph(data.graph);
  const compiled = compileVisualMaterial(data.graph);
  const hasErrors = validation.length > 0 || compiled.errors.length > 0;

  return (
    <>
      <MaterialPreviewSphere
        buildMaterial={buildMaterial}
        deps={[data]}
      />

      <Section title="Visual Material" defaultOpen>
        <PropertyRow label="File">
          <span style={labelStyle}>{fileName}</span>
        </PropertyRow>
        <PropertyRow label="Name">
          <span style={{ ...labelStyle, color: '#e040fb' }}>{data.name}</span>
        </PropertyRow>
        <PropertyRow label="Nodes">
          <span style={labelStyle}>{data.graph.nodes.length}</span>
        </PropertyRow>
        <PropertyRow label="Connections">
          <span style={labelStyle}>{data.graph.connections.length}</span>
        </PropertyRow>
        <PropertyRow label="Status">
          <span style={{ ...labelStyle, color: hasErrors ? '#ef5350' : '#66bb6a' }}>
            {hasErrors ? 'Errors' : 'OK'}
          </span>
        </PropertyRow>
      </Section>

      {hasErrors && (
        <Section title="Errors" defaultOpen>
          {[...validation, ...compiled.errors].map((err, i) => (
            <div key={i} style={{ padding: '2px 12px', color: '#ef5350', fontSize: '10px' }}>
              {err}
            </div>
          ))}
        </Section>
      )}

      {!hasErrors && (
        <Section title="Compilation" defaultOpen={false}>
          <PropertyRow label="Uniforms">
            <span style={labelStyle}>{Object.keys(compiled.uniforms).length}</span>
          </PropertyRow>
          <PropertyRow label="Textures">
            <span style={labelStyle}>{Object.keys(compiled.texturePaths).length}</span>
          </PropertyRow>
          <PropertyRow label="Time">
            <span style={labelStyle}>{compiled.needsTimeUpdate ? 'Yes' : 'No'}</span>
          </PropertyRow>
        </Section>
      )}

      <Section title="Actions" defaultOpen>
        <div style={{ padding: '4px 12px' }}>
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('fluxion:open-visual-material-editor', {
                  detail: { path: assetPath },
                }),
              );
            }}
            style={{
              width: '100%',
              padding: '6px 12px',
              border: '1px solid #e040fb',
              borderRadius: '4px',
              background: 'rgba(224, 64, 251, 0.1)',
              color: '#e040fb',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
            }}
          >
            ◈ Open Node Editor
          </button>
        </div>
      </Section>
    </>
  );
};
