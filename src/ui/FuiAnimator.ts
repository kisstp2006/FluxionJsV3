// ============================================================
// FluxionJS V3 — FUI Animator
// Keyframe interpolation + document animation application.
// ============================================================

import type { FuiAnimation, FuiAnimationTrack, FuiDocument, FuiKeyframe, FuiPanelNode } from './FuiTypes';

// ── Easing ──

function applyEasing(t: number, easing: FuiKeyframe['easing']): number {
  switch (easing) {
    case 'ease-in':     return t * t;
    case 'ease-out':    return t * (2 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'step':        return t < 1 ? 0 : 1;
    default:            return t; // linear
  }
}

// ── Track evaluation ──

export function evalTrack(track: FuiAnimationTrack, time: number): number | null {
  const { keyframes } = track;
  if (!keyframes.length) return null;
  if (time <= keyframes[0].time) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (time >= last.time) return last.value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const k0 = keyframes[i];
    const k1 = keyframes[i + 1];
    if (time >= k0.time && time < k1.time) {
      const span = k1.time - k0.time;
      const raw = span > 0 ? (time - k0.time) / span : 0;
      const t = applyEasing(raw, k0.easing);
      return k0.value + (k1.value - k0.value) * t;
    }
  }
  return null;
}

// ── Apply animated value to a node in the cloned tree ──

function applyToNode(node: any, nodeId: string, property: string, value: number): boolean {
  if (node.id === nodeId) {
    if (property === 'x' || property === 'y' || property === 'w' || property === 'h') {
      node.rect = node.rect ?? { x: 0, y: 0, w: 100, h: 40 };
      node.rect[property] = property === 'w' || property === 'h' ? Math.max(1, value) : value;
    } else {
      node.style = node.style ?? {};
      node.style[property] = value;
    }
    return true;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (applyToNode(child, nodeId, property, value)) return true;
    }
  }
  return false;
}

// ── Public: apply a single animation at a given time to a document ──

export function applyAnimation(doc: FuiDocument, anim: FuiAnimation, time: number): FuiDocument {
  let t = time;
  if (anim.loop && anim.duration > 0) {
    t = ((time % anim.duration) + anim.duration) % anim.duration;
  } else {
    t = Math.min(Math.max(0, time), anim.duration);
  }

  // Only clone if there's something to apply
  if (!anim.tracks.length) return doc;

  const newDoc = JSON.parse(JSON.stringify(doc)) as FuiDocument;

  for (const track of anim.tracks) {
    const value = evalTrack(track, t);
    if (value === null) continue;
    applyToNode(newDoc.root as FuiPanelNode, track.nodeId, track.property, value);
  }

  return newDoc;
}
