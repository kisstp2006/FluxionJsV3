// ============================================================
// FluxionJS V3 — FuiRef
// A typed FUI file reference that can be exposed in the Inspector.
//
// Usage in scripts:
//   hud = new FuiRef();             // exposes a .fui asset picker
//   hud = new FuiRef('ui/hud.fui'); // pre-filled default path
//
//   start() {
//     this.ui.load(this.hud.path);
//   }
// ============================================================

export class FuiRef {
  /**
   * @internal — sentinel used by the Inspector and ScriptSystem to
   * distinguish this from a plain string without needing `instanceof`
   * across module boundaries.
   */
  readonly __type = 'FuiRef' as const;

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
  static _restore(plain: { path?: string }): FuiRef {
    return new FuiRef(typeof plain?.path === 'string' ? plain.path : '');
  }
}
