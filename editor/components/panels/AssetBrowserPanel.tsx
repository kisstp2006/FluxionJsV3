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
import { normalizePath } from '../../../src/filesystem/FileSystem';
import { AssetTypeRegistry } from '../../../src/assets/AssetTypeRegistry';
import { assetImporter } from '../../../src/assets/AssetImporter';
import { getThumbnail, requestThumbnail, invalidateThumbnail } from '../../utils/ThumbnailCache';

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

// ── Model Import Settings ──

interface ModelImportSettings {
  scale: number;
  generateCollider: boolean;
}

const ModelImportSettingsDialog: React.FC<{
  fileCount: number;
  onConfirm: (s: ModelImportSettings) => void;
  onCancel: () => void;
}> = ({ fileCount, onConfirm, onCancel }) => {
  const [scale, setScale] = React.useState(1);
  const [generateCollider, setGenerateCollider] = React.useState(false);
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: '6px', padding: '16px', minWidth: '260px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Import {fileCount} model{fileCount > 1 ? 's' : ''} — settings
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            Import Scale
            <input
              type="number"
              value={scale}
              min={0.001}
              step={0.1}
              onChange={(e) => setScale(parseFloat(e.target.value) || 1)}
              style={{
                padding: '4px 8px', background: 'var(--bg-input)',
                border: '1px solid var(--border)', borderRadius: '4px',
                color: 'var(--text-primary)', fontSize: '12px', outline: 'none',
              }}
            />
          </label>

          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={generateCollider}
              onChange={(e) => setGenerateCollider(e.target.checked)}
            />
            Generate Collider (future)
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button onClick={onCancel} style={{
            padding: '4px 12px', fontSize: '11px', background: 'var(--bg-hover)',
            border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={() => onConfirm({ scale, generateCollider })} style={{
            padding: '4px 12px', fontSize: '11px', background: 'var(--accent)',
            border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer',
          }}>Import</button>
        </div>
      </div>
    </div>
  );
};

// Module-level cache for texture load failures — avoids retrying known-bad paths
const _texFailed = new Set<string>();

/** Small texture thumbnail with icon fallback on load error. */
const TextureThumbnail: React.FC<{ path: string; fallback: React.ReactNode }> = ({ path, fallback }) => {
  const url = `file:///${path.replace(/\\/g, '/')}`;
  const [failed, setFailed] = useState(() => _texFailed.has(url));
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={url}
      alt=""
      onError={() => { _texFailed.add(url); setFailed(true); }}
      style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: '3px', display: 'block' }}
    />
  );
};

/** Cached sphere thumbnail for .fluxmat / .fluxvismat files. */
const MaterialThumbnail: React.FC<{ path: string; fallback: React.ReactNode }> = ({ path, fallback }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(() => getThumbnail(path));

  useEffect(() => {
    if (dataUrl) return;
    requestThumbnail(path, () => {
      const url = getThumbnail(path);
      if (url) setDataUrl(url);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (!dataUrl) return <>{fallback}</>;
  return (
    <img
      src={dataUrl}
      alt=""
      style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: '3px', display: 'block' }}
    />
  );
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
}> = ({ onOpenScene: _onOpenScene }) => {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [outdatedPaths, setOutdatedPaths] = useState<Set<string>>(new Set());
  const [pendingModelImport, setPendingModelImport] = useState<{ fileCount: number } | null>(null);
  const modelImportResolveRef = useRef<((s: ModelImportSettings | null) => void) | null>(null);
  type SortMode = 'name-asc' | 'name-desc' | 'type';
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  // Invalidate material thumbnail cache when a material file is saved
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail?.path as string | undefined;
      if (path) invalidateThumbnail(path);
    };
    window.addEventListener('fluxion:material-changed', handler);
    return () => window.removeEventListener('fluxion:material-changed', handler);
  }, []);

  // Auto-refresh when filesystem changes are detected by the hot-reload watcher
  useEffect(() => {
    const handler = (e: Event) => {
      const changedPath = (e as CustomEvent).detail?.path as string | undefined;
      if (!changedPath || !selectedFolder) return;
      // Refresh if the changed file is inside the currently viewed folder
      const norm = normalizePath(changedPath);
      const dir = norm.substring(0, norm.lastIndexOf('/'));
      if (normalizePath(selectedFolder) === dir) {
        refresh();
      }
    };
    window.addEventListener('fluxion:fs-changed', handler);
    return () => window.removeEventListener('fluxion:fs-changed', handler);
  }, [selectedFolder, refresh]);

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

  // Check which entries have an outdated source file (source hash changed since import)
  useEffect(() => {
    if (entries.length === 0) { setOutdatedPaths(new Set()); return; }
    let cancelled = false;
    const check = async () => {
      const outdated = new Set<string>();
      await Promise.allSettled(
        entries
          .filter(e => !e.isDirectory)
          .map(async (e) => {
            const result = await assetImporter.checkOutdated(e.path).catch(() => null);
            if (!cancelled && result === true) outdated.add(e.path);
          }),
      );
      if (!cancelled) setOutdatedPaths(outdated);
    };
    void check();
    return () => { cancelled = true; };
  }, [entries]);

  const handleDoubleClick = (entry: DirEntry) => {
    if (entry.isDirectory) {
      setSelectedFolder(entry.path);
    } else if (entry.name.endsWith('.fluxscene')) {
      window.dispatchEvent(new CustomEvent('fluxion:open-scene', { detail: entry.path }));
    } else if (entry.name.endsWith('.fluxvismat')) {
      window.dispatchEvent(new CustomEvent('fluxion:open-visual-material-editor', { detail: { path: entry.path } }));
    } else if (entry.name.endsWith('.fui')) {
      window.dispatchEvent(new CustomEvent('fluxion:open-fui-editor', { detail: { path: entry.path } }));
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

  const reimportEntry = async (entry: DirEntry) => {
    log(`Reimporting ${entry.name}...`, 'system');
    try {
      const result = await assetImporter.reimport(entry.path);
      if (result.success) {
        log(`Reimported ${entry.name}`, 'system');
      } else {
        log(`Reimport failed: ${result.error}`, 'error');
      }
      refresh();
    } catch (err: any) {
      log(`Reimport error: ${err.message}`, 'error');
    }
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
        {
          label: 'Check Missing References',
          icon: Icons.file,
          onClick: async () => {
            if (!projectManager.projectDir) return;
            log('Scanning for missing references...', 'system');
            try {
              const { scanMissingRefs } = await import('../../../src/assets/MissingRefScanner');
              const fs = getFileSystem();
              const missing = await scanMissingRefs(fs, projectManager.projectDir);
              if (missing.length === 0) {
                log('No missing references found.', 'system');
              } else {
                log(`Found ${missing.length} missing reference(s):`, 'error');
                for (const ref of missing) {
                  const relSource = ref.sourceFile.replace(projectManager.projectDir!, '').replace(/^[\\/]+/, '');
                  log(`  ${relSource} → [${ref.field}] "${ref.referencedPath}" not found`, 'error');
                }
              }
            } catch (err: any) {
              log(`Reference scan failed: ${err.message}`, 'error');
            }
          },
        },
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
      // If right-clicking outside the current selection, reset to this item only
      if (!selectedPaths.has(entry.path)) {
        setSelectedPaths(new Set([entry.path]));
        lastClickedRef.current = entry.path;
      }
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
      items.push({ label: 'Reimport', icon: Icons.refresh, onClick: () => reimportEntry(entry) });
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

  // ── Import helpers ──

  /** Show the model settings dialog and return the chosen settings (or null if cancelled). */
  const promptModelSettings = (fileCount: number): Promise<ModelImportSettings | null> =>
    new Promise((resolve) => {
      modelImportResolveRef.current = resolve;
      setPendingModelImport({ fileCount });
    });

  /**
   * Common import runner: if any paths are model files, prompt for settings first,
   * then call importFiles with per-request importSettings applied.
   */
  const runImportWithSettingsCheck = async (paths: string[], targetDir: string, logSuffix = '') => {
    const modelPaths = paths.filter((p) => isModelFile(p.replace(/\\/g, '/').split('/').pop() ?? ''));

    let modelSettings: ModelImportSettings | null = null;
    if (modelPaths.length > 0) {
      modelSettings = await promptModelSettings(modelPaths.length);
      if (modelSettings === null) return; // user cancelled
    }

    const requests = paths.map((p) => ({
      sourcePath: p,
      targetDir,
      ...(modelPaths.includes(p) && modelSettings ? { importSettings: { ...modelSettings } } : {}),
    }));

    try {
      const results = await assetImporter.importFiles(requests, {
        conflictStrategy: 'rename',
        onProgress: (p) => setImportProgress({ percent: p.percent, file: p.currentFile }),
      });
      setImportProgress(null);
      const ok = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success).length;
      if (ok > 0) log(`Imported ${ok} asset(s)${logSuffix}${fail > 0 ? `, ${fail} failed` : ''}`, 'system');
      for (const r of results.filter((r) => !r.success)) {
        log(`Import failed: ${r.error}`, 'error');
      }
      refresh();
    } catch (err: any) {
      setImportProgress(null);
      log(`Import error: ${err.message}`, 'error');
    }
  };

  // ── Import via dialog ──
  const handleImport = async () => {
    if (!selectedFolder) return;
    const api = getFluxionAPI();
    if (api?.openFilesDialog) {
      // Build filters from registry so we can intercept model files for the settings dialog
      const importable = AssetTypeRegistry.getImportable();
      const allExts = importable.flatMap((d) => (d.extensions ?? []).map((e) => e.replace('.', '')));
      const filters = [
        { name: 'All Supported Assets', extensions: allExts },
        ...importable.map((d) => ({
          name: d.displayName,
          extensions: (d.extensions ?? []).map((e) => e.replace('.', '')),
        })),
        { name: 'All Files', extensions: ['*'] },
      ];
      const paths: string[] = (await api.openFilesDialog(filters)) ?? [];
      if (paths.length === 0) return;
      await runImportWithSettingsCheck(paths, selectedFolder);
    } else {
      // Fallback for non-Electron environments — no settings dialog
      try {
        const results = await assetImporter.importWithDialog(selectedFolder, {
          conflictStrategy: 'rename',
          onProgress: (p) => setImportProgress({ percent: p.percent, file: p.currentFile }),
        });
        setImportProgress(null);
        const ok = results.filter((r) => r.success).length;
        const fail = results.filter((r) => !r.success).length;
        if (ok > 0) log(`Imported ${ok} asset(s)${fail > 0 ? `, ${fail} failed` : ''}`, 'system');
        for (const r of results.filter((r) => !r.success)) log(`Import failed: ${r.error}`, 'error');
        refresh();
      } catch (err: any) {
        setImportProgress(null);
        log(`Import error: ${err.message}`, 'error');
      }
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

    const paths: string[] = [];
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      if ((file as any).path) paths.push((file as any).path);
    }
    if (paths.length === 0) return;
    await runImportWithSettingsCheck(paths, selectedFolder, ' via drag-and-drop');
  };

  const filteredEntries = (() => {
    const base = searchQuery.trim()
      ? entries.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : [...entries];
    const folders = base.filter(e => e.isDirectory);
    const files = base.filter(e => !e.isDirectory);
    const cmp = (a: DirEntry, b: DirEntry): number => {
      if (sortMode === 'name-desc') return b.name.localeCompare(a.name);
      if (sortMode === 'type') {
        const ta = getFileType(a.name), tb = getFileType(b.name);
        return ta !== tb ? ta.localeCompare(tb) : a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name); // name-asc default
    };
    return [...folders.sort(cmp), ...files.sort(cmp)];
  })();

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

      {/* Asset Grid + Search bar */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar: Search + Sort */}
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            style={{
              flex: 1,
              padding: '4px 8px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              fontSize: '11px',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            style={{
              padding: '4px 4px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              outline: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="type">Type</option>
          </select>
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          onContextMenu={handleBackgroundContextMenu}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={(e) => {
            // Clear selection when clicking empty grid background
            if (e.target === e.currentTarget) setSelectedPaths(new Set());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Delete') {
              e.preventDefault();
              if (selectedPaths.size > 1) {
                const toDelete = entries.filter(en => selectedPaths.has(en.path));
                setConfirmDialog({
                  message: `Delete ${toDelete.length} items? This cannot be undone.`,
                  onConfirm: async () => {
                    const fs = getFileSystem();
                    for (const en of toDelete) {
                      try {
                        await fs.delete(en.path);
                        if (!en.isDirectory) {
                          const mp = metaPath(en.path);
                          if (await fs.exists(mp)) await fs.delete(mp);
                        }
                      } catch {}
                    }
                    log(`Deleted ${toDelete.length} items`, 'system');
                    setSelectedPaths(new Set());
                    refresh();
                  },
                });
              } else {
                const sel = entries.find(en => selectedPaths.has(en.path));
                if (sel) deleteEntry(sel);
              }
            }
            if (e.key === 'F2') {
              e.preventDefault();
              const sel = entries.find(en => selectedPaths.has(en.path));
              if (sel) renameEntry(sel);
            }
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
          {filteredEntries.map((entry) => {
            const fileType = entry.isDirectory ? 'folder' : getFileType(entry.name);
            const isRenaming = renamingEntry === entry.path;
            const isOutdated = outdatedPaths.has(entry.path);
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
                onClick={(e) => {
                  if (entry.isDirectory) return;
                  if (e.ctrlKey || e.metaKey) {
                    setSelectedPaths(prev => {
                      const next = new Set(prev);
                      if (next.has(entry.path)) next.delete(entry.path);
                      else { next.add(entry.path); lastClickedRef.current = entry.path; }
                      return next;
                    });
                  } else if (e.shiftKey && lastClickedRef.current) {
                    const filePaths = filteredEntries.filter(en => !en.isDirectory).map(en => en.path);
                    const lastIdx = filePaths.indexOf(lastClickedRef.current);
                    const thisIdx = filePaths.indexOf(entry.path);
                    const [from, to] = lastIdx <= thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
                    setSelectedPaths(new Set(filePaths.slice(from, to + 1)));
                  } else {
                    setSelectedPaths(new Set([entry.path]));
                    lastClickedRef.current = entry.path;
                    dispatch({ type: 'SELECT_ASSET', asset: { path: entry.path, type: fileType } });
                  }
                }}
                onDoubleClick={() => handleDoubleClick(entry)}
                onContextMenu={(e) => handleItemContextMenu(e, entry)}
                style={{
                  display: 'flex',
                  position: 'relative',
                  border: selectedPaths.has(entry.path) ? '1px solid var(--accent)' : '1px solid transparent',
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
                {/* Outdated source badge */}
                {isOutdated && (
                  <span
                    title="Source file has changed — right-click to Reimport"
                    style={{
                      position: 'absolute',
                      top: 3,
                      right: 3,
                      fontSize: '11px',
                      lineHeight: 1,
                      color: '#f0a832',
                      pointerEvents: 'none',
                    }}
                  >⚠</span>
                )}
                {fileType === 'texture' ? (
                  <TextureThumbnail
                    path={entry.path}
                    fallback={<span style={{ fontSize: '28px' }}>{getTypeIcon(fileType)}</span>}
                  />
                ) : fileType === 'material' || fileType === 'visual_material' ? (
                  <MaterialThumbnail
                    path={entry.path}
                    fallback={<span style={{ fontSize: '28px' }}>{getTypeIcon(fileType)}</span>}
                  />
                ) : (
                  <span style={{ fontSize: '28px' }}>{getTypeIcon(fileType)}</span>
                )}
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

      {/* Model Import Settings Dialog */}
      {pendingModelImport && (
        <ModelImportSettingsDialog
          fileCount={pendingModelImport.fileCount}
          onConfirm={(s) => {
            setPendingModelImport(null);
            modelImportResolveRef.current?.(s);
          }}
          onCancel={() => {
            setPendingModelImport(null);
            modelImportResolveRef.current?.(null);
          }}
        />
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
