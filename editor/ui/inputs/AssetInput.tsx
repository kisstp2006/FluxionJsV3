// ============================================================
// FluxionJS V3 — AssetInput
// Reusable input for selecting project assets by type.
// Shows filename + icon/thumbnail, browse button → popup,
// clear button, supports drag-and-drop from AssetBrowser.
// ============================================================

import React, { useState, useRef, useCallback } from 'react';
import { resolveIcon } from '../Icons';
import { AssetPickerPopup } from '../overlays/AssetPickerPopup';
import { AssetTypeRegistry } from '../../../src/assets/AssetTypeRegistry';
import { normalizePath } from '../../../src/filesystem/FileSystem';

export interface AssetInputProps {
  /** Current asset path (project-relative) or null/empty */
  value: string | null | undefined;
  /** Called with project-relative path (or '' to clear) */
  onChange: (value: string) => void;
  /** Asset type filter, e.g. 'texture', 'material', or ['material', 'visual_material'] */
  assetType: string | string[];
  /** Placeholder when no value is set */
  placeholder?: string;
}

function getFileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

export const AssetInput: React.FC<AssetInputProps> = ({
  value,
  onChange,
  assetType,
  placeholder,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasValue = !!value;
  const types = Array.isArray(assetType) ? assetType : [assetType];
  const isTexture = types.includes('texture');
  const displayType = types.join('/');
  const primaryType = types[0];

  const handleBrowse = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPickerPos({ x: rect.left, y: rect.bottom + 2 });
    }
    setShowPicker(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-fluxion-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath) return;
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef || !types.includes(typeDef.type)) return;
    onChange(assetPath);
  }, [assetType, onChange]);

  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  // Resolve absolute path for texture thumbnail
  let thumbnailUrl: string | null = null;
  if (isTexture && hasValue) {
    try {
      const { projectManager } = require('../../../src/project/ProjectManager');
      const abs = normalizePath(projectManager.resolvePath(value!));
      thumbnailUrl = `file:///${abs.replace(/\\/g, '/')}`;
    } catch {}
  }

  return (
    <>
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '3px',
          padding: '2px 4px',
          minHeight: '24px',
          background: hasValue ? 'rgba(255,255,255,0.03)' : 'transparent',
          width: '100%',
        }}
      >
        {/* Thumbnail / icon */}
        {isTexture && thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            style={{ width: 18, height: 18, objectFit: 'cover', borderRadius: 2, flexShrink: 0, background: '#000' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : hasValue ? (
          <span style={{ opacity: 0.6, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {resolveIcon(AssetTypeRegistry.getByType(primaryType)?.icon || 'file')}
          </span>
        ) : null}

        {/* Filename label */}
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono, monospace)',
            color: hasValue ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #484f58)',
            fontSize: '10px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={value || ''}
        >
          {hasValue ? getFileName(value!) : (placeholder || `Select ${displayType}...`)}
        </span>

        {/* Clear button */}
        {hasValue && (
          <button
            onClick={handleClear}
            title="Clear"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #484f58)',
              cursor: 'pointer',
              padding: '1px 2px',
              fontSize: '10px',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}

        {/* Browse button */}
        <button
          ref={btnRef}
          onClick={handleBrowse}
          title="Browse..."
          style={{
            padding: '2px 6px',
            fontSize: '10px',
            cursor: 'pointer',
            background: 'var(--bg-hover, #1f2937)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '3px',
            color: 'var(--text-primary, #e6edf3)',
            flexShrink: 0,
          }}
        >
          ...
        </button>
      </div>

      {/* Picker popup */}
      {showPicker && (
        <AssetPickerPopup
          assetType={assetType}
          position={pickerPos}
          currentValue={value}
          onSelect={(path) => onChange(path)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
};
