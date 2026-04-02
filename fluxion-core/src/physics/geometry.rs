// ============================================================
// fluxion-core — Physics Geometry Extraction
// Ported from src/physics/PhysicsBodySystem._extractGeometry()
//
// Input layout:
//   A flat Float32Array containing N mesh blocks packed back-to-back.
//   Each block:
//     [0]          vertex_count  (f32, cast to usize)
//     [1]          index_count   (f32, cast to usize; 0 = non-indexed)
//     [2..=3]      padding
//     [4..=19]     world_matrix  (16 f32, column-major — same as THREE.js matrixWorld.elements)
//     [20..=20+vertex_count*3-1]  positions (x,y,z per vertex)
//     [next N]     indices       (f32-cast u32 per index; omitted if index_count==0)
//
// Output layout:
//   [0]   total_vertex_count  (f32)
//   [1]   total_index_count   (f32)
//   [2..=2+total_vertex_count*3-1]  merged + transformed vertices (x,y,z)
//   [next] merged + re-based indices (f32-cast u32)
//
// Optional worldScale (sx, sy, sz) can be passed as 3 extra floats appended
// to the input — but the mesh-blocks themselves do not include it.
// Instead the caller prepends a 3-float header before the mesh blocks:
//   [0]  apply_scale  (1.0 = yes, 0.0 = no)
//   [1]  sx, [2] sy, [3] sz
//   [4..] mesh blocks as above
// ============================================================

use glam::{Mat4, Vec3};

const BLOCK_HEADER: usize = 4;  // vertex_count, index_count, pad, pad
const MATRIX_SIZE:  usize = 16; // column-major Mat4
const SCALE_HEADER: usize = 4;  // apply_scale, sx, sy, sz

/// Extract and merge geometry from packed mesh data, applying world matrices.
///
/// `input` layout: [apply_scale(1), sx, sy, sz] followed by N mesh blocks.
/// Returns merged vertex + index buffers with a 2-float count header.
pub fn extract_geometry(input: &[f32]) -> Vec<f32> {
    if input.len() < SCALE_HEADER {
        return vec![0.0, 0.0];
    }

    let apply_scale = input[0] != 0.0;
    let (sx, sy, sz) = (input[1], input[2], input[3]);

    let mut all_vertices: Vec<f32> = Vec::new();
    let mut all_indices:  Vec<f32> = Vec::new();
    let mut offset = SCALE_HEADER;
    let mut vertex_base: u32 = 0;

    while offset + BLOCK_HEADER + MATRIX_SIZE <= input.len() {
        let vertex_count = input[offset]     as usize;
        let index_count  = input[offset + 1] as usize;
        offset += BLOCK_HEADER;

        // World matrix — column-major, same layout as THREE.js Matrix4.elements
        if offset + MATRIX_SIZE > input.len() { break; }
        let mat_arr: [f32; 16] = input[offset..offset + MATRIX_SIZE]
            .try_into()
            .unwrap_or([
                1.,0.,0.,0., 0.,1.,0.,0., 0.,0.,1.,0., 0.,0.,0.,1.
            ]);
        let mat = Mat4::from_cols_array(&mat_arr);
        offset += MATRIX_SIZE;

        // Vertices — apply world matrix then optional world scale
        if offset + vertex_count * 3 > input.len() { break; }
        all_vertices.reserve(vertex_count * 3);
        for i in 0..vertex_count {
            let vx = input[offset + i * 3];
            let vy = input[offset + i * 3 + 1];
            let vz = input[offset + i * 3 + 2];
            let mut v = mat.transform_point3(Vec3::new(vx, vy, vz));
            if apply_scale {
                v.x *= sx;
                v.y *= sy;
                v.z *= sz;
            }
            all_vertices.push(v.x);
            all_vertices.push(v.y);
            all_vertices.push(v.z);
        }
        offset += vertex_count * 3;

        // Indices — re-base by vertex_base
        if index_count > 0 {
            if offset + index_count > input.len() { break; }
            all_indices.reserve(index_count);
            for i in 0..index_count {
                all_indices.push((input[offset + i] as u32 + vertex_base) as f32);
            }
            offset += index_count;
        } else {
            // Non-indexed: generate sequential indices
            all_indices.reserve(vertex_count);
            for i in 0..vertex_count {
                all_indices.push((i as u32 + vertex_base) as f32);
            }
        }

        vertex_base += vertex_count as u32;
    }

    let total_verts  = (all_vertices.len() / 3) as f32;
    let total_idxs   = all_indices.len() as f32;

    let mut output = Vec::with_capacity(2 + all_vertices.len() + all_indices.len());
    output.push(total_verts);
    output.push(total_idxs);
    output.extend_from_slice(&all_vertices);
    output.extend_from_slice(&all_indices);
    output
}

// ── Wasm export ───────────────────────────────────────────────────────────────

#[cfg(feature = "wasm")]
mod wasm_exports {
    use super::extract_geometry;
    use wasm_bindgen::prelude::*;

    /// Extract and merge physics geometry from packed mesh data.
    ///
    /// Input: Float32Array — [apply_scale, sx, sy, sz, ...mesh blocks]
    /// Output: Float32Array — [total_vertex_count, total_index_count, ...vertices, ...indices]
    #[wasm_bindgen]
    pub fn extract_geometry_wasm(input: &[f32]) -> Vec<f32> {
        super::extract_geometry(input)
    }
}
