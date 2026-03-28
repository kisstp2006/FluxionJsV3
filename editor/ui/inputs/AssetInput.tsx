// ============================================================
// FluxionJS V3 — AssetInput (unified inspector standard)
// Layout: [drag-icon] [filename field] [◇ clear] | [thumbnail]
// Supports drag-and-drop from AssetBrowser, click-to-browse
// popup, and large square thumbnail preview on the right.
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

// ── Inline SVG icons ─────────────────────────────────────────

const HandIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
  </svg>
);

const DiamondIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 22 12 12 22 2 12"/>
  </svg>
);

const FolderIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

export const AssetInput: React.FC<AssetInputProps> = ({
  value,
  onChange,
  assetType,
  placeholder,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasValue = !!value;
  const types = Array.isArray(assetType) ? assetType : [assetType];
  const isTexture = types.includes('texture');
  const displayType = types.join('/');
  const primaryType = types[0];

  const handleBrowse = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPickerPos({ x: rect.left, y: rect.bottom + 4 });
    }
    setShowPicker(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-fluxion-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const assetPath = e.dataTransfer.getData('application/x-fluxion-asset');
    if (!assetPath) return;
    const typeDef = AssetTypeRegistry.resolveFile(assetPath);
    if (!typeDef || !types.includes(typeDef.type)) return;
    onChange(assetPath);
  }, [assetType, onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  }, [onChange]);

  // Resolve absolute path for thumbnail
  let thumbnailUrl: string | null = null;
  if (isTexture && hasValue) {
    try {
      const { projectManager } = require('../../../src/project/ProjectManager');
      const abs = normalizePath(projectManager.resolvePath(value!));
      thumbnailUrl = `file:///${abs.replace(/\\/g, '/')}`;
    } catch {}
  }

  const THUMB_SIZE = 56;

  return (
    <>
      <div
        ref={containerRef}
        style={{ display: 'flex', alignItems: 'stretch', gap: '6px', width: '100%' }}
      >
        {/* ── Left field: drag-icon + name + clear ─────────── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowse}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: isDragOver ? 'rgba(88,166,255,0.08)' : 'var(--bg-input, #0d1117)',
            border: `1px solid ${isDragOver ? 'var(--accent, #58a6ff)' : 'var(--border, #30363d)'}`,
            borderRadius: '3px',
            padding: '0 6px',
            minHeight: '26px',
            cursor: 'pointer',
            transition: 'border-color 120ms ease',
            overflow: 'hidden',
          }}
        >
          {/* Hand / drag indicator */}
          <span style={{
            color: isDragOver ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #484f58)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 120ms ease',
          }}>
            <HandIcon />
          </span>

          {/* Filename */}
          <span style={{
            flex: 1,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            color: hasValue ? 'var(--accent, #58a6ff)' : 'var(--text-muted, #484f58)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }} title={value || ''}>
            {hasValue ? getFileName(value!) : (placeholder || `Select ${displayType}…`)}
          </span>

          {/* Clear (diamond) */}
          {hasValue && (
            <button
              onClick={handleClear}
              title="Clear"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, #484f58)',
                cursor: 'pointer',
                padding: '2px',
                lineHeight: 1,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                transition: 'color 100ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary, #e6edf3)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #484f58)')}
            >
              <DiamondIcon />
            </button>
          )}

          {/* Browse icon (folder) — always visible on hover, subtle otherwise */}
          <span style={{
            color: 'var(--text-muted, #484f58)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
          }}>
            <FolderIcon />
          </span>
        </div>

        {/* ── Right: thumbnail preview ──────────────────────── */}
        <div
          onClick={handleBrowse}
          style={{
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            flexShrink: 0,
            border: `1px solid ${isDragOver ? 'var(--accent, #58a6ff)' : 'var(--border, #30363d)'}`,
            borderRadius: '3px',
            background: 'var(--bg-input, #0d1117)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'border-color 120ms ease',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : hasValue ? (
            <span style={{ opacity: 0.4, color: 'var(--text-primary, #e6edf3)' }}>
              {resolveIcon(AssetTypeRegistry.getByType(primaryType)?.icon || 'file')}
            </span>
          ) : (
            <span style={{ opacity: 0.2, color: 'var(--text-muted, #484f58)', fontSize: '10px', textAlign: 'center', padding: '4px' }}>
              {resolveIcon(AssetTypeRegistry.getByType(primaryType)?.icon || 'file')}
            </span>
          )}
        </div>
      </div>

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
