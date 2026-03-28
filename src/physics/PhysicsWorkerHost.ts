// ============================================================
// FluxionJS V3 — Physics Worker Host
// Main-thread proxy for the off-thread Rapier physics worker.
// Wraps postMessage in a typed async API.
// ============================================================

import type { EntityId } from '../core/ECS';
import type {
  PhysicsWorkerRequest,
  PhysicsWorkerResponse,
  SerializedBodyDesc,
  CollisionEventData,
} from './PhysicsWorkerProtocol';

export interface PhysicsStepResult {
  dynamicSlots: Int32Array;
  enterEvents:  CollisionEventData[];
  exitEvents:   CollisionEventData[];
}

export class PhysicsWorkerHost {
  private worker: Worker;
  private _ready = false;
  private _readyPromise: Promise<void>;

  constructor(workerUrl: URL) {
    this.worker = new Worker(workerUrl, { type: 'module' });
    this._readyPromise = new Promise<void>((resolve) => {
      const onMsg = (e: MessageEvent<PhysicsWorkerResponse>) => {
        if (e.data.type === 'ready') {
          this._ready = true;
          this.worker.removeEventListener('message', onMsg);
          resolve();
        }
      };
      this.worker.addEventListener('message', onMsg);
    });
  }

  /** Send init message with the shared buffer and gravity. Resolves when worker is ready. */
  async init(buffer: SharedArrayBuffer, gravity: [number, number, number]): Promise<void> {
    const req: PhysicsWorkerRequest = { type: 'init', buffer, gravity };
    // Transfer the buffer reference — worker reads/writes the same memory
    this.worker.postMessage(req, []);
    await this._readyPromise;
  }

  /**
   * Run one physics step off-thread.
   * @param dt              Fixed delta time in seconds
   * @param kinematicSlots  Slots whose transforms are driven by main thread (written to buffer before call)
   * @returns               Promise resolving after worker writes dynamic body results to buffer
   */
  step(dt: number, kinematicSlots: Int32Array): Promise<PhysicsStepResult> {
    return new Promise<PhysicsStepResult>((resolve) => {
      const onMsg = (e: MessageEvent<PhysicsWorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'step-done') {
          this.worker.removeEventListener('message', onMsg);
          resolve({ dynamicSlots: msg.dynamicSlots, enterEvents: [], exitEvents: [] });
        } else if (msg.type === 'events') {
          // events message arrives before step-done — accumulate
          // (simplified: merge in step-done handler; for now no-op)
        }
      };
      this.worker.addEventListener('message', onMsg);
      const req: PhysicsWorkerRequest = { type: 'step', dt, kinematicSlots };
      this.worker.postMessage(req, [kinematicSlots.buffer]);
    });
  }

  addBody(entity: EntityId, desc: SerializedBodyDesc): void {
    const req: PhysicsWorkerRequest = { type: 'add-body', entity, desc };
    this.worker.postMessage(req);
  }

  removeBody(entity: EntityId): void {
    const req: PhysicsWorkerRequest = { type: 'remove-body', entity };
    this.worker.postMessage(req);
  }

  setGravity(x: number, y: number, z: number): void {
    const req: PhysicsWorkerRequest = { type: 'set-gravity', gravity: [x, y, z] };
    this.worker.postMessage(req);
  }

  get isReady(): boolean { return this._ready; }

  terminate(): void {
    this.worker.terminate();
    this._ready = false;
  }
}
