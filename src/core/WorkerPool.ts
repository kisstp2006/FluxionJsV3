// ============================================================
// FluxionJS V3 — Generic Worker Pool
// Pre-spawns N workers, distributes tasks round-robin,
// supports Transferable for zero-copy data exchange.
// ============================================================

import type { WorkerTask, WorkerRequest, WorkerResponse, WorkerError } from './WorkerTask';

interface PendingTask {
  resolve: (value: unknown) => void;
  reject:  (reason: string) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private pending: Map<number, PendingTask> = new Map();
  private nextId    = 1;
  private nextWorker = 0;

  /**
   * @param workerUrl  URL of the compiled worker bundle (use `new URL('./foo.worker.ts', import.meta.url)`)
   * @param poolSize   Number of workers to pre-spawn (default: max(1, hardwareConcurrency - 1))
   */
  constructor(workerUrl: URL, poolSize = Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1)) {
    for (let i = 0; i < poolSize; i++) {
      const w = new Worker(workerUrl, { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse | WorkerError>) => this._onMessage(e.data);
      w.onerror   = (e: ErrorEvent) => this._onError(e);
      this.workers.push(w);
    }
  }

  /**
   * Dispatch a task to an idle worker and return a promise for the result.
   * Transferables in `task.transfer` are moved into the worker (zero-copy).
   */
  execute<TInput, TOutput>(task: WorkerTask<TInput, TOutput>): Promise<TOutput> {
    return new Promise<TOutput>((resolve, reject) => {
      const id  = this.nextId++;
      const req: WorkerRequest = { _id: id, fn: task.fn, data: task.data };
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });

      // Round-robin worker selection
      const worker = this.workers[this.nextWorker % this.workers.length];
      this.nextWorker++;
      worker.postMessage(req, task.transfer ?? []);
    });
  }

  /** Terminate all workers immediately. Pending tasks will never resolve. */
  terminate(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.pending.clear();
  }

  get workerCount(): number { return this.workers.length; }

  private _onMessage(msg: WorkerResponse | WorkerError): void {
    const entry = this.pending.get(msg._id);
    if (!entry) return;
    this.pending.delete(msg._id);
    if (msg.ok) {
      entry.resolve(msg.result);
    } else {
      entry.reject((msg as WorkerError).error);
    }
  }

  private _onError(e: ErrorEvent): void {
    // Surface worker errors — we don't know which task caused it,
    // so log and leave pending tasks to time out naturally.
    console.error('[WorkerPool] Worker error:', e.message);
  }
}
