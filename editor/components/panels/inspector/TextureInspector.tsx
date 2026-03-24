// ============================================================
// FluxionJS V3 — Texture Asset Inspector
// Image preview, dimensions, format info, import settings.
// ============================================================

import React, { useEffect, useState } from 'react';
import { Section, PropertyRow } from '../../../ui';
import { AssetInspectorProps } from '../../../core/AssetInspectorRegistry';
import { getFileSystem } from '../../../../src/filesystem';
import type { FileInfo } from '../../../../src/filesystem/FileSystem';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface TextureInfo {
  width: number;
  height: number;
  fileSize: number;
  modifiedAt: number;
}

export const TextureInspector: React.FC<AssetInspectorProps> = ({ assetPath }) => {
  const [info, setInfo] = useState<TextureInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileName = assetPath.replace(/\\/g, '/').split('/').pop() || '';
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

  // Use file:// protocol for Electron local images
  const imgSrc = `file:///${assetPath.replace(/\\/g, '/')}`;

  useEffect(() => {
    let cancelled = false;
    const fs = getFileSystem();

    // Get file stat
    fs.stat(assetPath).then((stat: FileInfo) => {
      if (cancelled) return;
      // Load image to get dimensions
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setInfo({
          width: img.naturalWidth,
          height: img.naturalHeight,
          fileSize: stat.size,
          modifiedAt: stat.modifiedAt,
        });
      };
      img.onerror = () => {
        if (cancelled) return;
        setInfo({ width: 0, height: 0, fileSize: stat.size, modifiedAt: stat.modifiedAt });
        setError('Failed to load image preview');
      };
      img.src = imgSrc;
    }).catch(() => {
      if (!cancelled) setError('Failed to read file');
    });

    return () => { cancelled = true; };
  }, [assetPath, imgSrc]);

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    fontSize: '11px',
  };

  return (
    <>
      {/* Preview */}
      <Section title="Preview" defaultOpen>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '8px',
          background: 'var(--bg-input)',
          borderRadius: '4px',
          margin: '0 12px 8px',
          minHeight: '80px',
        }}>
          {error ? (
            <span style={{ color: 'var(--accent-red)', fontSize: '11px', alignSelf: 'center' }}>{error}</span>
          ) : (
            <img
              src={imgSrc}
              alt={fileName}
              style={{
                maxWidth: '100%',
                maxHeight: '200px',
                objectFit: 'contain',
                imageRendering: 'auto',
                borderRadius: '2px',
              }}
            />
          )}
        </div>
      </Section>

      {/* Properties */}
      <Section title="Texture Info" defaultOpen>
        <PropertyRow label="File">
          <span style={labelStyle}>{fileName}</span>
        </PropertyRow>
        <PropertyRow label="Format">
          <span style={{ ...labelStyle, color: '#4fc3f7' }}>{ext.replace('.', '').toUpperCase()}</span>
        </PropertyRow>
        {info && info.width > 0 && (
          <PropertyRow label="Resolution">
            <span style={labelStyle}>{info.width} x {info.height}</span>
          </PropertyRow>
        )}
        {info && (
          <PropertyRow label="Size">
            <span style={labelStyle}>{formatBytes(info.fileSize)}</span>
          </PropertyRow>
        )}
        {info && (
          <PropertyRow label="Modified">
            <span style={labelStyle}>{new Date(info.modifiedAt).toLocaleString()}</span>
          </PropertyRow>
        )}
      </Section>
    </>
  );
};
