// ============================================================
// FluxionJS V2 — Time Management
// Fixed timestep + variable rendering (like Nuake/LumixEngine)
// ============================================================

export class Time {
  /** Seconds since last frame */
  deltaTime = 0;
  /** Unscaled delta time */
  unscaledDeltaTime = 0;
  /** Fixed physics timestep (default 60Hz) */
  fixedDeltaTime = 1 / 60;
  /** Time scale for slow-mo / fast-forward */
  timeScale = 1;
  /** Total elapsed time in seconds */
  elapsed = 0;
  /** Unscaled total elapsed time */
  unscaledElapsed = 0;
  /** Current frame number */
  frameCount = 0;
  /** Frames per second */
  fps = 0;
  /** Smoothed FPS */
  smoothFps = 0;

  private lastTimestamp = 0;
  private fixedAccumulator = 0;
  private fpsAccumulator = 0;
  private fpsSamples = 0;
  private fpsUpdateInterval = 0.5;

  reset(): void {
    this.lastTimestamp = performance.now();
    this.elapsed = 0;
    this.unscaledElapsed = 0;
    this.frameCount = 0;
    this.fixedAccumulator = 0;
  }

  /**
   * Call each frame. Returns the number of fixed update steps needed.
   */
  tick(): number {
    const now = performance.now();
    const rawDt = Math.min((now - this.lastTimestamp) / 1000, 0.25); // cap at 250ms
    this.lastTimestamp = now;

    this.unscaledDeltaTime = rawDt;
    this.deltaTime = rawDt * this.timeScale;
    this.elapsed += this.deltaTime;
    this.unscaledElapsed += rawDt;
    this.frameCount++;

    // FPS calculation
    this.fpsAccumulator += rawDt;
    this.fpsSamples++;
    if (this.fpsAccumulator >= this.fpsUpdateInterval) {
      this.fps = Math.round(this.fpsSamples / this.fpsAccumulator);
      this.smoothFps = this.smoothFps === 0
        ? this.fps
        : Math.round(this.smoothFps * 0.9 + this.fps * 0.1);
      this.fpsAccumulator = 0;
      this.fpsSamples = 0;
    }

    // Fixed timestep accumulation
    this.fixedAccumulator += this.deltaTime;
    let fixedSteps = 0;
    while (this.fixedAccumulator >= this.fixedDeltaTime) {
      this.fixedAccumulator -= this.fixedDeltaTime;
      fixedSteps++;
      if (fixedSteps > 8) {
        // Safety: don't spiral of death
        this.fixedAccumulator = 0;
        break;
      }
    }

    return fixedSteps;
  }

  /** Interpolation alpha for rendering between fixed steps */
  get fixedAlpha(): number {
    return this.fixedAccumulator / this.fixedDeltaTime;
  }
}
