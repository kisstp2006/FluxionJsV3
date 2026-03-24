// ============================================================
// FluxionJS V2 — Asset Browser Panel Component
// Folder tree + grid view — reads real project directories
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Icons, ContextMenu } from '../../ui';
import { useEditor } from '../../core/EditorContext';
import { projectManager } from '../../../src/project/ProjectManager';

interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

function getFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    png: 'texture', jpg: 'texture', jpeg: 'texture', webp: 'texture', bmp: 'texture',
    glb: 'model', gltf: 'model', fbx: 'model', obj: 'model',
    fluxscene: 'scene', scene: 'scene',
    ogg: 'audio', mp3: 'audio', wav: 'audio',
    ts: 'script', js: 'script',
    mat: 'material',
  };
  return map[ext] || 'unknown';
}

const typeIcons: Record<string, string> = {
  texture: '🖼',
  model: '📐',
  material: Icons.material,
  audio: Icons.audio,
  script: Icons.script,
  scene: Icons.scene,
  unknown: '📄',
  folder: Icons.folder,
};

// ── Folder Tree Item ──
const FolderTreeItem: React.FC<{
  name: string;
  fullPath: string;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}> = ({ name, fullPath, depth, selectedPath, onSelect }) => {
  const [expanded, setExpanded] = useState(depth < 1);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (loaded) return;
    try {
      const api = window.fluxionAPI;
      if (!api) return;
      const entries = await api.readDir(fullPath);
      setChildren(entries.filter(e => e.isDirectory));
      setLoaded(true);
    } catch {}
  }, [fullPath, loaded]);

  useEffect(() => {
    if (expanded) load();
  }, [expanded, load]);

  return (
    <>
      <div
        onClick={() => {
          onSelect(fullPath);
          setExpanded(!expanded);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 6px',
          paddingLeft: `${6 + depth * 12}px`,
          cursor: 'pointer',
          fontSize: '12px',
          background: selectedPath === fullPath ? 'var(--bg-active)' : 'transparent',
          color: selectedPath === fullPath ? 'var(--accent)' : 'var(--text-secondary)',
          transition: 'background 150ms ease',
        }}
        onMouseEnter={(e) => {
          if (selectedPath !== fullPath) e.currentTarget.style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          if (selectedPath !== fullPath) e.currentTarget.style.background = 'transparent';
        }}
      >
        <span style={{ fontSize: '8px' }}>
          {expanded ? Icons.chevronDown : Icons.chevronRight}
        </span>
        <span>{Icons.folder}</span>
        <span>{name}</span>
      </div>

      {expanded && children.map((child) => (
        <FolderTreeItem
          key={child.path}
          name={child.name}
          fullPath={child.path}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </>
  );
};

// ── Main Asset Browser ──
export const AssetBrowserPanel: React.FC<{
  onOpenScene?: (path: string) => void;
}> = ({ onOpenScene }) => {
  const { state, log } = useEditor();
  const [selectedFolder, setSelectedFolder] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [inputDialog, setInputDialog] = useState<{ label: string; defaultValue: string; onSubmit: (value: string) => void } | null>(null);

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  // Set initial folder to project root
  useEffect(() => {
    if (state.projectLoaded && projectManager.projectDir) {
      setSelectedFolder(projectManager.projectDir);
    }
  }, [state.projectLoaded]);

  // Load directory contents when selected folder changes or refresh
  useEffect(() => {
    if (!selectedFolder) return;
    const api = window.fluxionAPI;
    if (!api) return;

    api.readDir(selectedFolder).then(setEntries).catch(() => setEntries([]));
  }, [selectedFolder, refreshKey]);

  const handleDoubleClick = (entry: DirEntry) => {
    if (entry.isDirectory) {
      setSelectedFolder(entry.path);
    } else if (entry.name.endsWith('.fluxscene')) {
      window.dispatchEvent(new CustomEvent('fluxion:open-scene', { detail: entry.path }));
    } else {
      log(`Opening ${entry.name}...`, 'info');
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const createNewScene = async () => {
    setInputDialog({
      label: 'Scene name',
      defaultValue: 'NewScene',
      onSubmit: async (name) => {
        const api = window.fluxionAPI;
        if (!api || !selectedFolder || !name.trim()) return;
        const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const filePath = `${selectedFolder}${selectedFolder.endsWith('\\') || selectedFolder.endsWith('/') ? '' : '\\'}${safeName}.fluxscene`;
        const emptyScene = JSON.stringify({ entities: [], editorCamera: null }, null, 2);
        try {
          await api.writeFile(filePath, emptyScene);
          log(`Created scene: ${safeName}.fluxscene`, 'system');
          refresh();
        } catch (err: any) {
          log(`Failed to create scene: ${err.message}`, 'error');
        }
      },
    });
  };

  const createNewFolder = async () => {
    setInputDialog({
      label: 'Folder name',
      defaultValue: 'NewFolder',
      onSubmit: async (name) => {
        const api = window.fluxionAPI;
        if (!api || !selectedFolder || !name.trim()) return;
        const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const folderPath = `${selectedFolder}${selectedFolder.endsWith('\\') || selectedFolder.endsWith('/') ? '' : '\\'}${safeName}`;
        try {
          await api.mkdir(folderPath);
          log(`Created folder: ${safeName}`, 'system');
          refresh();
        } catch (err: any) {
          log(`Failed to create folder: ${err.message}`, 'error');
        }
      },
    });
  };

  if (!state.projectLoaded) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No project loaded</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Folder Tree */}
      <div style={{
        width: '180px',
        borderRight: '1px solid var(--border)',
        padding: '4px',
        overflowY: 'auto',
      }}>
        {projectManager.projectDir && (
          <FolderTreeItem
            name={state.projectName || 'Project'}
            fullPath={projectManager.projectDir}
            depth={0}
            selectedPath={selectedFolder}
            onSelect={setSelectedFolder}
          />
        )}
      </div>

      {/* Asset Grid */}
      <div
        onContextMenu={handleContextMenu}
        style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: '8px',
        padding: '8px',
        overflowY: 'auto',
        alignContent: 'start',
      }}>
        {entries.map((entry) => {
          const fileType = entry.isDirectory ? 'folder' : getFileType(entry.name);
          return (
            <div
              key={entry.path}
              onDoubleClick={() => handleDoubleClick(entry)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 4px',
                borderRadius: '4px',
                cursor: 'pointer',
                gap: '4px',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: '28px' }}>{typeIcons[fileType] || '📄'}</span>
              <span style={{
                fontSize: '10px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                wordBreak: 'break-all',
                maxWidth: '72px',
              }}>
                {entry.name}
              </span>
            </div>
          );
        })}
      </div>

      {ctxMenu && (
        <ContextMenu
          position={ctxMenu}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: '📄 New Scene', onClick: createNewScene },
            { label: '📁 New Folder', onClick: createNewFolder },
            { label: '🔄 Refresh', onClick: refresh },
          ]}
        />
      )}

      {inputDialog && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }} onClick={() => setInputDialog(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '16px',
              minWidth: '280px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
              {inputDialog.label}
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('name') as HTMLInputElement);
              if (input?.value) {
                inputDialog.onSubmit(input.value);
              }
              setInputDialog(null);
            }}>
              <input
                name="name"
                autoFocus
                defaultValue={inputDialog.defaultValue}
                onKeyDown={(e) => { if (e.key === 'Escape') setInputDialog(null); }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setInputDialog(null)}
                  style={{
                    padding: '4px 12px', fontSize: '11px', background: 'var(--bg-hover)',
                    border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  type="submit"
                  style={{
                    padding: '4px 12px', fontSize: '11px', background: 'var(--accent)',
                    border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer',
                  }}
                >Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
