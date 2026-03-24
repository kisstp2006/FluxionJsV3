// ============================================================
// FluxionJS V3 — Asset Importer
// Stride/ezEngine-inspired import pipeline.
//
// Workflow:
//   1. User selects external files (dialog or drag-and-drop)
//   2. AssetImporter.importFiles() copies each file into the
//      target project directory
//   3. A .fluxmeta sidecar JSON is written beside each file
//   4. Optional per-type post-processor runs (e.g. generate
//      thumbnail, validate model, extract audio metadata)
//   5. Progress + results are reported via callback
//
// Design goals:
//   - Streaming copy via IFileSystem (no double-buffering)
//   - Hash validation (SHA-256 in Electron main process)
//   - Name-collision handling (auto-rename with _1, _2, …)
//   - Batch import with concurrency control
//   - Fully extensible via AssetTypeRegistry importProcessor
// ============================================================

import type { IFileSystem } from '../filesystem/FileSystem';
import { getFileSystem, pathJoin, pathBasename, pathExtension, normalizePath } from '../filesystem';
import { AssetTypeRegistry, type AssetTypeDefinition } from './AssetTypeRegistry';
import { createAssetMeta, writeAssetMeta, readAssetMeta, metaPathFor, type AssetMeta } from './AssetMeta';

// ── Types ──

export interface ImportRequest {
  /** Absolute path of the source file (outside project) */
  sourcePath: string;
  /** Target directory inside the project to copy into */
  targetDir: string;
  /** Optional override for the destination filename */
  targetName?: string;
  /** Per-type import settings (forwarded to .fluxmeta) */
  importSettings?: Record<string, unknown>;
}

export interface ImportResult {
  /** Whether the import succeeded */
  success: boolean;
  /** The import request that produced this result */
  request: ImportRequest;
  /** Absolute path of the imported file in the project (on success) */
  importedPath?: string;
  /** The generated/updated .fluxmeta (on success) */
  meta?: AssetMeta;
  /** Error message (on failure) */
  error?: string;
}

export interface ImportProgress {
  /** Index of the file currently being imported (0-based) */
  current: number;
  /** Total number of files to import */
  total: number;
  /** Name of the file currently being imported */
  currentFile: string;
  /** Overall progress percentage (0-100) */
  percent: number;
  /** Current phase for the current file */
  phase: 'copying' | 'hashing' | 'meta' | 'processing' | 'done';
}

export type ImportProgressCallback = (progress: ImportProgress) => void;

export interface ImportOptions {
  /** Max concurrent imports (default: 4) */
  concurrency?: number;
  /** Strategy for name collisions */
  conflictStrategy?: 'rename' | 'overwrite' | 'skip';
  /** Progress callback */
  onProgress?: ImportProgressCallback;
}

// ── Collision resolver ──

async function resolveConflict(
  fs: IFileSystem,
  targetDir: string,
  baseName: string,
  extension: string,
  strategy: 'rename' | 'overwrite' | 'skip',
): Promise<{ finalPath: string; action: 'copy' | 'skip' }> {
  const candidate = pathJoin(targetDir, baseName + extension);

  if (!(await fs.exists(candidate))) {
    return { finalPath: candidate, action: 'copy' };
  }

  switch (strategy) {
    case 'overwrite':
      return { finalPath: candidate, action: 'copy' };
    case 'skip':
      return { finalPath: candidate, action: 'skip' };
    case 'rename':
    default: {
      let counter = 1;
      let newPath: string;
      do {
        newPath = pathJoin(targetDir, `${baseName}_${counter}${extension}`);
        counter++;
      } while (await fs.exists(newPath));
      return { finalPath: newPath, action: 'copy' };
    }
  }
}

// ── SHA-256 via IPC ──

async function hashFile(sourcePath: string): Promise<string> {
  const api = (window as any).fluxionAPI;
  if (api?.hashFile) {
    return api.hashFile(sourcePath) as Promise<string>;
  }
  // Fallback: read binary + Web Crypto
  const fs = getFileSystem();
  const buf = await fs.readBinary(sourcePath);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const arr = new Uint8Array(hashBuf);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Import a single file ──

async function importSingleFile(
  fs: IFileSystem,
  req: ImportRequest,
  conflictStrategy: 'rename' | 'overwrite' | 'skip',
  reportPhase: (phase: ImportProgress['phase']) => void,
): Promise<ImportResult> {
  try {
    // Resolve type
    const ext = pathExtension(req.sourcePath);
    const typeDef = AssetTypeRegistry.getByExtension(ext);
    const assetType = typeDef?.type ?? 'unknown';

    // Figure out destination name
    const fileName = req.targetName ?? pathBasename(req.sourcePath);
    const nameNoExt = fileName.endsWith(ext)
      ? fileName.substring(0, fileName.length - ext.length)
      : fileName;

    // Ensure target dir exists
    if (!(await fs.exists(req.targetDir))) {
      await fs.mkdir(req.targetDir);
    }

    // Resolve name collision
    const { finalPath, action } = await resolveConflict(
      fs, req.targetDir, nameNoExt, ext, conflictStrategy,
    );

    if (action === 'skip') {
      return {
        success: true,
        request: req,
        importedPath: finalPath,
        meta: (await readAssetMeta(fs, finalPath)) ?? undefined,
      };
    }

    // Hash source
    reportPhase('hashing');
    const sourceHash = await hashFile(req.sourcePath);

    // Copy file
    reportPhase('copying');
    await fs.copy(req.sourcePath, finalPath);

    // Hash imported copy (should match source)
    const importedHash = await hashFile(finalPath);

    // Get file size
    const info = await fs.stat(finalPath);

    // Write .fluxmeta
    reportPhase('meta');
    const meta = createAssetMeta(
      assetType,
      normalizePath(req.sourcePath),
      sourceHash,
      importedHash,
      info.size,
      req.importSettings,
    );
    await writeAssetMeta(fs, finalPath, meta);

    // Run per-type post-processor if registered
    reportPhase('processing');
    if (typeDef?.importProcessor) {
      await typeDef.importProcessor(fs, finalPath, meta);
    }

    reportPhase('done');
    return { success: true, request: req, importedPath: finalPath, meta };

  } catch (err: any) {
    return { success: false, request: req, error: err?.message ?? String(err) };
  }
}

// ── Batch import with concurrency ──

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      await fn(items[idx], idx);
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(workers);
}

// ── Public API ──

export class AssetImporter {
  /**
   * Import one or more files into the project.
   * Returns a result for each request.
   */
  async importFiles(
    requests: ImportRequest[],
    options?: ImportOptions,
  ): Promise<ImportResult[]> {
    const fs = getFileSystem();
    const concurrency = options?.concurrency ?? 4;
    const strategy = options?.conflictStrategy ?? 'rename';
    const results: ImportResult[] = new Array(requests.length);

    await runWithConcurrency(requests, concurrency, async (req, idx) => {
      options?.onProgress?.({
        current: idx,
        total: requests.length,
        currentFile: pathBasename(req.sourcePath),
        percent: Math.round((idx / requests.length) * 100),
        phase: 'copying',
      });

      results[idx] = await importSingleFile(fs, req, strategy, (phase) => {
        options?.onProgress?.({
          current: idx,
          total: requests.length,
          currentFile: pathBasename(req.sourcePath),
          percent: Math.round(((idx + (phase === 'done' ? 1 : 0.5)) / requests.length) * 100),
          phase,
        });
      });
    });

    // Final 100%
    options?.onProgress?.({
      current: requests.length,
      total: requests.length,
      currentFile: '',
      percent: 100,
      phase: 'done',
    });

    return results;
  }

  /**
   * Re-import an asset: re-reads from the original source path
   * stored in .fluxmeta and updates the project copy + meta.
   */
  async reimport(assetPath: string): Promise<ImportResult> {
    const fs = getFileSystem();
    const meta = await readAssetMeta(fs, assetPath);
    if (!meta) {
      return { success: false, request: { sourcePath: '', targetDir: '' }, error: 'No .fluxmeta found' };
    }

    // Check if source still exists
    if (!(await fs.exists(meta.sourcePath))) {
      return { success: false, request: { sourcePath: meta.sourcePath, targetDir: '' }, error: `Source file no longer exists: ${meta.sourcePath}` };
    }

    const dir = normalizePath(assetPath.substring(0, assetPath.lastIndexOf('/')));
    const result = await this.importFiles([{
      sourcePath: meta.sourcePath,
      targetDir: dir,
      targetName: pathBasename(assetPath),
      importSettings: meta.importSettings,
    }], { conflictStrategy: 'overwrite' });

    const r = result[0];
    // Preserve original GUID and importedAt
    if (r.success && r.meta) {
      r.meta.guid = meta.guid;
      r.meta.importedAt = meta.importedAt;
      r.meta.tags = meta.tags;
      await writeAssetMeta(fs, assetPath, r.meta);
    }
    return r;
  }

  /**
   * Check if an asset's project copy is out of date compared to source.
   * Returns null if .fluxmeta is missing or source is inaccessible.
   */
  async checkOutdated(assetPath: string): Promise<boolean | null> {
    const fs = getFileSystem();
    const meta = await readAssetMeta(fs, assetPath);
    if (!meta) return null;

    if (!(await fs.exists(meta.sourcePath))) return null;

    const currentHash = await hashFile(meta.sourcePath);
    return currentHash !== meta.sourceHash;
  }

  /**
   * Opens a multi-file dialog filtered by all importable types,
   * then imports the selected files into targetDir.
   */
  async importWithDialog(
    targetDir: string,
    options?: ImportOptions,
  ): Promise<ImportResult[]> {
    const api = (window as any).fluxionAPI;
    if (!api?.openFilesDialog) {
      // Fallback to single-file dialog
      const fs = getFileSystem();
      const path = await fs.openFileDialog(this.buildImportFilters());
      if (!path) return [];
      return this.importFiles([{ sourcePath: path, targetDir }], options);
    }

    // Multi-file dialog
    const filters = this.buildImportFilters();
    const paths: string[] | null = await api.openFilesDialog(filters);
    if (!paths || paths.length === 0) return [];

    const requests: ImportRequest[] = paths.map((p: string) => ({
      sourcePath: p,
      targetDir,
    }));
    return this.importFiles(requests, options);
  }

  /** Build Electron file dialog filters from all importable registry types */
  private buildImportFilters(): { name: string; extensions: string[] }[] {
    const allExts: string[] = [];
    const perType: { name: string; extensions: string[] }[] = [];

    for (const def of AssetTypeRegistry.getImportable()) {
      if (def.importFilters) {
        perType.push(...def.importFilters);
        for (const f of def.importFilters) {
          allExts.push(...f.extensions);
        }
      }
    }

    return [
      { name: 'All Supported', extensions: [...new Set(allExts)] },
      ...perType,
      { name: 'All Files', extensions: ['*'] },
    ];
  }
}

/** Singleton */
export const assetImporter = new AssetImporter();
