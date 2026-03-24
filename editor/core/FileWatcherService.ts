// ============================================================
// FluxionJS V3 — File Watcher Service
// Watches the project directory via IFileSystem.watch()
// and dispatches debounced events for the editor to react to.
// ============================================================

import { type FileWatchEvent, type FileWatchCallback, getFileSystem } from '../../src/filesystem';

export type WatchListener = (event: FileWatchEvent) => void;

export class FileWatcherService {
  private watchId: string | null = null;
  private listeners = new Set<WatchListener>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEvents: FileWatchEvent[] = [];
  private debounceMs: number;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  /** Start watching a directory (typically the project root). */
  async start(dirPath: string): Promise<void> {
    await this.stop();
    const fs = getFileSystem();
    const callback: FileWatchCallback = (event) => {
      this.pendingEvents.push(event);
      this.scheduleFlush();
    };
    this.watchId = await fs.watch(dirPath, callback);
  }

  /** Stop watching. */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watchId) {
      const fs = getFileSystem();
      await fs.unwatch(this.watchId);
      this.watchId = null;
    }
    this.pendingEvents = [];
  }

  /** Subscribe to debounced watch events */
  on(listener: WatchListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }

  private flush(): void {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    this.debounceTimer = null;

    // De-duplicate: keep the latest event per path
    const deduped = new Map<string, FileWatchEvent>();
    for (const e of events) {
      deduped.set(e.path, e);
    }

    for (const event of deduped.values()) {
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }
}
