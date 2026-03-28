// ============================================================
// FluxionJS V3 — Asset Worker
// Off-thread asset decoding tasks.
// Runs inside a WorkerPool worker.
// ============================================================

import type { WorkerRequest, WorkerResponse, WorkerError } from '../core/WorkerTask';
import { TASK_DECODE_IMAGE, TASK_DECODE_AUDIO, TASK_PARSE_JSON } from '../core/WorkerTask';

type TaskHandler = (data: unknown) => unknown | Promise<unknown>;
const handlers = new Map<string, TaskHandler>();

function registerTask(id: string, fn: TaskHandler): void {
  handlers.set(id, fn);
}

// ── Decode image → ImageBitmap (transferable, zero-copy to main thread) ──────
registerTask(TASK_DECODE_IMAGE, async (url: unknown): Promise<ImageBitmap> => {
  const resp = await fetch(url as string);
  const blob = await resp.blob();
  return createImageBitmap(blob);
});

// ── Decode audio → ArrayBuffer ────────────────────────────────────────────────
registerTask(TASK_DECODE_AUDIO, async (url: unknown): Promise<ArrayBuffer> => {
  const resp = await fetch(url as string);
  return resp.arrayBuffer();
});

// ── Parse JSON ────────────────────────────────────────────────────────────────
registerTask(TASK_PARSE_JSON, (text: unknown): unknown => JSON.parse(text as string));

// ── Worker message loop ───────────────────────────────────────────────────────
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { _id, fn, data } = e.data;
  const handler = handlers.get(fn);
  if (!handler) {
    const err: WorkerError = { _id, ok: false, error: `Unknown task: ${fn}` };
    self.postMessage(err);
    return;
  }
  try {
    const result = await handler(data);
    // ImageBitmap is transferable — move it without copy
    const transfer: Transferable[] = result instanceof ImageBitmap ? [result]
      : result instanceof ArrayBuffer                              ? [result]
      : [];
    const resp: WorkerResponse = { _id, ok: true, result };
    (self as any).postMessage(resp, transfer);
  } catch (err) {
    const errResp: WorkerError = { _id, ok: false, error: String(err) };
    (self as any).postMessage(errResp);
  }
};
