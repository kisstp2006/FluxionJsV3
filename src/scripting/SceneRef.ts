// ============================================================
// FluxionJS V3 — SceneRef
// A typed scene file reference that can be exposed in the Inspector.
//
// Usage in scripts:
//   nextLevel = new SceneRef();                      // exposes a scene picker
//   nextLevel = new SceneRef('Scenes/Level2.fluxscene'); // pre-filled
//
//   start() {
//     this.engine.loadScene(this.nextLevel.path);
//   }
// ============================================================

export class SceneRef {
  /**
   * @internal — sentinel used by the Inspector and ScriptSystem to
   * distinguish this from a plain string without needing `instanceof`
   * across module boundaries.
   */
  readonly __type = 'SceneRef' as const;

  /** The currently assigned project-relative path, or empty string if unassigned. */
  path: string;

  constructor(path: string = '') {
    this.path = path;
  }

  /** Returns true when a path is assigned. */
  get isValid(): boolean {
    return this.path.length > 0;
  }

  /** @internal — restore from a serialized plain object. */
  static _restore(plain: { path?: string }): SceneRef {
    return new SceneRef(typeof plain?.path === 'string' ? plain.path : '');
  }
}
