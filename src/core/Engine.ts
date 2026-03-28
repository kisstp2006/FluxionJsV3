// ============================================================
// FluxionJS V2 — Main Engine Class
// Orchestrates all subsystems — inspired by Nuake + s&box
// ============================================================

import { ECSManager } from './ECS';
import { EventSystem, EngineEvents } from './EventSystem';
import { Time } from './Time';
import { ComponentRegistry } from './ComponentRegistry';
import type { WorkerPool } from './WorkerPool';
import type { PhysicsWorkerHost } from '../physics/PhysicsWorkerHost';

export interface EngineConfig {
  canvas?: HTMLCanvasElement;
  targetContainer?: HTMLElement;
  width?: number;
  height?: number;
  antialias?: boolean;
  physicsEnabled?: boolean;
  fixedTimestep?: number;
  maxFps?: number;
}

/** Optional threading configuration — all options default to false/disabled. */
export interface ThreadingConfig {
  /** Run Rapier physics in a dedicated worker (requires SharedArrayBuffer / COOP+COEP headers). */
  physics?: boolean;
  /** Decode images and audio in a WorkerPool (frees main thread during asset loading). */
  assets?: boolean;
  /** Number of asset worker threads (default: max(1, hardwareConcurrency - 1)). */
  workers?: number;
}

/** Live threading state — populated by Engine.enableThreading(). */
export interface ThreadingState {
  physicsWorker: PhysicsWorkerHost | null;
  assetPool:     WorkerPool | null;
}

export class Engine {
  readonly ecs: ECSManager;
  readonly events: EventSystem;
  readonly time: Time;
  readonly config: Required<EngineConfig>;

  /** Threading subsystems — null until enableThreading() is called. */
  readonly threading: ThreadingState = { physicsWorker: null, assetPool: null };

  private running = false;
  private rafId = 0;
  private subsystems: Map<string, any> = new Map();
  private _simulationPaused = true;

  constructor(config: EngineConfig = {}) {
    this.config = {
      canvas: config.canvas ?? document.createElement('canvas'),
      targetContainer: config.targetContainer ?? document.body,
      width: config.width ?? 1280,
      height: config.height ?? 720,
      antialias: config.antialias ?? true,
      physicsEnabled: config.physicsEnabled ?? true,
      fixedTimestep: config.fixedTimestep ?? 1 / 60,
      maxFps: config.maxFps ?? 0,
    };

    this.ecs = new ECSManager();
    this.events = new EventSystem();
    this.time = new Time();
    this.time.fixedDeltaTime = this.config.fixedTimestep;
  }

  /** Register a named subsystem (renderer, physics, audio, etc.) */
  registerSubsystem<T>(name: string, subsystem: T): T {
    this.subsystems.set(name, subsystem);
    return subsystem;
  }

  /** Get a registered subsystem */
  getSubsystem<T>(name: string): T | undefined {
    return this.subsystems.get(name) as T | undefined;
  }

  /** Initialize and start the engine loop */
  async start(): Promise<void> {
    if (this.running) return;

    // Lock the component registry — no new components can be registered after this point
    ComponentRegistry.freeze();

    this.events.emit(EngineEvents.INIT);

    // Append canvas if needed
    if (!this.config.canvas.parentElement && this.config.targetContainer) {
      this.config.targetContainer.appendChild(this.config.canvas);
    }

    this.time.reset();
    this.running = true;

    this.events.emit(EngineEvents.START);

    this.loop();
  }

  /**
   * Opt-in threading initialisation — safe to call before or after start().
   * Gracefully skips unsupported features (e.g. SharedArrayBuffer not available).
   */
  async enableThreading(config: ThreadingConfig = {}): Promise<void> {
    // ── Physics worker ────────────────────────────────────────
    if (config.physics) {
      const { SharedTransformBuffer } = await import('./SharedTransformBuffer');
      if (SharedTransformBuffer.isSupported()) {
        const { PhysicsWorkerHost } = await import('../physics/PhysicsWorkerHost');
        const workerUrl = new URL('../physics/physics.worker.ts', import.meta.url);
        const host = new PhysicsWorkerHost(workerUrl);
        (this.threading as any).physicsWorker = host;
        console.info('[Engine] Physics worker enabled.');
      } else {
        console.warn('[Engine] Physics worker requested but SharedArrayBuffer is unavailable (missing COOP/COEP headers). Falling back to main-thread physics.');
      }
    }

    // ── Asset worker pool ─────────────────────────────────────
    if (config.assets) {
      const { WorkerPool } = await import('./WorkerPool');
      const workerUrl = new URL('../assets/AssetWorker.ts', import.meta.url);
      const poolSize  = config.workers ?? Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1);
      (this.threading as any).assetPool = new WorkerPool(workerUrl, poolSize);
      console.info(`[Engine] Asset worker pool enabled (${poolSize} workers).`);
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    // Dispose all subsystems that support it
    for (const sub of this.subsystems.values()) {
      if (typeof sub?.dispose === 'function') {
        sub.dispose();
      }
    }
    // Terminate threading workers
    this.threading.physicsWorker?.terminate();
    this.threading.assetPool?.terminate();
    this.events.emit(EngineEvents.DESTROY);
  }

  private loop = (): void => {
    if (!this.running) return;

    const fixedSteps = this.time.tick();

    if (!this._simulationPaused) {
      // Fixed update (physics, etc.) — only when simulation is running
      for (let i = 0; i < fixedSteps; i++) {
        this.events.emit(EngineEvents.FIXED_UPDATE, this.time.fixedDeltaTime);
        this.ecs.fixedUpdate(this.time.fixedDeltaTime);
      }
    }

    // Variable update — always runs so rendering systems (MeshRenderer, TransformSync, Light) work in editor
    this.events.emit(EngineEvents.UPDATE, this.time.deltaTime);
    this.ecs.update(this.time.deltaTime);

    if (!this._simulationPaused) {
      // Late update (camera follow, etc.) — only when simulation is running
      this.events.emit(EngineEvents.LATE_UPDATE, this.time.deltaTime);
    }

    // Render
    this.events.emit(EngineEvents.RENDER, this.time.fixedAlpha);

    this.rafId = requestAnimationFrame(this.loop);
  };

  /** Pause/resume simulation (physics + ECS updates). Rendering continues. */
  get simulationPaused(): boolean { return this._simulationPaused; }
  set simulationPaused(v: boolean) { this._simulationPaused = v; }

  /** Resize the engine viewport */
  resize(width: number, height: number): void {
    this.config.canvas.width = width;
    this.config.canvas.height = height;
    this.events.emit(EngineEvents.RESIZE, { width, height });
  }
}
