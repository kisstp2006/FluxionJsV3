// ============================================================
// FluxionJS V3 — FontInput
// Picks a font file asset from the project.
// Stores { path, family } — family is derived from filename
// if not supplied.  Used in FUI editor and inspector panels.
// Also accessible to scripts via FontRef.
// ============================================================

import React, { useCallback, useState } from 'react';
import { AssetInput } from './AssetInput';

export interface FontValue {
  /** Project-relative path to the font file. */
  path: string;
  /** CSS font-family name.  Defaults to the filename without extension. */
  family: string;
}

export interface FontInputProps {
  value: FontValue | null | undefined;
  onChange: (value: FontValue | null) => void;
  /** Label prefix shown on the family name row. Default: "Family" */
  familyLabel?: string;
}

function familyFromPath(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? '';
  return name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
}

export const FontInput: React.FC<FontInputProps> = ({
  value,
  onChange,
  familyLabel = 'Family',
}) => {
  const [familyDraft, setFamilyDraft] = useState<string | null>(null);

  const handlePathChange = useCallback((newPath: string) => {
    if (!newPath) {
      onChange(null);
      setFamilyDraft(null);
      return;
    }
    const derived = familyFromPath(newPath);
    onChange({ path: newPath, family: value?.family || derived });
    setFamilyDraft(null);
  }, [value, onChange]);

  const handleFamilyCommit = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!value?.path) return;
    onChange({ ...value, family: trimmed || familyFromPath(value.path) });
    setFamilyDraft(null);
  }, [value, onChange]);

  const familyDisplay = familyDraft !== null
    ? familyDraft
    : (value?.family || (value?.path ? familyFromPath(value.path) : ''));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-input, #0d1117)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 3,
    color: 'var(--text-primary, #e6edf3)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 10,
    padding: '3px 6px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      {/* Asset picker row */}
      <AssetInput
        value={value?.path ?? null}
        assetType="font"
        placeholder="Select font…"
        onChange={handlePathChange}
      />

      {/* Family name row — only shown when a path is set */}
      {value?.path && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted, #484f58)',
            flexShrink: 0,
            minWidth: 44,
          }}>
            {familyLabel}
          </span>
          <input
            type="text"
            value={familyDisplay}
            onChange={(e) => setFamilyDraft(e.target.value)}
            onBlur={(e) => handleFamilyCommit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleFamilyCommit((e.target as HTMLInputElement).value); }}
            placeholder={familyFromPath(value.path)}
            style={inputStyle}
          />
        </div>
      )}
    </div>
  );
};
