// ============================================================
// fluxion-core — CSG Primitive Generators
// Ported from src/csg/CSGCore.ts
// Each function returns CsgMeshData (flat polygon soup).
// ============================================================

use std::f32::consts::PI;
use super::geom::{Csg, CsgPolygon, CsgVertex, Vec3, Vec2};
use super::bridge::CsgMeshData;

// ── Internal helpers ──────────────────────────────────────────────────────────

fn make_csg(polygons: Vec<CsgPolygon>) -> Csg {
    Csg { polygons }
}

/// UV for a box face based on the dominant normal axis.
/// Matches CSGCore.ts `fromFaces` UV generation exactly.
fn box_uv(p: Vec3, normal: Vec3, sx: f32, sy: f32, sz: f32) -> Vec2 {
    let ax = normal.x.abs();
    let ay = normal.y.abs();
    let az = normal.z.abs();
    if ax >= ay && ax >= az {
        Vec2::new(p.z / sz + 0.5, p.y / sy + 0.5)
    } else if ay >= ax && ay >= az {
        Vec2::new(p.x / sx + 0.5, p.z / sz + 0.5)
    } else {
        Vec2::new(p.x / sx + 0.5, p.y / sy + 0.5)
    }
}

// ── Primitive builders ────────────────────────────────────────────────────────

/// Axis-aligned box centered at (cx, cy, cz) with dimensions sx × sy × sz.
pub fn build_box(cx: f32, cy: f32, cz: f32, sx: f32, sy: f32, sz: f32) -> CsgMeshData {
    let (hx, hy, hz) = (sx * 0.5, sy * 0.5, sz * 0.5);

    // [vertex positions CCW from outside, face normal]
    let faces: [([Vec3; 4], Vec3); 6] = [
        // +Z
        ([Vec3::new(cx-hx,cy-hy,cz+hz), Vec3::new(cx+hx,cy-hy,cz+hz),
          Vec3::new(cx+hx,cy+hy,cz+hz), Vec3::new(cx-hx,cy+hy,cz+hz)],
         Vec3::new(0.0, 0.0, 1.0)),
        // -Z
        ([Vec3::new(cx+hx,cy-hy,cz-hz), Vec3::new(cx-hx,cy-hy,cz-hz),
          Vec3::new(cx-hx,cy+hy,cz-hz), Vec3::new(cx+hx,cy+hy,cz-hz)],
         Vec3::new(0.0, 0.0, -1.0)),
        // +Y
        ([Vec3::new(cx-hx,cy+hy,cz+hz), Vec3::new(cx+hx,cy+hy,cz+hz),
          Vec3::new(cx+hx,cy+hy,cz-hz), Vec3::new(cx-hx,cy+hy,cz-hz)],
         Vec3::new(0.0, 1.0, 0.0)),
        // -Y
        ([Vec3::new(cx-hx,cy-hy,cz-hz), Vec3::new(cx+hx,cy-hy,cz-hz),
          Vec3::new(cx+hx,cy-hy,cz+hz), Vec3::new(cx-hx,cy-hy,cz+hz)],
         Vec3::new(0.0, -1.0, 0.0)),
        // +X
        ([Vec3::new(cx+hx,cy-hy,cz+hz), Vec3::new(cx+hx,cy-hy,cz-hz),
          Vec3::new(cx+hx,cy+hy,cz-hz), Vec3::new(cx+hx,cy+hy,cz+hz)],
         Vec3::new(1.0, 0.0, 0.0)),
        // -X
        ([Vec3::new(cx-hx,cy-hy,cz-hz), Vec3::new(cx-hx,cy-hy,cz+hz),
          Vec3::new(cx-hx,cy+hy,cz+hz), Vec3::new(cx-hx,cy+hy,cz-hz)],
         Vec3::new(-1.0, 0.0, 0.0)),
    ];

    let polygons: Vec<CsgPolygon> = faces.iter().map(|(pts, normal)| {
        let verts: Vec<CsgVertex> = pts.iter().map(|&p| {
            let uv = box_uv(p, *normal, sx, sy, sz);
            CsgVertex::new(p, *normal, uv)
        }).collect();
        CsgPolygon::new(verts, 0)
    }).collect();

    make_csg(polygons).to_mesh_data()
}

/// Cylinder / cone along Y axis.
/// `radius_top` == `radius` → cylinder; `radius_top` < `radius` → cone.
pub fn build_cylinder(
    cx: f32, cy: f32, cz: f32,
    radius: f32, height: f32,
    slices: u32,
    radius_top: f32,
) -> CsgMeshData {
    let hy = height * 0.5;
    let mut polygons = Vec::with_capacity(slices as usize * 3);

    for i in 0..slices {
        let a0 = 2.0 * PI * i as f32 / slices as f32;
        let a1 = 2.0 * PI * ((i + 1) % slices) as f32 / slices as f32;
        let (cos0, sin0) = (a0.cos(), a0.sin());
        let (cos1, sin1) = (a1.cos(), a1.sin());

        let b0 = Vec3::new(cx + cos0 * radius,     cy - hy, cz + sin0 * radius);
        let b1 = Vec3::new(cx + cos1 * radius,     cy - hy, cz + sin1 * radius);
        let bc = Vec3::new(cx,                     cy - hy, cz);
        let t0 = Vec3::new(cx + cos0 * radius_top, cy + hy, cz + sin0 * radius_top);
        let t1 = Vec3::new(cx + cos1 * radius_top, cy + hy, cz + sin1 * radius_top);
        let tc = Vec3::new(cx,                     cy + hy, cz);

        let n_down = Vec3::new(0.0, -1.0, 0.0);
        let n_up   = Vec3::new(0.0,  1.0, 0.0);
        let sn0    = Vec3::new(cos0, 0.0, sin0).normalize();
        let sn1    = Vec3::new(cos1, 0.0, sin1).normalize();
        let u0 = i as f32 / slices as f32;
        let u1 = (i + 1) as f32 / slices as f32;

        // Bottom cap (CCW from below → normal -Y)
        polygons.push(CsgPolygon::new(vec![
            CsgVertex::new(bc, n_down, Vec2::new(0.5, 0.5)),
            CsgVertex::new(b0, n_down, Vec2::new(0.5 + cos0 * 0.5, 0.5 + sin0 * 0.5)),
            CsgVertex::new(b1, n_down, Vec2::new(0.5 + cos1 * 0.5, 0.5 + sin1 * 0.5)),
        ], 0));

        // Top cap — omit when radius_top is near zero (cone tip) to avoid
        // degenerate zero-normal polygons that break BSP splitting.
        if radius_top > 1e-4 {
            polygons.push(CsgPolygon::new(vec![
                CsgVertex::new(tc, n_up, Vec2::new(0.5, 0.5)),
                CsgVertex::new(t1, n_up, Vec2::new(0.5 + cos1 * 0.5, 0.5 + sin1 * 0.5)),
                CsgVertex::new(t0, n_up, Vec2::new(0.5 + cos0 * 0.5, 0.5 + sin0 * 0.5)),
            ], 0));
        }

        // Side quad
        polygons.push(CsgPolygon::new(vec![
            CsgVertex::new(b1, sn1, Vec2::new(u1, 0.0)),
            CsgVertex::new(b0, sn0, Vec2::new(u0, 0.0)),
            CsgVertex::new(t0, sn0, Vec2::new(u0, 1.0)),
            CsgVertex::new(t1, sn1, Vec2::new(u1, 1.0)),
        ], 0));
    }

    make_csg(polygons).to_mesh_data()
}

/// UV sphere centered at (cx, cy, cz).
pub fn build_sphere(cx: f32, cy: f32, cz: f32, radius: f32, slices: u32, stacks: u32) -> CsgMeshData {
    let mut polygons: Vec<CsgPolygon> = Vec::new();

    for i in 0..slices {
        for j in 0..stacks {
            let mk = |ii: u32, jj: u32| -> CsgVertex {
                let theta = (ii as f32 / slices as f32) * PI * 2.0;
                let phi   = (jj as f32 / stacks as f32) * PI;
                let dir = Vec3::new(
                    phi.sin() * theta.cos(),
                    phi.cos(),
                    phi.sin() * theta.sin(),
                );
                CsgVertex::new(
                    Vec3::new(cx + dir.x * radius, cy + dir.y * radius, cz + dir.z * radius),
                    dir.normalize(),
                    Vec2::new(ii as f32 / slices as f32, jj as f32 / stacks as f32),
                )
            };

            let mut verts = Vec::with_capacity(4);
            verts.push(mk(i, j));
            if j > 0          { verts.push(mk(i + 1, j)); }
            if j < stacks - 1 { verts.push(mk(i + 1, j + 1)); }
            verts.push(mk(i, j + 1));

            if verts.len() >= 3 {
                polygons.push(CsgPolygon::new(verts, 0));
            }
        }
    }

    make_csg(polygons).to_mesh_data()
}

/// Wedge (ramp) — half of a box cut diagonally along local Z.
pub fn build_wedge(cx: f32, cy: f32, cz: f32, sx: f32, sy: f32, sz: f32) -> CsgMeshData {
    let (hx, hy, hz) = (sx * 0.5, sy * 0.5, sz * 0.5);

    let p0 = Vec3::new(cx-hx, cy-hy, cz-hz);
    let p1 = Vec3::new(cx+hx, cy-hy, cz-hz);
    let p2 = Vec3::new(cx+hx, cy-hy, cz+hz);
    let p3 = Vec3::new(cx-hx, cy-hy, cz+hz);
    let p4 = Vec3::new(cx+hx, cy+hy, cz-hz);
    let p5 = Vec3::new(cx-hx, cy+hy, cz-hz);

    let make_face = |pts: &[Vec3]| -> CsgPolygon {
        let n = pts[1].sub(pts[0]).cross(pts[2].sub(pts[0])).normalize();
        let verts: Vec<CsgVertex> = pts.iter().enumerate().map(|(i, &p)| {
            let u = if i == 0 || i == 3 { 0.0_f32 } else { 1.0_f32 };
            let v = if i < 2            { 0.0_f32 } else { 1.0_f32 };
            CsgVertex::new(p, n, Vec2::new(u, v))
        }).collect();
        CsgPolygon::new(verts, 0)
    };

    let polygons = vec![
        make_face(&[p0, p1, p2, p3]), // bottom
        make_face(&[p5, p4, p1, p0]), // back
        make_face(&[p3, p5, p0]),     // left triangle
        make_face(&[p4, p2, p1]),     // right triangle
        make_face(&[p2, p4, p5, p3]), // slope
    ];

    make_csg(polygons).to_mesh_data()
}

/// Staircase — N steps unioned together using the Rust BSP.
pub fn build_stairs(cx: f32, cy: f32, cz: f32, sx: f32, sy: f32, sz: f32, steps: u32) -> CsgMeshData {
    let steps = steps.max(1);
    let step_h = sy / steps as f32;
    let step_d = sz / steps as f32;

    let mut result: Option<Csg> = None;
    for i in 0..steps {
        let step_y = cy - sy * 0.5 + step_h * i as f32 + step_h * 0.5;
        let step_z = cz - sz * 0.5 + step_d * i as f32 + step_d * 0.5;
        let step_csg = build_box(cx, step_y, step_z, sx, step_h, step_d).to_csg();
        result = Some(match result {
            None      => step_csg,
            Some(acc) => acc.union(step_csg),
        });
    }
    result.unwrap_or_default().to_mesh_data()
}

/// Arch — box with a semicircular hole subtracted from it.
pub fn build_arch(
    cx: f32, cy: f32, cz: f32,
    sx: f32, sy: f32, sz: f32,
    arch_radius: f32,
    segments: u32,
) -> CsgMeshData {
    let outer  = build_box(cx, cy, cz, sx, sy, sz).to_csg();
    let cutter = build_cylinder(
        cx, cy - sy * 0.5 + arch_radius, cz,
        arch_radius, sz + 0.01, segments, arch_radius,
    ).to_csg();
    outer.subtract(cutter).to_mesh_data()
}

// ── UV Transform ──────────────────────────────────────────────────────────────

/// Scale and offset all UV coordinates in a CsgMeshData.
/// newU = u * scale_x + offset_x
/// newV = v * scale_y + offset_y
pub fn apply_uv_transform(
    mut mesh: CsgMeshData,
    scale_x: f32,
    scale_y: f32,
    offset_x: f32,
    offset_y: f32,
) -> CsgMeshData {
    let uv_count = mesh.uvs.len() / 2;
    for i in 0..uv_count {
        mesh.uvs[i * 2]     = mesh.uvs[i * 2]     * scale_x + offset_x;
        mesh.uvs[i * 2 + 1] = mesh.uvs[i * 2 + 1] * scale_y + offset_y;
    }
    mesh
}

// ── Transform ─────────────────────────────────────────────────────────────────

/// Apply a column-major 4×4 matrix (same layout as THREE.js / glam) to all
/// vertex positions and normals in a CsgMeshData.
pub fn apply_mat4(mut mesh: CsgMeshData, mat: &[f32; 16]) -> CsgMeshData {
    use glam::{Mat3, Mat4, Vec3 as GVec3};

    let m = Mat4::from_cols_array(mat);
    // Normal matrix = inverse-transpose of the upper-left 3×3
    let normal_mat = Mat3::from_mat4(m).inverse().transpose();

    let v_count = mesh.positions.len() / 3;
    for i in 0..v_count {
        let b = i * 3;

        let tp = m.transform_point3(GVec3::new(
            mesh.positions[b], mesh.positions[b + 1], mesh.positions[b + 2],
        ));
        mesh.positions[b]     = tp.x;
        mesh.positions[b + 1] = tp.y;
        mesh.positions[b + 2] = tp.z;

        if mesh.normals.len() > b + 2 {
            let tn = (normal_mat * GVec3::new(
                mesh.normals[b], mesh.normals[b + 1], mesh.normals[b + 2],
            )).normalize();
            mesh.normals[b]     = tn.x;
            mesh.normals[b + 1] = tn.y;
            mesh.normals[b + 2] = tn.z;
        }
    }

    mesh
}
