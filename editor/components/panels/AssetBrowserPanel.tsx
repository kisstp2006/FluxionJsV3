// ============================================================
// FluxionJS V3 — Asset Browser Panel Component
// Folder tree + grid view — registry-driven file types & icons.
// Supports asset import (dialog + drag-and-drop) with .fluxmeta.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icons, ContextMenu } from '../../ui';
import { resolveIcon } from '../../ui/Icons';
import { useEditor } from '../../core/EditorContext';
import { projectManager } from '../../../src/project/ProjectManager';
import { getFileSystem } from '../../../src/filesystem';
import { AssetTypeRegistry } from '../../../src/assets/AssetTypeRegistry';
import { assetImporter } from '../../../src/assets/AssetImporter';
import { readAssetMeta } from '../../../src/assets/AssetMeta';

interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

function getFileType(name: string): string {
  const def = AssetTypeRegistry.resolveFile(name);
  return def?.type ?? 'unknown';
}

function getTypeIcon(type: string): React.ReactNode {
  if (type === 'folder') return Icons.folder;
  const def = AssetTypeRegistry.getByType(type);
  if (def?.icon) return resolveIcon(def.icon);
  return Icons.file;
}

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
      const fs = getFileSystem();
      const entries = await fs.readDir(fullPath);
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
  const [importProgress, setImportProgress] = useState<{ percent: number; file: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  // Set initial folder to project root
  useEffect(() => {
    if (state.projectLoaded && projectManager.projectDir) {
      setSelectedFolder(projectManager.projectDir);
    }
  }, [state.projectLoaded]);

  // Load directory contents when selected folder changes or refresh
  // Hide .fluxmeta sidecar files from the grid
  useEffect(() => {
    if (!selectedFolder) return;
    const fs = getFileSystem();
    fs.readDir(selectedFolder).then((all) => {
      setEntries(all.filter(e => !e.name.endsWith('.fluxmeta')));
    }).catch(() => setEntries([]));
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
        if (!selectedFolder || !name.trim()) return;
        try {
          const sceneDef = AssetTypeRegistry.getByType('scene');
          if (sceneDef?.createDefault) {
            const fs = getFileSystem();
            await sceneDef.createDefault(fs, selectedFolder, name.trim());
            log(`Created scene: ${name.trim()}.fluxscene`, 'system');
          }
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
        if (!selectedFolder || !name.trim()) return;
        const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const folderPath = `${selectedFolder}/${safeName}`;
        try {
          const fs = getFileSystem();
          await fs.mkdir(folderPath);
          log(`Created folder: ${safeName}`, 'system');
          refresh();
        } catch (err: any) {
          log(`Failed to create folder: ${err.message}`, 'error');
        }
      },
    });
  };

  // ── Import via dialog ──
  const handleImport = async () => {
    if (!selectedFolder) return;
    try {
      const results = await assetImporter.importWithDialog(selectedFolder, {
        conflictStrategy: 'rename',
        onProgress: (p) => setImportProgress({ percent: p.percent, file: p.currentFile }),
      });
      setImportProgress(null);

      const ok = results.filter(r => r.success).length;
      const fail = results.filter(r => !r.success).length;
      if (ok > 0) log(`Imported ${ok} asset(s)${fail > 0 ? `, ${fail} failed` : ''}`, 'system');
      if (fail > 0) {
        for (const r of results.filter(r => !r.success)) {
          log(`Import failed: ${r.error}`, 'error');
        }
      }
      refresh();
    } catch (err: any) {
      setImportProgress(null);
      log(`Import error: ${err.message}`, 'error');
    }
  };

  // ── Drag-and-drop import ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!selectedFolder || !e.dataTransfer.files.length) return;

    // Collect file paths from the Electron drag event
    const paths: string[] = [];
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      if ((file as any).path) {
        paths.push((file as any).path);
      }
    }
    if (paths.length === 0) return;

    try {
      const requests = paths.map(p => ({ sourcePath: p, targetDir: selectedFolder }));
      const results = await assetImporter.importFiles(requests, {
        conflictStrategy: 'rename',
        onProgress: (p) => setImportProgress({ percent: p.percent, file: p.currentFile }),
      });
      setImportProgress(null);

      const ok = results.filter(r => r.success).length;
      const fail = results.filter(r => !r.success).length;
      if (ok > 0) log(`Imported ${ok} asset(s) via drag-and-drop${fail > 0 ? `, ${fail} failed` : ''}`, 'system');
      if (fail > 0) {
        for (const r of results.filter(r => !r.success)) {
          log(`Import failed: ${r.error}`, 'error');
        }
      }
      refresh();
    } catch (err: any) {
      setImportProgress(null);
      log(`Drop import error: ${err.message}`, 'error');
    }
  };

  if (!state.projectLoaded) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No project loaded</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
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
        ref={gridRef}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: '8px',
        padding: '8px',
        overflowY: 'auto',
        alignContent: 'start',
        position: 'relative',
        border: isDragOver ? '2px dashed var(--accent)' : '2px solid transparent',
        transition: 'border 150ms ease',
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
              <span style={{ fontSize: '28px' }}>{getTypeIcon(fileType)}</span>
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
            ...AssetTypeRegistry.getCreatable().map((def) => ({
              label: `New ${def.displayName}`,
              icon: resolveIcon(def.icon),
              onClick: () => {
                setInputDialog({
                  label: `${def.displayName} name`,
                  defaultValue: `New${def.displayName}`,
                  onSubmit: async (name) => {
                    if (!selectedFolder || !name.trim() || !def.createDefault) return;
                    try {
                      const fs = getFileSystem();
                      await def.createDefault(fs, selectedFolder, name.trim());
                      log(`Created ${def.displayName.toLowerCase()}: ${name.trim()}`, 'system');
                      refresh();
                    } catch (err: any) {
                      log(`Failed to create ${def.displayName.toLowerCase()}: ${err.message}`, 'error');
                    }
                  },
                });
              },
            })),
            { label: 'New Folder', icon: Icons.folder, onClick: createNewFolder },
            { label: 'Import Assets...', icon: Icons.download, onClick: handleImport },
            { label: 'Refresh', icon: Icons.refresh, onClick: refresh },
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

      {/* Drop overlay */}
      {isDragOver && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(88,166,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 5,
        }}>
          <span style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600 }}>
            Drop files to import
          </span>
        </div>
      )}

      {/* Import progress bar */}
      {importProgress && (
        <div style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          background: 'var(--bg-panel)',
          borderTop: '1px solid var(--border)',
          padding: '6px 10px',
          zIndex: 10,
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Importing {importProgress.file}... {importProgress.percent}%
          </div>
          <div style={{
            height: '3px',
            background: 'var(--bg-hover)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${importProgress.percent}%`,
              background: 'var(--accent)',
              borderRadius: '2px',
              transition: 'width 150ms ease',
            }} />
          </div>
        </div>
      )}
    </div>
  );
};
