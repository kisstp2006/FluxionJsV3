// ============================================================
// fluxion-core — CSG Bridge
// Flat-array ↔ Csg serialization + FFI exports (Wasm + native)
// ============================================================

use serde::{Deserialize, Serialize};
use super::geom::{Csg, CsgPolygon, CsgVertex, Vec3, Vec2};

// ── Serializable mesh representation ─────────────────────────────────────────

/// Flat-array polygon soup — identical to what CSGBridge.ts builds.
/// Transport format between JS and Rust for both Tauri and Wasm.
///
/// Layout:
///   positions    = [x,y,z, x,y,z, …]  — all vertices in all polygons
///   normals      = [nx,ny,nz, …]        — per-vertex
///   uvs          = [u,v, …]             — per-vertex
///   vertex_counts = [3,4,3,…]           — vertices per polygon
///   shared       = [0,0,1,…]            — material index per polygon
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CsgMeshData {
    pub positions:     Vec<f32>,
    pub normals:       Vec<f32>,
    pub uvs:           Vec<f32>,
    pub vertex_counts: Vec<u32>,
    pub shared:        Vec<u32>,
}

impl CsgMeshData {
    /// Convert flat arrays → Csg polygon list.
    pub fn to_csg(&self) -> Csg {
        let mut polygons = Vec::with_capacity(self.vertex_counts.len());
        let mut offset = 0usize;

        for (poly_idx, &vc) in self.vertex_counts.iter().enumerate() {
            let vc = vc as usize;
            let shared = self.shared.get(poly_idx).copied().unwrap_or(0);
            let mut vertices = Vec::with_capacity(vc);

            for vi in 0..vc {
                let i = offset + vi;
                let pos = Vec3::new(
                    self.positions[i * 3],
                    self.positions[i * 3 + 1],
                    self.positions[i * 3 + 2],
                );
                let normal = if self.normals.len() > i * 3 + 2 {
                    Vec3::new(
                        self.normals[i * 3],
                        self.normals[i * 3 + 1],
                        self.normals[i * 3 + 2],
                    )
                } else {
                    Vec3::new(0.0, 1.0, 0.0)
                };
                let uv = if self.uvs.len() > i * 2 + 1 {
                    Vec2::new(self.uvs[i * 2], self.uvs[i * 2 + 1])
                } else {
                    Vec2::zero()
                };
                vertices.push(CsgVertex::new(pos, normal, uv));
            }

            if vertices.len() >= 3 {
                polygons.push(CsgPolygon::new(vertices, shared));
            }
            offset += vc;
        }

        Csg { polygons }
    }
}

impl Csg {
    /// Convert Csg polygon list → flat arrays for JS consumption.
    pub fn to_mesh_data(&self) -> CsgMeshData {
        let total: usize = self.polygons.iter().map(|p| p.vertices.len()).sum();
        let mut positions     = Vec::with_capacity(total * 3);
        let mut normals       = Vec::with_capacity(total * 3);
        let mut uvs           = Vec::with_capacity(total * 2);
        let mut vertex_counts = Vec::with_capacity(self.polygons.len());
        let mut shared        = Vec::with_capacity(self.polygons.len());

        for poly in &self.polygons {
            vertex_counts.push(poly.vertices.len() as u32);
            shared.push(poly.shared);
            for v in &poly.vertices {
                positions.extend_from_slice(&[v.pos.x, v.pos.y, v.pos.z]);
                normals.extend_from_slice(&[v.normal.x, v.normal.y, v.normal.z]);
                uvs.extend_from_slice(&[v.uv.x, v.uv.y]);
            }
        }

        CsgMeshData { positions, normals, uvs, vertex_counts, shared }
    }
}

// ── Core operation (used by both Tauri command and Wasm export) ───────────────

/// Run a CSG boolean operation on two polygon-soup meshes.
/// `op` must be one of `"union"`, `"subtract"`, or `"intersect"`.
pub fn csg_operation(a: CsgMeshData, b: CsgMeshData, op: &str) -> Result<CsgMeshData, String> {
    let csg_a = a.to_csg();
    let csg_b = b.to_csg();

    let result = match op {
        "union"     => csg_a.union(csg_b),
        "subtract"  => csg_a.subtract(csg_b),
        "intersect" => csg_a.intersect(csg_b),
        other       => return Err(format!("Unknown CSG operation: {other}")),
    };

    Ok(result.to_mesh_data())
}

// ── Primitive request type (shared by Tauri + Wasm) ──────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrimitiveRequest {
    pub shape:        String,
    pub cx:           Option<f32>,
    pub cy:           Option<f32>,
    pub cz:           Option<f32>,
    pub sx:           Option<f32>,
    pub sy:           Option<f32>,
    pub sz:           Option<f32>,
    pub radius:       Option<f32>,
    pub height:       Option<f32>,
    pub slices:       Option<u32>,
    pub stacks:       Option<u32>,
    pub radius_top:   Option<f32>,
    pub arch_radius:  Option<f32>,
    pub segments:     Option<u32>,
    pub steps:        Option<u32>,
    /// Column-major 4×4 transform matrix (same layout as THREE.js / glam).
    /// When present, applied to all vertex positions and normals.
    pub mat4:         Option<[f32; 16]>,
}

pub fn build_primitive(req: PrimitiveRequest) -> Result<CsgMeshData, String> {
    use super::primitives::*;

    let cx = req.cx.unwrap_or(0.0);
    let cy = req.cy.unwrap_or(0.0);
    let cz = req.cz.unwrap_or(0.0);

    let mut mesh = match req.shape.as_str() {
        "box" => build_box(
            cx, cy, cz,
            req.sx.unwrap_or(1.0), req.sy.unwrap_or(1.0), req.sz.unwrap_or(1.0),
        ),
        "cylinder" => {
            let r = req.radius.unwrap_or(0.5);
            build_cylinder(cx, cy, cz, r, req.height.unwrap_or(1.0),
                req.slices.unwrap_or(16), req.radius_top.unwrap_or(r))
        }
        "cone" => {
            let r = req.radius.unwrap_or(0.5);
            build_cylinder(cx, cy, cz, r, req.height.unwrap_or(1.0),
                req.slices.unwrap_or(16), 0.001)
        }
        "sphere" => build_sphere(
            cx, cy, cz,
            req.radius.unwrap_or(0.5),
            req.slices.unwrap_or(16),
            req.stacks.unwrap_or(8),
        ),
        "wedge" => build_wedge(
            cx, cy, cz,
            req.sx.unwrap_or(1.0), req.sy.unwrap_or(1.0), req.sz.unwrap_or(1.0),
        ),
        "stairs" => build_stairs(
            cx, cy, cz,
            req.sx.unwrap_or(1.0), req.sy.unwrap_or(1.0), req.sz.unwrap_or(1.0),
            req.steps.unwrap_or(4),
        ),
        "arch" => {
            let sx = req.sx.unwrap_or(1.0);
            let sy = req.sy.unwrap_or(1.0);
            let r  = req.arch_radius.unwrap_or(sx.min(sy) * 0.4);
            build_arch(cx, cy, cz, sx, sy, req.sz.unwrap_or(1.0), r,
                req.segments.unwrap_or(12))
        }
        other => return Err(format!("Unknown primitive shape: {other}")),
    };

    if let Some(mat) = req.mat4 {
        mesh = apply_mat4(mesh, &mat);
    }

    Ok(mesh)
}

// ── Wasm exports ─────────────────────────────────────────────────────────────

#[cfg(feature = "wasm")]
mod wasm_exports {
    use super::*;
    use wasm_bindgen::prelude::*;

    /// Wasm-exported CSG operation.
    /// Takes JSON strings for `a` and `b` (`CsgMeshData`), returns JSON result.
    #[wasm_bindgen]
    pub fn csg_op(a_json: &str, b_json: &str, op: &str) -> Result<String, JsValue> {
        let a: CsgMeshData = serde_json::from_str(a_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse mesh A: {e}")))?;
        let b: CsgMeshData = serde_json::from_str(b_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse mesh B: {e}")))?;

        let result = csg_operation(a, b, op)
            .map_err(|e| JsValue::from_str(&e))?;

        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {e}")))
    }

    /// Run multiple sequential CSG operations in one round-trip.
    /// `ops_json` is a JSON array of `{ op: string, mesh: CsgMeshData }`.
    /// Processes left-to-right: result = first OP second OP third …
    #[wasm_bindgen]
    pub fn csg_op_batch(base_json: &str, ops_json: &str) -> Result<String, JsValue> {
        #[derive(serde::Deserialize)]
        struct OpEntry {
            op:   String,
            mesh: CsgMeshData,
        }

        let mut acc: CsgMeshData = serde_json::from_str(base_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse base mesh: {e}")))?;
        let ops: Vec<OpEntry> = serde_json::from_str(ops_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse ops: {e}")))?;

        for entry in ops {

            acc = csg_operation(acc, entry.mesh, &entry.op)
                .map_err(|e| JsValue::from_str(&e))?;
        }

        serde_json::to_string(&acc)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {e}")))
    }

    /// Build a CSG primitive and optionally apply a transform.
    /// `req_json` is a JSON-serialized `PrimitiveRequest`.
    /// Returns a JSON-serialized `CsgMeshData`.
    #[wasm_bindgen]
    pub fn build_csg_primitive(req_json: &str) -> Result<String, JsValue> {
        let req: PrimitiveRequest = serde_json::from_str(req_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse primitive request: {e}")))?;

        let result = build_primitive(req)
            .map_err(|e| JsValue::from_str(&e))?;

        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {e}")))
    }
}
