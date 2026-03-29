// ============================================================
// FluxionJS V3 — MaterialRef
// A typed material reference that can be exposed in the Inspector.
//
// Usage in scripts:
//   mat = new MaterialRef();                    // any material
//   mat = new MaterialRef('Materials/Red.fluxmat');
//
//   start() {
//     const loaded = await this.mat.load(this.mat);
//     this.mat.apply(this.entity, loaded);
//   }
// ============================================================

export class MaterialRef {
  /**
   * @internal — sentinel used by the Inspector and ScriptSystem to
   * distinguish this from a plain string without needing `instanceof`
   * across module boundaries.
   */
  readonly __type = 'MaterialRef' as const;

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
  static _restore(plain: { path?: string }): MaterialRef {
    return new MaterialRef(typeof plain?.path === 'string' ? plain.path : '');
  }
}
