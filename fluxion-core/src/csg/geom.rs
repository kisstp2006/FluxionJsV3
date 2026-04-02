// ============================================================
// fluxion-core — CSG Geometry Primitives
// Ported from src/csg/CSGCore.ts
// ============================================================

pub const EPSILON: f32 = 1e-5;

pub const COPLANAR: u8 = 0;
pub const FRONT:    u8 = 1;
pub const BACK:     u8 = 2;
pub const SPANNING: u8 = 3;

// ── Vec3 ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    #[inline] pub fn new(x: f32, y: f32, z: f32) -> Self { Vec3 { x, y, z } }
    #[inline] pub fn zero() -> Self { Vec3::new(0.0, 0.0, 0.0) }

    #[inline] pub fn negate(self) -> Self { Vec3::new(-self.x, -self.y, -self.z) }
    #[inline] pub fn add(self, v: Vec3) -> Vec3 { Vec3::new(self.x + v.x, self.y + v.y, self.z + v.z) }
    #[inline] pub fn sub(self, v: Vec3) -> Vec3 { Vec3::new(self.x - v.x, self.y - v.y, self.z - v.z) }
    #[inline] pub fn scale(self, s: f32) -> Vec3 { Vec3::new(self.x * s, self.y * s, self.z * s) }
    #[inline] pub fn dot(self, v: Vec3) -> f32 { self.x * v.x + self.y * v.y + self.z * v.z }

    #[inline]
    pub fn cross(self, v: Vec3) -> Vec3 {
        Vec3::new(
            self.y * v.z - self.z * v.y,
            self.z * v.x - self.x * v.z,
            self.x * v.y - self.y * v.x,
        )
    }

    #[inline]
    pub fn length_sq(self) -> f32 { self.x * self.x + self.y * self.y + self.z * self.z }

    #[inline]
    pub fn length(self) -> f32 { self.length_sq().sqrt() }

    #[inline]
    pub fn normalize(self) -> Vec3 {
        let l = self.length();
        if l > 0.0 { self.scale(1.0 / l) } else { Vec3::zero() }
    }

    #[inline]
    pub fn lerp(self, v: Vec3, t: f32) -> Vec3 {
        self.add(v.sub(self).scale(t))
    }
}

// ── Vec2 ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    #[inline] pub fn new(x: f32, y: f32) -> Self { Vec2 { x, y } }
    #[inline] pub fn zero() -> Self { Vec2::new(0.0, 0.0) }

    #[inline]
    pub fn lerp(self, v: Vec2, t: f32) -> Vec2 {
        Vec2::new(self.x + (v.x - self.x) * t, self.y + (v.y - self.y) * t)
    }
}

// ── CsgVertex ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CsgVertex {
    pub pos:    Vec3,
    pub normal: Vec3,
    pub uv:     Vec2,
}

impl CsgVertex {
    #[inline]
    pub fn new(pos: Vec3, normal: Vec3, uv: Vec2) -> Self {
        CsgVertex { pos, normal, uv }
    }

    pub fn flip(&mut self) {
        self.normal = self.normal.negate();
    }

    pub fn interpolate(&self, other: &CsgVertex, t: f32) -> CsgVertex {
        CsgVertex {
            pos:    self.pos.lerp(other.pos, t),
            normal: self.normal.lerp(other.normal, t).normalize(),
            uv:     self.uv.lerp(other.uv, t),
        }
    }
}

// ── CsgPlane ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
pub struct CsgPlane {
    pub normal: Vec3,
    pub w:      f32,
}

impl CsgPlane {
    #[inline]
    pub fn new(normal: Vec3, w: f32) -> Self { CsgPlane { normal, w } }

    pub fn from_points(a: Vec3, b: Vec3, c: Vec3) -> Self {
        let n = b.sub(a).cross(c.sub(a)).normalize();
        CsgPlane::new(n, n.dot(a))
    }

    pub fn flip(&mut self) {
        self.normal = self.normal.negate();
        self.w = -self.w;
    }

    #[inline]
    pub fn classify_point(&self, point: Vec3) -> u8 {
        let t = self.normal.dot(point) - self.w;
        if t < -EPSILON { BACK } else if t > EPSILON { FRONT } else { COPLANAR }
    }

    /// Split polygon by this plane into up to four output lists.
    /// Mirrors CSGPlane.splitPolygon() in CSGCore.ts exactly.
    pub fn split_polygon(
        &self,
        polygon: &CsgPolygon,
        coplanar_front: &mut Vec<CsgPolygon>,
        coplanar_back:  &mut Vec<CsgPolygon>,
        front:          &mut Vec<CsgPolygon>,
        back:           &mut Vec<CsgPolygon>,
    ) {
        let mut poly_type: u8 = 0;
        let n = polygon.vertices.len();
        let mut types = Vec::with_capacity(n);

        for v in &polygon.vertices {
            let t = self.classify_point(v.pos);
            poly_type |= t;
            types.push(t);
        }

        match poly_type {
            COPLANAR => {
                if self.normal.dot(polygon.plane.normal) > 0.0 {
                    coplanar_front.push(polygon.clone());
                } else {
                    coplanar_back.push(polygon.clone());
                }
            }
            FRONT => front.push(polygon.clone()),
            BACK  => back.push(polygon.clone()),
            _     => {
                // SPANNING — split the polygon
                let mut f: Vec<CsgVertex> = Vec::new();
                let mut b: Vec<CsgVertex> = Vec::new();

                for i in 0..n {
                    let j  = (i + 1) % n;
                    let ti = types[i];
                    let tj = types[j];
                    let vi = &polygon.vertices[i];
                    let vj = &polygon.vertices[j];

                    if ti != BACK  { f.push(vi.clone()); }
                    if ti != FRONT { b.push(vi.clone()); }

                    if (ti | tj) == SPANNING {
                        let denom = self.normal.dot(vj.pos.sub(vi.pos));
                        let t = if denom.abs() > 1e-10 {
                            (self.w - self.normal.dot(vi.pos)) / denom
                        } else {
                            0.0
                        };
                        let v = vi.interpolate(vj, t);
                        f.push(v.clone());
                        b.push(v);
                    }
                }

                if f.len() >= 3 { front.push(CsgPolygon::new(f, polygon.shared)); }
                if b.len() >= 3 { back.push(CsgPolygon::new(b, polygon.shared)); }
            }
        }
    }
}

// ── CsgPolygon ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CsgPolygon {
    pub vertices: Vec<CsgVertex>,
    pub plane:    CsgPlane,
    pub shared:   u32,
}

impl CsgPolygon {
    pub fn new(vertices: Vec<CsgVertex>, shared: u32) -> Self {
        let plane = CsgPlane::from_points(
            vertices[0].pos,
            vertices[1].pos,
            vertices[2].pos,
        );
        CsgPolygon { vertices, plane, shared }
    }

    pub fn flip(&mut self) {
        self.vertices.reverse();
        for v in &mut self.vertices { v.flip(); }
        self.plane.flip();
    }
}

// ── Csg (solid) ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default)]
pub struct Csg {
    pub polygons: Vec<CsgPolygon>,
}

impl Csg {
    pub fn new() -> Self { Csg { polygons: Vec::new() } }

    /// A ∪ B
    pub fn union(self, other: Csg) -> Csg {
        use super::bsp::BspNode;
        let mut a = BspNode::from_polygons(self.polygons);
        let mut b = BspNode::from_polygons(other.polygons);
        a.clip_to(&b);
        b.clip_to(&a);
        b.invert();
        b.clip_to(&a);
        b.invert();
        a.build(b.all_polygons());
        Csg { polygons: a.all_polygons() }
    }

    /// A ∖ B  (subtract B from A)
    pub fn subtract(self, other: Csg) -> Csg {
        use super::bsp::BspNode;
        let mut a = BspNode::from_polygons(self.polygons);
        let mut b = BspNode::from_polygons(other.polygons);
        a.invert();
        a.clip_to(&b);
        b.clip_to(&a);
        b.invert();
        b.clip_to(&a);
        b.invert();
        a.build(b.all_polygons());
        a.invert();
        Csg { polygons: a.all_polygons() }
    }

    /// A ∩ B
    pub fn intersect(self, other: Csg) -> Csg {
        use super::bsp::BspNode;
        let mut a = BspNode::from_polygons(self.polygons);
        let mut b = BspNode::from_polygons(other.polygons);
        a.invert();
        b.clip_to(&a);
        b.invert();
        a.clip_to(&b);
        b.clip_to(&a);
        a.build(b.all_polygons());
        a.invert();
        Csg { polygons: a.all_polygons() }
    }
}
