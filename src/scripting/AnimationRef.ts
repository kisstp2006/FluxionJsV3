// ============================================================
// FluxionJS V3 — AnimationRef
// A typed reference to a named animation clip embedded inside a
// 3D model file (FBX / GLTF / GLB).  Assign via the Animator
// inspector's drop zone or in scripts.
//
// Usage in scripts:
//   @property() runClip = new AnimationRef();
//
//   start() {
//     const anim = this.getComponent<AnimationComponent>('Animation');
//     if (anim && this.runClip.isValid) anim.currentClip = this.runClip.clip;
//   }
// ============================================================

export class AnimationRef {
  /**
   * @internal — sentinel used by the Inspector and ScriptSystem to
   * distinguish this from a plain object without needing `instanceof`
   * across module boundaries.
   */
  readonly __type = 'AnimationRef' as const;

  /** Project-relative path to the source model file (e.g. 'Assets/Character.fbx'). */
  path: string;

  /** Name of the clip inside that model (e.g. 'Walk', 'Run', 'Idle'). */
  clip: string;

  constructor(path = '', clip = '') {
    this.path = path;
    this.clip = clip;
  }

  /** Returns true when both a path and a clip name are assigned. */
  get isValid(): boolean {
    return this.path.length > 0 && this.clip.length > 0;
  }

  /** Short display string for inspector labels. */
  get label(): string {
    if (!this.isValid) return 'None';
    const file = this.path.replace(/\\/g, '/').split('/').pop() ?? this.path;
    return `${this.clip}  (${file})`;
  }

  /** @internal — restore from a serialized plain object. */
  static _restore(plain: { path?: string; clip?: string }): AnimationRef {
    return new AnimationRef(
      typeof plain?.path === 'string' ? plain.path : '',
      typeof plain?.clip === 'string' ? plain.clip : '',
    );
  }
}
