// ============================================================
// FluxionJS V3 — Asset Hot-Reload Service
// Bridges FileWatcherService → unified custom events so the
// editor + engine can react to external file changes.
// ============================================================

import { FileWatcherService, type WatchListener } from './FileWatcherService';
import { AssetTypeRegistry } from '../../src/assets/AssetTypeRegistry';
import { normalizePath } from '../../src/filesystem/FileSystem';

export interface AssetChangedDetail {
  path: string;
  assetType: string;
  eventType: 'create' | 'change' | 'delete';
}

// Segments that indicate a file should be ignored
const IGNORED_SEGMENTS = ['node_modules', '.git', '.fluxmeta'];

function shouldIgnore(path: string): boolean {
  const norm = normalizePath(path);
  return IGNORED_SEGMENTS.some(seg =>
    seg.startsWith('.') ? norm.endsWith(seg) || norm.includes(seg + '/') || norm.includes('/' + seg)
      : norm.includes('/' + seg + '/'),
  );
}

// Grace period (ms) after start() during which watcher events are ignored.
// Prevents phantom events that some OS file watchers emit on initial scan.
const WARMUP_MS = 1500;

class AssetHotReloadServiceImpl {
  private watcher = new FileWatcherService(300);
  private unsub: (() => void) | null = null;
  private ready = false;
  private warmupTimer: ReturnType<typeof setTimeout> | null = null;

  async start(projectRoot: string): Promise<void> {
    await this.stop();
    this.ready = false;

    const listener: WatchListener = (event) => {
      if (!this.ready) return; // ignore events during warmup
      const path = normalizePath(event.path);
      if (shouldIgnore(path)) return;

      // Always dispatch fs-changed for Asset Browser (create/delete/rename affect file listings)
      if (event.type === 'create' || event.type === 'delete') {
        window.dispatchEvent(
          new CustomEvent('fluxion:fs-changed', { detail: { path, eventType: event.type } }),
        );
      }

      // Classify by asset type and dispatch typed event
      const typeDef = AssetTypeRegistry.resolveFile(path);
      if (!typeDef) return; // unknown file type — ignore

      window.dispatchEvent(
        new CustomEvent<AssetChangedDetail>('fluxion:asset-changed', {
          detail: { path, assetType: typeDef.type, eventType: event.type },
        }),
      );
    };

    this.unsub = this.watcher.on(listener);
    await this.watcher.start(projectRoot);

    // Start grace period — ignore early events from initial fs scan
    this.warmupTimer = setTimeout(() => {
      this.ready = true;
      this.warmupTimer = null;
    }, WARMUP_MS);
  }

  async stop(): Promise<void> {
    if (this.warmupTimer) {
      clearTimeout(this.warmupTimer);
      this.warmupTimer = null;
    }
    this.ready = false;
    this.unsub?.();
    this.unsub = null;
    await this.watcher.stop();
  }
}

export const AssetHotReloadService = new AssetHotReloadServiceImpl();
