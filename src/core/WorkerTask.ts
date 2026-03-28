// ============================================================
// FluxionJS V3 — Worker Task Protocol
// Shared task type IDs and request/response shapes used by
// WorkerPool and all registered worker handlers.
// ============================================================

/** Unique string ID for a registered worker task. */
export type TaskId = string;

/** A task submitted to the WorkerPool. */
export interface WorkerTask<TInput = unknown, TOutput = unknown> {
  /** Matches a handler registered inside the worker bundle. */
  readonly fn: TaskId;
  readonly data: TInput;
  /** Transferables moved (zero-copy) into the worker. */
  readonly transfer?: Transferable[];
  /** Internal — set by WorkerPool before dispatch. */
  readonly _id?: number;
}

/** Envelope sent from main thread → worker. */
export interface WorkerRequest {
  _id: number;
  fn: TaskId;
  data: unknown;
}

/** Envelope sent from worker → main thread. */
export interface WorkerResponse {
  _id: number;
  ok: true;
  result: unknown;
}

/** Envelope sent from worker → main thread on error. */
export interface WorkerError {
  _id: number;
  ok: false;
  error: string;
}

// ── Built-in task IDs (asset decoding) ──────────────────────
export const TASK_DECODE_IMAGE = 'decode-image';
export const TASK_DECODE_AUDIO = 'decode-audio';
export const TASK_PARSE_JSON   = 'parse-json';
