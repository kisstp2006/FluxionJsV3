// ============================================================
// FluxionJS V3 — ColorRef
// A typed color value that can be exposed in the Inspector.
//
// Usage in scripts (TS/JS):
//   tint = new ColorRef('#ff4444');       // exposes a color picker
//   tint = new ColorRef('#ff444480');     // with alpha
//
// Usage in Lua:
//   self.tint = ColorRef("#ff4444")
//
//   update() {
//     this.renderer.material.color = this.tint.hex;
//   }
// ============================================================

export class ColorRef {
  /**
   * @internal — sentinel used by the Inspector to distinguish
   * this from a plain string.
   */
  readonly __type = 'ColorRef' as const;

  /** Current color as "#RRGGBB" or "#RRGGBBAA". */
  hex: string;

  constructor(hex: string = '#ffffff') {
    this.hex = hex;
  }

  /** Returns true when a valid hex color is set. */
  get isValid(): boolean {
    return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(this.hex);
  }

  /** Alpha component 0–1 (1 if no alpha channel present). */
  get alpha(): number {
    if (this.hex.length === 9) return parseInt(this.hex.slice(7, 9), 16) / 255;
    return 1;
  }

  /** @internal — restore from a serialized plain object. */
  static _restore(plain: { hex?: string }): ColorRef {
    return new ColorRef(typeof plain?.hex === 'string' ? plain.hex : '#ffffff');
  }
}
