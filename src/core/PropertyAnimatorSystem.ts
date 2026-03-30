// ============================================================
// FluxionJS V3 — PropertyAnimatorSystem
// ECS System that ticks AnimationComponent.propertyClips every
// frame, evaluating keyframes and writing values back to the
// target component properties on the same entity.
// ============================================================

import type { System, ECSManager } from './ECS';
import { AnimationComponent } from './Components';
import { evaluateClip, setValueAtPath } from './PropertyAnimationTypes';

export class PropertyAnimatorSystem implements System {
  readonly name = 'PropertyAnimator';
  readonly requiredComponents = ['Animation'];
  priority = 2;
  enabled = true;

  onSceneClear(): void {
    // Nothing to clean up — all state lives in AnimationComponent
  }

  update(entities: Set<number>, ecs: ECSManager, dt: number): void {
    for (const entity of entities) {
      const anim = ecs.getComponent<AnimationComponent>(entity, 'Animation');
      if (!anim) continue;
      if (!anim.activePropertyClip || !anim.isPropertyPlaying) continue;

      const clip = anim.propertyClips.find(c => c.id === anim.activePropertyClip);
      if (!clip) continue;

      // Advance time
      anim.propertyTime += dt * anim.propertySpeed;

      if (clip.loop) {
        anim.propertyTime = ((anim.propertyTime % clip.duration) + clip.duration) % clip.duration;
      } else {
        if (anim.propertyTime >= clip.duration) {
          anim.propertyTime = clip.duration;
          anim.isPropertyPlaying = false;
        }
      }

      PropertyAnimatorSystem.applyClipAtTime(entity, anim, ecs, anim.propertyTime);
    }
  }

  /**
   * Apply a clip at a specific time without advancing the clock.
   * Used by the editor timeline for scrubbing.
   */
  static applyClipAtTime(
    entity: number,
    anim: AnimationComponent,
    ecs: ECSManager,
    time: number,
  ): void {
    const clip = anim.propertyClips.find(c => c.id === anim.activePropertyClip);
    if (!clip) return;

    const values = evaluateClip(clip, time);
    for (const [key, value] of values) {
      const dotIdx = key.indexOf('.');
      if (dotIdx === -1) continue;
      const compType = key.slice(0, dotIdx);
      const rest     = key.slice(dotIdx + 1);

      const comp = ecs.getComponent(entity, compType);
      if (!comp) continue;

      // rest is still "propertyPath" which may contain a second dot, e.g. "position.x"
      setValueAtPath(comp as any, rest, value);
    }
  }

  /**
   * Apply a specific clip (by id) at time without requiring it to be
   * the active clip — used by the editor preview scrubber.
   */
  static scrubClip(
    entity: number,
    clipId: string,
    anim: AnimationComponent,
    ecs: ECSManager,
    time: number,
  ): void {
    const clip = anim.propertyClips.find(c => c.id === clipId);
    if (!clip) return;

    const values = evaluateClip(clip, time);
    for (const [key, value] of values) {
      const dotIdx = key.indexOf('.');
      if (dotIdx === -1) continue;
      const compType = key.slice(0, dotIdx);
      const rest     = key.slice(dotIdx + 1);

      const comp = ecs.getComponent(entity, compType);
      if (!comp) continue;

      setValueAtPath(comp as any, rest, value);
    }
  }
}
