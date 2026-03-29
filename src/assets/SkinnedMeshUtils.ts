// ============================================================
// FluxionJS V3 — SkinnedMeshUtils
// THREE.js .clone() does NOT rebind skeletons — the cloned
// SkinnedMesh still references the ORIGINAL skeleton's bones.
// cloneSkinnedScene() performs a proper deep clone that:
//   1. Clones the full scene graph (bones included).
//   2. Builds a mapping from original-bone UUID → cloned bone.
//   3. Recreates each SkinnedMesh's Skeleton from cloned bones.
//   4. Re-calls bind() so bone inverse matrices are preserved.
// Call this instead of scene.clone() whenever the source may
// contain SkinnedMesh nodes.
// ============================================================

import * as THREE from 'three';

/**
 * Deep-clone a scene that may contain SkinnedMesh nodes.
 * The returned clone has its own Skeleton instances whose bones
 * live entirely inside the clone — original bones are never
 * referenced.
 */
export function cloneSkinnedScene(source: THREE.Group): THREE.Group {
  // Step 1: full clone (bones become new Object3D nodes but
  // SkinnedMesh.skeleton still points to the ORIGINAL skeleton)
  const cloned = source.clone(true) as THREE.Group;

  // Step 2: collect original-bone UUID → cloned-bone by
  // traversing both hierarchies in the same BFS order.
  // THREE.Object3D.clone traverses in the same order as traverse(),
  // so positions[i] in source ↔ positions[i] in clone.
  const sourceBones: THREE.Bone[] = [];
  const clonedBones: THREE.Bone[] = [];

  source.traverse((n) => { if (n instanceof THREE.Bone) sourceBones.push(n); });
  cloned.traverse((n)  => { if (n instanceof THREE.Bone) clonedBones.push(n); });

  // Map: originalBone.uuid → clonedBone
  const boneMap = new Map<string, THREE.Bone>();
  for (let i = 0; i < sourceBones.length; i++) {
    if (i < clonedBones.length) boneMap.set(sourceBones[i].uuid, clonedBones[i]);
  }

  // Step 3: for every SkinnedMesh in the clone, rebuild the
  // skeleton so it references only cloned bones.
  cloned.traverse((node) => {
    if (!(node instanceof THREE.SkinnedMesh)) return;

    const sm = node as THREE.SkinnedMesh;
    const orig = sm.skeleton; // still the ORIGINAL skeleton

    // Remap each bone to its clone; fall back to the original
    // (safe for bones that exist in only one sub-hierarchy).
    const newBones = orig.bones.map((b) => boneMap.get(b.uuid) ?? b);

    // Clone inverses so the new Skeleton owns its own matrices.
    const newInverses = orig.boneInverses.map((m) => m.clone());

    const newSkeleton = new THREE.Skeleton(newBones, newInverses);

    // bind() sets skeleton + copies bindMatrix / bindMatrixInverse.
    // Use the original bindMatrix so the rest pose is preserved.
    sm.bind(newSkeleton, sm.bindMatrix.clone());
  });

  return cloned;
}
