// ============================================================
// FluxionJS V3 — Generic Asset Inspector (Fallback)
// Shows basic file info for any asset type without a custom inspector.
// ============================================================

import React, { useEffect, useState } from 'react';
import { Section, PropertyRow } from '../../../ui';
import { AssetInspectorProps } from '../../../core/AssetInspectorRegistry';
import { getFileSystem } from '../../../../src/filesystem';
import { AssetTypeRegistry } from '../../../../src/assets/AssetTypeRegistry';
import type { FileInfo } from '../../../../src/filesystem/FileSystem';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

export const GenericAssetInspector: React.FC<AssetInspectorProps> = ({ assetPath, assetType }) => {
  const [info, setInfo] = useState<FileInfo | null>(null);

  const typeDef = AssetTypeRegistry.getByType(assetType);
  const fileName = assetPath.replace(/\\/g, '/').split('/').pop() || '';

  useEffect(() => {
    getFileSystem().stat(assetPath).then(setInfo).catch(() => setInfo(null));
  }, [assetPath]);

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    userSelect: 'text',
  };

  return (
    <Section title={typeDef?.displayName || 'Asset'} defaultOpen>
      <PropertyRow label="File">
        <span style={labelStyle}>{fileName}</span>
      </PropertyRow>
      <PropertyRow label="Type">
        <span style={{ ...labelStyle, color: typeDef?.color || 'var(--text-muted)' }}>
          {typeDef?.displayName || assetType}
        </span>
      </PropertyRow>
      {info && (
        <>
          <PropertyRow label="Size">
            <span style={labelStyle}>{formatBytes(info.size)}</span>
          </PropertyRow>
          <PropertyRow label="Modified">
            <span style={labelStyle}>{formatDate(info.modifiedAt)}</span>
          </PropertyRow>
        </>
      )}
      <PropertyRow label="Path">
        <span style={{ ...labelStyle, wordBreak: 'break-all', fontSize: '10px' }}>
          {assetPath}
        </span>
      </PropertyRow>
    </Section>
  );
};
