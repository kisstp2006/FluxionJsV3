// ============================================================
// FluxionJS V3 — FontRef
// A typed font reference that can be exposed in the Inspector
// and used in scripts to assign custom fonts to FUI nodes.
//
// Usage in scripts:
//   @expose titleFont = new FontRef('Assets/Fonts/Orbitron.ttf', 'Orbitron');
//
//   start() {
//     this.fui.setFont('title_label', this.titleFont);
//   }
// ============================================================

export class FontRef {
  /**
   * @internal — sentinel used by the Inspector and ScriptSystem to
   * distinguish this from a plain string without needing `instanceof`
   * across module boundaries.
   */
  readonly __type = 'FontRef' as const;

  /** Project-relative path to the font file (.ttf / .otf / .woff / .woff2). */
  path: string;

  /**
   * CSS font-family name under which this font is registered.
   * If empty, it is derived from the filename (e.g. "Orbitron.ttf" → "Orbitron").
   */
  family: string;

  constructor(path: string = '', family: string = '') {
    this.path = path;
    this.family = family || FontRef._familyFromPath(path);
  }

  /** Returns true when a path is assigned. */
  get isValid(): boolean {
    return this.path.length > 0;
  }

  /** @internal — derive a CSS family name from a filename. */
  static _familyFromPath(path: string): string {
    const name = path.replace(/\\/g, '/').split('/').pop() ?? '';
    return name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  }

  /** @internal — restore from a serialised plain object. */
  static _restore(plain: { path?: string; family?: string }): FontRef {
    return new FontRef(
      typeof plain?.path === 'string'   ? plain.path   : '',
      typeof plain?.family === 'string' ? plain.family : '',
    );
  }
}
