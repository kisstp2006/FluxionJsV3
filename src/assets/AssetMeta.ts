// ============================================================
// FluxionJS V3 — Asset Metadata (.fluxmeta)
// Stride .sdmeta / ezEngine .ezAsset inspired — every imported
// asset gets a sidecar JSON file storing import provenance,
// content hash, and per-type settings.
// ============================================================

import type { IFileSystem } from '../filesystem/FileSystem';
import { pathExtension } from '../filesystem/FileSystem';

// ── Types ──

export interface AssetMeta {
  /** Schema version for forward compatibility */
  schema: 1;
  /** UUID v4 assigned at import time — stable reference across renames */
  guid: string;
  /** Asset type id from AssetTypeRegistry (e.g. 'texture', 'model') */
  type: string;
  /** Original source path the file was imported from */
  sourcePath: string;
  /** SHA-256 hex hash of the source file at import time */
  sourceHash: string;
  /** SHA-256 hex hash of the imported file (= project copy) */
  importedHash: string;
  /** File size in bytes */
  fileSize: number;
  /** ISO-8601 timestamp of first import */
  importedAt: string;
  /** ISO-8601 timestamp of last reimport */
  updatedAt: string;
  /** Per-type import settings (e.g. texture compression, model scale) */
  importSettings: Record<string, unknown>;
  /** User-editable tags for organizing/searching */
  tags: string[];
}

// ── Helpers ──

/** The `.fluxmeta` path for a given asset path */
export function metaPathFor(assetPath: string): string {
  return assetPath + '.fluxmeta';
}

/** Generate a v4 UUID (crypto.randomUUID when available, fallback) */
export function generateGuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback — Math.random-based v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Create a default AssetMeta object */
export function createAssetMeta(
  type: string,
  sourcePath: string,
  sourceHash: string,
  importedHash: string,
  fileSize: number,
  importSettings?: Record<string, unknown>,
): AssetMeta {
  const now = new Date().toISOString();
  return {
    schema: 1,
    guid: generateGuid(),
    type,
    sourcePath,
    sourceHash,
    importedHash,
    fileSize,
    importedAt: now,
    updatedAt: now,
    importSettings: importSettings ?? {},
    tags: [],
  };
}

// ── Read / Write ──

export async function readAssetMeta(fs: IFileSystem, assetPath: string): Promise<AssetMeta | null> {
  const mp = metaPathFor(assetPath);
  if (!(await fs.exists(mp))) return null;
  try {
    const json = await fs.readFile(mp);
    return JSON.parse(json) as AssetMeta;
  } catch {
    return null;
  }
}

export async function writeAssetMeta(fs: IFileSystem, assetPath: string, meta: AssetMeta): Promise<void> {
  const mp = metaPathFor(assetPath);
  await fs.writeFile(mp, JSON.stringify(meta, null, 2));
}
