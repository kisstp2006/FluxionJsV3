// ============================================================
// FluxionJS V3 — Asset Picker Popup
// Filtered, searchable dropdown listing project assets by type.
// Used by AssetInput; also available standalone.
// ============================================================

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { resolveIcon } from '../Icons';
import { AssetTypeRegistry, AssetTypeDefinition } from '../../../src/assets/AssetTypeRegistry';
import { getFileSystem } from '../../../src/filesystem';
import { normalizePath } from '../../../src/filesystem/FileSystem';
import { projectManager } from '../../../src/project/ProjectManager';

export interface AssetPickerItem {
  /** Project-relative path, e.g. "Assets/Textures/stone.png" */
  relPath: string;
  /** Display filename */
  name: string;
  /** Absolute path (for thumbnails) */
  absPath: string;
  /** Resolved asset type definition */
  typeDef: AssetTypeDefinition;
}

export interface AssetPickerPopupProps {
  /** Filter by asset type id(s), e.g. 'texture' or ['material', 'visual_material'] */
  assetType: string | string[];
  /** Screen position to anchor the popup */
  position: { x: number; y: number };
  /** Called when user picks an asset */
  onSelect: (relPath: string) => void;
  /** Close the popup */
  onClose: () => void;
  /** Currently selected value (highlighted) */
  currentValue?: string | null;
}

/** Recursively collect all files matching asset type under project root */
async function collectAssets(assetType: string | string[]): Promise<AssetPickerItem[]> {
  const projDir = projectManager.projectDir;
  if (!projDir) return [];

  const types = Array.isArray(assetType) ? assetType : [assetType];
  const extSet = new Set<string>();
  for (const t of types) {
    const def = AssetTypeRegistry.getByType(t);
    if (def) for (const ext of def.extensions) extSet.add(ext.toLowerCase());
  }
  if (extSet.size === 0) return [];
  const fs = getFileSystem();
  const results: AssetPickerItem[] = [];

  const walk = async (dir: string) => {
    let entries;
    try { entries = await fs.readDir(dir); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory) {
        // Skip hidden / meta directories
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        await walk(entry.path);
      } else {
        const dot = entry.name.lastIndexOf('.');
        if (dot < 0) continue;
        const ext = entry.name.substring(dot).toLowerCase();
        if (extSet.has(ext)) {
          const absPath = normalizePath(entry.path);
          const relPath = projectManager.relativePath(absPath);
          const resolvedType = AssetTypeRegistry.resolveFile(entry.name);
          if (resolvedType) results.push({ relPath, name: entry.name, absPath, typeDef: resolvedType });
        }
      }
    }
  };

  await walk(projDir);
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

const POPUP_WIDTH = 260;
const POPUP_MAX_HEIGHT = 320;
const MARGIN = 8;

export const AssetPickerPopup: React.FC<AssetPickerPopupProps> = ({
  assetType,
  position,
  onSelect,
  onClose,
  currentValue,
}) => {
  const [items, setItems] = useState<AssetPickerItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(null);

  // Collect assets on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    collectAssets(assetType).then((res) => {
      if (!cancelled) { setItems(res); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [assetType]);

  // Focus search on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Clamp position inside viewport
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + rect.width > vw - MARGIN) x = vw - rect.width - MARGIN;
    if (y + rect.height > vh - MARGIN) y = vh - rect.height - MARGIN;
    if (x < MARGIN) x = MARGIN;
    if (y < MARGIN) y = MARGIN;
    setAdjusted({ x, y });
  }, [position, items]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = search
    ? items.filter(it => it.name.toLowerCase().includes(search.toLowerCase()) || it.relPath.toLowerCase().includes(search.toLowerCase()))
    : items;

  const isTexture = Array.isArray(assetType) ? assetType.includes('texture') : assetType === 'texture';
  const displayType = Array.isArray(assetType) ? assetType.join('/') : assetType;
  const pos = adjusted ?? position;
  const normCurrent = currentValue ? normalizePath(currentValue) : null;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 10001,
        width: POPUP_WIDTH,
        maxHeight: POPUP_MAX_HEIGHT,
        background: 'var(--bg-secondary, #161b22)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '6px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Search */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border, #30363d)' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={`Search ${displayType}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 8px',
            border: '1px solid var(--border, #444)',
            borderRadius: '3px',
            background: 'var(--bg-input, #0d1117)',
            color: 'var(--text-primary, #e6edf3)',
            fontSize: '11px',
            outline: 'none',
            fontFamily: 'var(--font-sans, system-ui)',
          }}
        />
      </div>

      {/* Items list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {/* None option */}
        <div
          onClick={() => { onSelect(''); onClose(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            cursor: 'pointer',
            fontSize: '11px',
            color: 'var(--text-muted, #484f58)',
            fontStyle: 'italic',
            background: !normCurrent ? 'var(--bg-active, #253249)' : 'transparent',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #1f2937)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = !normCurrent ? 'var(--bg-active, #253249)' : 'transparent')}
        >
          None
        </div>

        {loading && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
            Scanning...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
            No {displayType} assets found
          </div>
        )}

        {filtered.map((item) => {
          const isSelected = normCurrent === normalizePath(item.relPath);
          return (
            <div
              key={item.relPath}
              onClick={() => { onSelect(item.relPath); onClose(); }}
              title={item.relPath}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '11px',
                color: isSelected ? 'var(--accent, #58a6ff)' : 'var(--text-primary, #e6edf3)',
                background: isSelected ? 'var(--bg-active, #253249)' : 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #1f2937)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? 'var(--bg-active, #253249)' : 'transparent')}
            >
              {/* Thumbnail for textures, icon for others */}
              {isTexture ? (
                <img
                  src={`file:///${item.absPath.replace(/\\/g, '/')}`}
                  alt=""
                  style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 2, flexShrink: 0, background: '#000' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span style={{ opacity: 0.6, flexShrink: 0 }}>{resolveIcon(item.typeDef.icon)}</span>
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {item.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
