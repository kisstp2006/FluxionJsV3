// ============================================================
// FluxionJS V3 — TextureRef
// A typed texture reference that can be exposed in the Inspector.
//
// Usage in scripts:
//   tex = new TextureRef();                      // exposes a texture picker
//   tex = new TextureRef('Textures/brick.png');  // pre-filled default
//
//   async start() {
//     const m = await this.mat.load(this.myMat);
//     await this.mat.setTexture(m, 'map', this.tex);
//     this.mat.apply(this.entity, m);
//   }
// ============================================================

export class TextureRef {
  /**
   * @internal — sentinel used by the Inspector and ScriptSystem to
   * distinguish this from a plain string without needing `instanceof`
   * across module boundaries.
   */
  readonly __type = 'TextureRef' as const;

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
  static _restore(plain: { path?: string }): TextureRef {
    return new TextureRef(typeof plain?.path === 'string' ? plain.path : '');
  }
}
