// ============================================================
// FluxionJS V3 — Property Animation Types
// Data model for entity component property keyframe animation.
// Each PropertyClip animates one or more component properties
// over time using linear / easing keyframe interpolation.
//
// Property paths:
//   "position.x"   → TransformComponent.position.x
//   "rotation.y"   → TransformComponent.rotation.y (radians)
//   "scale.z"      → TransformComponent.scale.z
//   "intensity"    → LightComponent.intensity
//   "color.r"      → LightComponent.color.r
//   "fov"          → CameraComponent.fov
// ============================================================

import * as THREE from 'three';
import type { BaseComponent } from './BaseComponent';
import { markDirty } from './ECS';

// ── Easing ────────────────────────────────────────────────────────────────────

export type PropertyEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step';

function applyEasing(t: number, easing: PropertyEasing = 'linear'): number {
  switch (easing) {
    case 'ease-in':     return t * t;
    case 'ease-out':    return t * (2 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'step':        return t < 1 ? 0 : 1;
    default:            return t;
  }
}

// ── Core types ────────────────────────────────────────────────────────────────

export interface PropertyKeyframe {
  time: number;
  value: number;
  easing?: PropertyEasing;
}

export interface PropertyTrack {
  /** ECS component type id, e.g. 'Transform', 'Light' */
  componentType: string;
  /**
   * Dot-separated path into the component.
   * Examples: "position.x", "rotation.y", "intensity", "color.r"
   */
  propertyPath: string;
  /** Sorted ascending by time */
  keyframes: PropertyKeyframe[];
}

export interface PropertyClip {
  id: string;
  name: string;
  /** Total duration in seconds */
  duration: number;
  loop: boolean;
  tracks: PropertyTrack[];
}

// ── Key for track lookup ──────────────────────────────────────────────────────

export function trackKey(track: PropertyTrack): string {
  return `${track.componentType}.${track.propertyPath}`;
}

// ── Keyframe interpolation ────────────────────────────────────────────────────

/** Evaluate a single track at time t. Returns null if no keyframes exist. */
export function evaluateTrack(track: PropertyTrack, time: number): number | null {
  const kfs = track.keyframes;
  if (kfs.length === 0) return null;
  if (kfs.length === 1) return kfs[0].value;
  if (time <= kfs[0].time) return kfs[0].value;
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  // Find bracket
  let lo = 0;
  let hi = kfs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].time <= time) lo = mid; else hi = mid;
  }

  const a = kfs[lo];
  const b = kfs[hi];
  const span = b.time - a.time;
  if (span <= 0) return a.value;
  const t = applyEasing((time - a.time) / span, a.easing);
  return a.value + (b.value - a.value) * t;
}

/** Evaluate all tracks in a clip at time t. Returns a map: trackKey → value. */
export function evaluateClip(clip: PropertyClip, time: number): Map<string, number> {
  const result = new Map<string, number>();
  for (const track of clip.tracks) {
    const val = evaluateTrack(track, time);
    if (val !== null) result.set(trackKey(track), val);
  }
  return result;
}

// ── Apply evaluated values to components ─────────────────────────────────────

/**
 * Write a numeric `value` into a component using dot-path notation.
 * Handles direct fields and sub-properties (e.g. Vector3.x, Color.r).
 */
export function setValueAtPath(comp: BaseComponent, path: string, value: number): void {
  const dot = path.indexOf('.');
  if (dot === -1) {
    // Direct field
    (comp as any)[path] = value;
    markDirty(comp, path);
  } else {
    const field = path.slice(0, dot);
    const sub   = path.slice(dot + 1);
    const obj   = (comp as any)[field];
    if (obj == null) return;
    (obj as any)[sub] = value;
    // Mark the top-level field dirty so TransformSystem and other systems
    // detect the change and sync their THREE.js objects.
    markDirty(comp, field);
  }
}

/**
 * Read a numeric value from a component at a dot-path.
 * Returns 0 if the path resolves to a non-numeric value.
 */
export function getValueAtPath(comp: BaseComponent, path: string): number {
  const dot = path.indexOf('.');
  if (dot === -1) {
    const v = (comp as any)[path];
    return typeof v === 'number' ? v : (typeof v === 'boolean' ? (v ? 1 : 0) : 0);
  }
  const field = path.slice(0, dot);
  const sub   = path.slice(dot + 1);
  const obj   = (comp as any)[field];
  if (obj == null) return 0;
  const v = (obj as any)[sub];
  return typeof v === 'number' ? v : (typeof v === 'boolean' ? (v ? 1 : 0) : 0);
}

// ── Utility: collect animatable paths from a component ────────────────────────

export interface AnimatablePath {
  componentType: string;
  propertyPath: string;
  label: string;
}

/**
 * Given a list of @field metadata entries, return all numeric leaf paths
 * that can be keyframed (number, slider, boolean, vector3, euler, vector2, color).
 */
export function getAnimatablePathsForFields(
  componentType: string,
  fields: ReadonlyArray<{ key: string; type: string; label?: string }>,
): AnimatablePath[] {
  const out: AnimatablePath[] = [];
  for (const f of fields) {
    const label = f.label ?? f.key;
    switch (f.type) {
      case 'number':
      case 'slider':
      case 'int':
        out.push({ componentType, propertyPath: f.key, label });
        break;
      case 'boolean':
        out.push({ componentType, propertyPath: f.key, label: `${label} (bool)` });
        break;
      case 'vector3':
        out.push(
          { componentType, propertyPath: `${f.key}.x`, label: `${label}.x` },
          { componentType, propertyPath: `${f.key}.y`, label: `${label}.y` },
          { componentType, propertyPath: `${f.key}.z`, label: `${label}.z` },
        );
        break;
      case 'euler':
        out.push(
          { componentType, propertyPath: `${f.key}.x`, label: `${label}.x (rad)` },
          { componentType, propertyPath: `${f.key}.y`, label: `${label}.y (rad)` },
          { componentType, propertyPath: `${f.key}.z`, label: `${label}.z (rad)` },
        );
        break;
      case 'vector2':
        out.push(
          { componentType, propertyPath: `${f.key}.x`, label: `${label}.x` },
          { componentType, propertyPath: `${f.key}.y`, label: `${label}.y` },
        );
        break;
      case 'color':
        out.push(
          { componentType, propertyPath: `${f.key}.r`, label: `${label}.r` },
          { componentType, propertyPath: `${f.key}.g`, label: `${label}.g` },
          { componentType, propertyPath: `${f.key}.b`, label: `${label}.b` },
        );
        break;
    }
  }
  return out;
}
