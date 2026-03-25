// ============================================================
// FluxionJS V3 — Asset Browser Panel Component
// Folder tree + grid view — registry-driven file types & icons.
// Supports asset import (dialog + drag-and-drop) with .fluxmeta.
// Per-item context menu: rename, delete, duplicate, open in
// file explorer, copy path / absolute path.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icons, ContextMenu, ContextMenuItem } from '../../ui';
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

/** Access the fluxionAPI bridge for shell utilities. */
function getFluxionAPI(): any {
  return (window as any).fluxionAPI;
}

/** Get the .fluxmeta sidecar path for a given asset path. */
function metaPath(assetPath: string): string {
  return assetPath + '.fluxmeta';
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
  const { state, dispatch, log } = useEditor();
  const [selectedFolder, setSelectedFolder] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [inputDialog, setInputDialog] = useState<{
    label: string;
    defaultValue: string;
    submitLabel?: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [importProgress, setImportProgress] = useState<{ percent: number; file: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [renamingEntry, setRenamingEntry] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  // ── File Operations ──

  const deleteEntry = (entry: DirEntry) => {
    const label = entry.isDirectory ? `folder "${entry.name}" and all its contents` : `"${entry.name}"`;
    setConfirmDialog({
      message: `Delete ${label}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          const fs = getFileSystem();
          await fs.delete(entry.path);
          // Also remove .fluxmeta sidecar if present
          if (!entry.isDirectory) {
            const meta = metaPath(entry.path);
            if (await fs.exists(meta)) await fs.delete(meta);
          }
          log(`Deleted ${entry.name}`, 'system');
          refresh();
        } catch (err: any) {
          log(`Failed to delete ${entry.name}: ${err.message}`, 'error');
        }
      },
    });
  };

  const renameEntry = (entry: DirEntry) => {
    setRenamingEntry(entry.path);
    // Focus is handled by the useEffect below
  };

  const commitRename = async (entry: DirEntry, newName: string) => {
    setRenamingEntry(null);
    const trimmed = newName.trim();
    if (!trimmed || trimmed === entry.name) return;
    const parentDir = entry.path.substring(0, entry.path.lastIndexOf('/'));
    const newPath = `${parentDir}/${trimmed}`;
    try {
      const fs = getFileSystem();
      if (await fs.exists(newPath)) {
        log(`Cannot rename: "${trimmed}" already exists`, 'error');
        return;
      }
      await fs.rename(entry.path, newPath);
      // Also rename .fluxmeta sidecar if present
      if (!entry.isDirectory) {
        const oldMeta = metaPath(entry.path);
        if (await fs.exists(oldMeta)) {
          await fs.rename(oldMeta, metaPath(newPath));
        }
      }
      log(`Renamed to ${trimmed}`, 'system');
      refresh();
    } catch (err: any) {
      log(`Failed to rename: ${err.message}`, 'error');
    }
  };

  const duplicateEntry = async (entry: DirEntry) => {
    if (entry.isDirectory) return;
    const dot = entry.name.lastIndexOf('.');
    const baseName = dot > 0 ? entry.name.substring(0, dot) : entry.name;
    const ext = dot > 0 ? entry.name.substring(dot) : '';
    const parentDir = entry.path.substring(0, entry.path.lastIndexOf('/'));
    const fs = getFileSystem();
    // Find a unique name
    let suffix = 1;
    let newPath = `${parentDir}/${baseName}_copy${ext}`;
    while (await fs.exists(newPath)) {
      suffix++;
      newPath = `${parentDir}/${baseName}_copy${suffix}${ext}`;
    }
    try {
      await fs.copy(entry.path, newPath);
      // Don't copy .fluxmeta — the duplicate is a new asset, it will get its own meta on next import/use
      log(`Duplicated as ${newPath.substring(newPath.lastIndexOf('/') + 1)}`, 'system');
      refresh();
    } catch (err: any) {
      log(`Failed to duplicate: ${err.message}`, 'error');
    }
  };

  /** Check if a filename is a 3D model (FBX, GLTF, GLB, OBJ) */
  const isModelFile = (name: string): boolean => {
    const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
    return ['.fbx', '.glb', '.gltf', '.obj'].includes(ext);
  };

  /** Extract all embedded textures from a 3D model file */
  const extractTexturesFromModel = async (entry: DirEntry) => {
    log(`Extracting textures from ${entry.name}...`, 'system');
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const { getTextureRefsFromMaterial, saveTextureToFile } = await import('../../../src/assets/FluxMeshData');
      const { createAssetMeta, writeAssetMeta } = await import('../../../src/assets/AssetMeta');
      const fs = getFileSystem();

      const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
      const fileUrl = `file:///${entry.path.replace(/\\/g, '/')}`;
      let root: any;

      if (ext === '.fbx') {
        root = await new Promise((res, rej) => new FBXLoader().load(fileUrl, res, undefined, rej));
      } else if (ext === '.obj') {
        root = await new Promise((res, rej) => new OBJLoader().load(fileUrl, res, undefined, rej));
      } else {
        const gltf = await new Promise<any>((res, rej) => new GLTFLoader().load(fileUrl, res, undefined, rej));
        root = gltf.scene;
      }

      // Collect unique materials
      const materials = new Set<any>();
      root.traverse((child: any) => {
        if (child.isMesh) {
          const mats: any[] = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m: any) => materials.add(m));
        }
      });

      const dir = entry.path.substring(0, entry.path.lastIndexOf('/'));
      const baseName = entry.name.replace(/\.[^.]+$/, '');
      const texturesDir = `${dir}/${baseName}_textures`;
      let dirCreated = false;
      const saved = new Set<any>();
      let count = 0;

      for (const mat of materials) {
        const texRefs = getTextureRefsFromMaterial(mat);
        for (const texRef of texRefs) {
          if (saved.has(texRef.texture)) continue;

          if (!dirCreated) {
            try { await fs.mkdir(texturesDir); } catch { /* may exist */ }
            dirCreated = true;
          }

          const matName = (mat.name || 'material').replace(/[^a-zA-Z0-9_-]/g, '_');
          const texFileName = `${baseName}_${matName}_${texRef.label}.png`;
          const texSavePath = `${texturesDir}/${texFileName}`;

          const ok = await saveTextureToFile(
            texRef.texture,
            texSavePath,
            (path, data) => fs.writeBinary(path, data),
          );

          if (ok) {
            saved.add(texRef.texture);
            const texMeta = createAssetMeta('texture', texSavePath, '', '', 0);
            await writeAssetMeta(fs, texSavePath, texMeta);
            count++;
          }
        }
      }

      if (count > 0) {
        log(`Extracted ${count} texture(s) to ${baseName}_textures/`, 'system');
      } else {
        log(`No embedded textures found in ${entry.name}`, 'info');
      }
      refresh();
    } catch (err: any) {
      log(`Failed to extract textures: ${err.message}`, 'error');
    }
  };

  const showInExplorer = (entryPath: string) => {
    const api = getFluxionAPI();
    if (api?.showItemInFolder) {
      // Convert forward slashes to OS path for Electron shell
      api.showItemInFolder(entryPath.replace(/\//g, '\\'));
    }
  };

  const copyRelativePath = (entryPath: string) => {
    const rel = projectManager.projectDir
      ? entryPath.replace(projectManager.projectDir, '').replace(/^[\\/]+/, '')
      : entryPath;
    navigator.clipboard.writeText(rel);
    log(`Copied path: ${rel}`, 'info');
  };

  const copyAbsolutePath = (entryPath: string) => {
    navigator.clipboard.writeText(entryPath);
    log(`Copied absolute path`, 'info');
  };

  // ── Context Menus ──

  /** Context menu for the empty grid area (background) */
  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
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
        { label: '', icon: undefined, onClick: () => {}, separator: true },
        { label: 'Import Assets...', icon: Icons.download, onClick: handleImport },
        { label: 'Refresh', icon: Icons.refresh, onClick: refresh },
        { label: '', icon: undefined, onClick: () => {}, separator: true },
        ...(selectedFolder ? [
          { label: 'Open in File Explorer', icon: Icons.externalLink, onClick: () => showInExplorer(selectedFolder) },
          { label: 'Copy Path', icon: Icons.copy, onClick: () => copyRelativePath(selectedFolder) },
        ] : []),
      ],
    });
  };

  /** Context menu for a specific file or folder entry */
  const handleItemContextMenu = (e: React.MouseEvent, entry: DirEntry) => {
    e.preventDefault();
    e.stopPropagation();

    const fileType = entry.isDirectory ? 'folder' : getFileType(entry.name);
    if (!entry.isDirectory) {
      dispatch({ type: 'SELECT_ASSET', asset: { path: entry.path, type: fileType } });
    }

    const items: ContextMenuItem[] = [];

    if (entry.isDirectory) {
      items.push({ label: 'Open', icon: Icons.folderOpen, onClick: () => setSelectedFolder(entry.path) });
    } else if (entry.name.endsWith('.fluxscene')) {
      items.push({
        label: 'Open Scene',
        icon: Icons.scene,
        onClick: () => window.dispatchEvent(new CustomEvent('fluxion:open-scene', { detail: entry.path })),
      });
    }

    items.push({ label: 'Rename', icon: Icons.pencil, shortcut: 'F2', onClick: () => renameEntry(entry) });

    if (!entry.isDirectory) {
      items.push({ label: 'Duplicate', icon: Icons.copy, onClick: () => duplicateEntry(entry) });
    }

    // Model-specific: extract embedded textures
    if (!entry.isDirectory && isModelFile(entry.name)) {
      items.push({ label: 'Extract Textures', icon: Icons.image, onClick: () => extractTexturesFromModel(entry) });
    }

    items.push({ label: 'Delete', icon: Icons.trash, shortcut: 'Del', onClick: () => deleteEntry(entry) });

    items.push({ label: '', icon: undefined, onClick: () => {}, separator: true });
    items.push({ label: 'Show in File Explorer', icon: Icons.externalLink, onClick: () => showInExplorer(entry.path) });
    items.push({ label: 'Copy Path', icon: Icons.clipboard, onClick: () => copyRelativePath(entry.path) });
    items.push({ label: 'Copy Absolute Path', icon: Icons.clipboard, onClick: () => copyAbsolutePath(entry.path) });

    setCtxMenu({ x: e.clientX, y: e.clientY, items });
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
        onContextMenu={handleBackgroundContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={(e) => {
          // Keyboard shortcuts when grid is focused
          const selected = entries.find(en => en.path === state.selectedAsset?.path);
          if (!selected) return;
          if (e.key === 'Delete') { e.preventDefault(); deleteEntry(selected); }
          if (e.key === 'F2') { e.preventDefault(); renameEntry(selected); }
        }}
        tabIndex={0}
        style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: '8px',
        padding: '8px',
        overflowY: 'auto',
        alignContent: 'start',
        position: 'relative',
        outline: 'none',
        border: isDragOver ? '2px dashed var(--accent)' : '2px solid transparent',
        transition: 'border 150ms ease',
      }}>
        {entries.map((entry) => {
          const fileType = entry.isDirectory ? 'folder' : getFileType(entry.name);
          const isRenaming = renamingEntry === entry.path;
          return (
            <div
              key={entry.path}
              draggable={!entry.isDirectory && !isRenaming}
              onDragStart={(e) => {
                if (entry.isDirectory) return;
                const relPath = projectManager.projectDir
                  ? entry.path.replace(projectManager.projectDir, '').replace(/^[\\/]+/, '')
                  : entry.name;
                e.dataTransfer.setData('application/x-fluxion-asset', relPath);
                e.dataTransfer.setData('application/x-fluxion-asset-abs', entry.path);
                const typeDef = AssetTypeRegistry.resolveFile(entry.name);
                if (typeDef) {
                  e.dataTransfer.setData('application/x-fluxion-asset-type', typeDef.type);
                }
                e.dataTransfer.effectAllowed = 'copyLink';
              }}
              onClick={() => {
                if (!entry.isDirectory) {
                  dispatch({ type: 'SELECT_ASSET', asset: { path: entry.path, type: fileType } });
                }
              }}
              onDoubleClick={() => handleDoubleClick(entry)}
              onContextMenu={(e) => handleItemContextMenu(e, entry)}
              style={{
                display: 'flex',
                border: state.selectedAsset?.path === entry.path ? '1px solid var(--accent)' : '1px solid transparent',
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
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  autoFocus
                  defaultValue={entry.name}
                  onBlur={(e) => commitRename(entry, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(entry, e.currentTarget.value); }
                    if (e.key === 'Escape') { e.stopPropagation(); setRenamingEntry(null); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--accent)',
                    borderRadius: '3px',
                    padding: '2px 4px',
                    textAlign: 'center',
                    maxWidth: '72px',
                    width: '72px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <span style={{
                  fontSize: '10px',
                  color: 'var(--text-secondary)',
                  textAlign: 'center',
                  wordBreak: 'break-all',
                  maxWidth: '72px',
                }}>
                  {entry.name}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          position={ctxMenu}
          onClose={() => setCtxMenu(null)}
          items={ctxMenu.items}
        />
      )}

      {/* Input Dialog (Create / etc.) */}
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
                >{inputDialog.submitLabel ?? 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog (Delete etc.) */}
      {confirmDialog && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }} onClick={() => setConfirmDialog(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '16px',
              minWidth: '300px',
              maxWidth: '400px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '14px', lineHeight: 1.5 }}>
              {confirmDialog.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setConfirmDialog(null)}
                style={{
                  padding: '4px 12px', fontSize: '11px', background: 'var(--bg-hover)',
                  border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                autoFocus
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                style={{
                  padding: '4px 12px', fontSize: '11px', background: '#d73a49',
                  border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer',
                }}
              >Delete</button>
            </div>
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
