// ============================================================
// FluxionJS V3 — PathInput (editor-only)
// Filesystem path field with a native browse button.
// Supports both file and folder modes, and type filters.
// NOT accessible to game scripts.
// ============================================================

import React, { useCallback } from 'react';

// ── Icons (inline, no external dep) ──────────────────────────

const FolderIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const FileIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const XIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ── Types ─────────────────────────────────────────────────────

export interface PathFilter {
  name: string;
  extensions: string[];
}

export interface PathInputProps {
  /** Current path value */
  value: string;
  /** Called with the new path (or '' to clear) */
  onChange: (value: string) => void;
  /** 'file' opens a file picker, 'folder' opens a directory picker. Default: 'file' */
  mode?: 'file' | 'folder';
  /** File type filters — only used in 'file' mode */
  filters?: PathFilter[];
  /** Placeholder shown when value is empty */
  placeholder?: string;
  /** Disable the input and browse button */
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────

export const PathInput: React.FC<PathInputProps> = ({
  value,
  onChange,
  mode = 'file',
  filters,
  placeholder,
  disabled = false,
}) => {
  const hasValue = !!value;

  const handleBrowse = useCallback(async () => {
    if (disabled) return;
    const api = (window as any).fluxionAPI;
    if (!api) return;

    let picked: string | null = null;
    if (mode === 'folder') {
      picked = await api.openDirDialog?.() ?? null;
    } else {
      picked = await api.openFileDialog?.(filters) ?? null;
    }
    if (picked !== null) onChange(picked);
  }, [disabled, mode, filters, onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  }, [onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  const displayValue = hasValue
    ? value.replace(/\\/g, '/')
    : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
      {/* Text input */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        background: disabled ? 'var(--bg-panel)' : 'var(--bg-input, #0d1117)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: 3,
        padding: '0 6px',
        minHeight: 26,
        overflow: 'hidden',
        opacity: disabled ? 0.5 : 1,
      }}>
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder ?? (mode === 'folder' ? 'Select folder…' : 'Select file…')}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: hasValue ? 'var(--text-primary, #e6edf3)' : 'var(--text-muted, #484f58)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            padding: 0,
            minWidth: 0,
          }}
        />
        {hasValue && !disabled && (
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
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary, #e6edf3)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #484f58)')}
          >
            <XIcon />
          </button>
        )}
      </div>

      {/* Browse button */}
      <button
        onClick={handleBrowse}
        disabled={disabled}
        title={mode === 'folder' ? 'Choose folder…' : 'Browse file…'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          background: 'var(--bg-hover, #1e2028)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: 3,
          color: 'var(--text-secondary, #c9d1d9)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 10,
          flexShrink: 0,
          opacity: disabled ? 0.5 : 1,
        }}
        onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent, #58a6ff)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border, #30363d)'; }}
      >
        {mode === 'folder' ? <FolderIcon /> : <FileIcon />}
        <span>…</span>
      </button>
    </div>
  );
};
