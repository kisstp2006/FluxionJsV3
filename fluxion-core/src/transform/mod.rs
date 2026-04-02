// ============================================================
// fluxion-core — Transform Propagation
// Ported from src/core/TransformSystem.ts
//
// Input layout (from JS):
//   parent_slots : &[i32]   — n elements; -1 = root entity
//   local_data   : &[f32]   — n * 10 floats per entity:
//                              [px,py,pz, qx,qy,qz,qw, sx,sy,sz]
//   local_dirty  : &[u8]    — n bytes; 1 if entity's local TRS changed
//
// Output layout (to JS):  Float32Array of n * OUT_STRIDE floats.
// Per-entity block (OUT_STRIDE = 27):
//   [0]      dirty_flag  — 1.0 if world matrix was recomputed, else 0.0
//   [1..16]  world_mat   — column-major Mat4 (same layout as THREE.js Matrix4.elements)
//   [17..19] world_pos   — world-space position
//   [20..23] world_rot   — world-space quaternion (x,y,z,w)
//   [24..26] world_scale — world-space scale
// ============================================================

use glam::{Mat4, Quat, Vec3};

pub const LOCAL_STRIDE: usize = 10; // floats per entity in local_data
pub const OUT_STRIDE:   usize = 27; // floats per entity in output

/// Run the full BFS transform propagation pass.
///
/// Returns a `Vec<f32>` of length `n * OUT_STRIDE`.
/// JS reads `output[i * 27]` to check if entity `i` was updated.
pub fn propagate_transforms(
    parent_slots: &[i32],
    local_data:   &[f32],
    local_dirty:  &[u8],
) -> Vec<f32> {
    let n = parent_slots.len();
    if n == 0 { return Vec::new(); }

    // ── Build children list ────────────────────────────────────────────────────
    let mut children: Vec<Vec<u32>> = vec![Vec::new(); n];
    let mut roots: Vec<u32> = Vec::new();

    for i in 0..n {
        let p = parent_slots[i];
        if p < 0 {
            roots.push(i as u32);
        } else {
            let pi = p as usize;
            if pi < n { children[pi].push(i as u32); }
        }
    }

    // ── Per-entity working state ────────────────────────────────────────────────
    // local_mat[i]  — local Matrix4 (computed from TRS or identity)
    // world_mat[i]  — accumulated world Matrix4
    // world_dirty[i] — whether world matrix needs recompute this pass
    let mut local_mats:  Vec<Mat4> = vec![Mat4::IDENTITY; n];
    let mut world_mats:  Vec<Mat4> = vec![Mat4::IDENTITY; n];
    let mut world_dirty: Vec<bool> = vec![false; n];

    // Pre-compute local matrices for locally-dirty entities
    for i in 0..n {
        if local_dirty[i] != 0 {
            let base = i * LOCAL_STRIDE;
            let pos = Vec3::new(local_data[base],     local_data[base + 1], local_data[base + 2]);
            let rot = Quat::from_xyzw(
                local_data[base + 3], local_data[base + 4],
                local_data[base + 5], local_data[base + 6],
            ).normalize();
            let scl = Vec3::new(local_data[base + 7], local_data[base + 8], local_data[base + 9]);
            local_mats[i] = Mat4::from_scale_rotation_translation(scl, rot, pos);
            world_dirty[i] = true;
        }
    }

    // ── BFS from roots ─────────────────────────────────────────────────────────
    let mut queue: Vec<u32> = roots;
    let mut output: Vec<f32> = vec![0.0f32; n * OUT_STRIDE];
    let mut head = 0usize;

    while head < queue.len() {
        let i = queue[head] as usize;
        head += 1;

        if world_dirty[i] {
            let p = parent_slots[i];
            let world = if p >= 0 && (p as usize) < n {
                world_mats[p as usize] * local_mats[i]
            } else {
                local_mats[i]
            };
            world_mats[i] = world;

            // Extract decomposed world components
            let (scl, rot, pos) = world.to_scale_rotation_translation();

            // Write output block
            let base = i * OUT_STRIDE;
            output[base] = 1.0; // dirty flag — was updated

            // World matrix (column-major, 16 floats) — identical layout to THREE.js
            let cols = world.to_cols_array();
            output[base + 1..base + 17].copy_from_slice(&cols);

            // World position (3 floats)
            output[base + 17] = pos.x;
            output[base + 18] = pos.y;
            output[base + 19] = pos.z;

            // World rotation quaternion (x,y,z,w — 4 floats)
            output[base + 20] = rot.x;
            output[base + 21] = rot.y;
            output[base + 22] = rot.z;
            output[base + 23] = rot.w;

            // World scale (3 floats)
            output[base + 24] = scl.x;
            output[base + 25] = scl.y;
            output[base + 26] = scl.z;

            // Propagate worldDirty to direct children
            for &child in &children[i] {
                world_dirty[child as usize] = true;
            }
        }

        // Enqueue children regardless (BFS order ensures parents before children)
        for &child in &children[i] {
            queue.push(child);
        }
    }

    output
}

// ── Wasm export ───────────────────────────────────────────────────────────────

#[cfg(feature = "wasm")]
mod wasm_exports {
    use super::*;
    use wasm_bindgen::prelude::*;

    /// Synchronous per-frame transform propagation.
    /// Called every frame from TransformSystem.ts — MUST be synchronous.
    ///
    /// Returns Float32Array of length n * 27.
    /// Layout per entity: [dirty_flag, mat4_16, pos_3, rot_4, scale_3]
    #[wasm_bindgen]
    pub fn propagate_transforms(
        parent_slots: &[i32],
        local_data:   &[f32],
        local_dirty:  &[u8],
    ) -> Vec<f32> {
        super::propagate_transforms(parent_slots, local_data, local_dirty)
    }
}
