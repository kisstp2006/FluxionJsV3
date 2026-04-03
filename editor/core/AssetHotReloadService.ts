// ============================================================
// FluxionJS V3 — Asset Hot-Reload Service
// Bridges FileWatcherService → unified custom events so the
// editor + engine can react to external file changes.
// ============================================================

import { FileWatcherService, type WatchListener } from './FileWatcherService';
import { AssetTypeRegistry } from '../../src/assets/AssetTypeRegistry';
import { normalizePath } from '../../src/filesystem/FileSystem';
import type { Engine } from '../../src/core/Engine';

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
  private engine: Engine | null = null;

  async start(projectRoot: string, engine?: Engine): Promise<void> {
    await this.stop();
    this.ready = false;
    this.engine = engine ?? null;

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

      // Bridge to engine.events so HotReloadSystem (and game-side code) can subscribe
      if (this.engine) {
        this.engine.events.emit('asset:changed', { path, assetType: typeDef.type, eventType: event.type });
        if (event.type === 'change') {
          const evtMap: Record<string, string> = {
            material: 'asset:material-reload', visual_material: 'asset:material-reload',
            texture: 'asset:texture-reload', script: 'asset:script-reload',
            model: 'asset:model-reload', mesh: 'asset:model-reload',
          };
          const evt = evtMap[typeDef.type];
          if (evt) this.engine.events.emit(evt, { path });
        }
      }
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
    this.engine = null;
    if (this.warmupTimer) {
      clearTimeout(this.warmupTimer);
      this.warmupTimer = null;
    }
    this.ready = false;
    this.unsub?.();
    this.unsub = null;
    await this.watcher.stop();
  }

  /** Attach an engine instance post-start so events are bridged to engine.events. */
  setEngine(engine: Engine | null): void {
    this.engine = engine;
  }
}

export const AssetHotReloadService = new AssetHotReloadServiceImpl();
