// ============================================================
// FluxionJS V3 — CSG Core  (BSP-tree Boolean Operations)
// Constructive Solid Geometry for level building / greyboxing
//
// Plane-based BSP with polygon splitting.  Supports union,
// subtract, and intersect.  ezEngine/Quake-brush inspired.
// ============================================================

const EPSILON = 1e-5;

// ── Vector3 (lightweight, no THREE dependency in core) ──

export class Vec3 {
  constructor(public x = 0, public y = 0, public z = 0) {}

  clone(): Vec3 { return new Vec3(this.x, this.y, this.z); }
  negate(): Vec3 { return new Vec3(-this.x, -this.y, -this.z); }

  add(v: Vec3): Vec3 { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v: Vec3): Vec3 { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  scale(s: number): Vec3 { return new Vec3(this.x * s, this.y * s, this.z * s); }

  dot(v: Vec3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v: Vec3): Vec3 {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x,
    );
  }
  length(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  normalize(): Vec3 {
    const l = this.length();
    return l > 0 ? this.scale(1 / l) : new Vec3();
  }
  lerp(v: Vec3, t: number): Vec3 {
    return this.add(v.sub(this).scale(t));
  }
}

// ── UV coords ──

export class Vec2 {
  constructor(public x = 0, public y = 0) {}
  clone(): Vec2 { return new Vec2(this.x, this.y); }
  lerp(v: Vec2, t: number): Vec2 {
    return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
  }
}

// ── Vertex ──

export class CSGVertex {
  constructor(
    public pos: Vec3,
    public normal: Vec3,
    public uv: Vec2 = new Vec2(),
  ) {}

  clone(): CSGVertex {
    return new CSGVertex(this.pos.clone(), this.normal.clone(), this.uv.clone());
  }

  /** Flip winding */
  flip(): void { this.normal = this.normal.negate(); }

  /** Linear interpolation for plane-splitting */
  interpolate(other: CSGVertex, t: number): CSGVertex {
    return new CSGVertex(
      this.pos.lerp(other.pos, t),
      this.normal.lerp(other.normal, t).normalize(),
      this.uv.lerp(other.uv, t),
    );
  }
}

// ── Plane ──

export class CSGPlane {
  constructor(public normal: Vec3, public w: number) {}

  clone(): CSGPlane { return new CSGPlane(this.normal.clone(), this.w); }
  flip(): void { this.normal = this.normal.negate(); this.w = -this.w; }

  static fromPoints(a: Vec3, b: Vec3, c: Vec3): CSGPlane {
    const n = b.sub(a).cross(c.sub(a)).normalize();
    return new CSGPlane(n, n.dot(a));
  }

  /** Classify a single point */
  classify(point: Vec3): number {
    const t = this.normal.dot(point) - this.w;
    return t < -EPSILON ? BACK : t > EPSILON ? FRONT : COPLANAR;
  }

  /**
   * Split polygon by this plane.
   * Populates the four output arrays depending on which side polygon vertices fall on.
   */
  splitPolygon(
    polygon: CSGPolygon,
    coplanarFront: CSGPolygon[],
    coplanarBack: CSGPolygon[],
    front: CSGPolygon[],
    back: CSGPolygon[],
  ): void {
    let polyType = 0;
    const types: number[] = [];

    for (const v of polygon.vertices) {
      const t = this.classify(v.pos);
      polyType |= t;
      types.push(t);
    }

    switch (polyType) {
      case COPLANAR:
        (this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
        break;

      case FRONT:
        front.push(polygon);
        break;

      case BACK:
        back.push(polygon);
        break;

      case SPANNING: {
        const f: CSGVertex[] = [];
        const b: CSGVertex[] = [];

        for (let i = 0; i < polygon.vertices.length; i++) {
          const j = (i + 1) % polygon.vertices.length;
          const ti = types[i];
          const tj = types[j];
          const vi = polygon.vertices[i];
          const vj = polygon.vertices[j];

          if (ti !== BACK) f.push(vi);
          if (ti !== FRONT) b.push(ti !== BACK ? vi.clone() : vi);

          if ((ti | tj) === SPANNING) {
            const denom = this.normal.dot(vj.pos.sub(vi.pos));
            const t = denom !== 0 ? (this.w - this.normal.dot(vi.pos)) / denom : 0;
            const v = vi.interpolate(vj, t);
            f.push(v);
            b.push(v.clone());
          }
        }

        if (f.length >= 3) front.push(new CSGPolygon(f, polygon.shared));
        if (b.length >= 3) back.push(new CSGPolygon(b, polygon.shared));
        break;
      }
    }
  }
}

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3; // FRONT | BACK

// ── Polygon ──

export class CSGPolygon {
  plane: CSGPlane;

  /** shared: per-face material index or metadata */
  constructor(
    public vertices: CSGVertex[],
    public shared: number = 0,
  ) {
    this.plane = CSGPlane.fromPoints(
      vertices[0].pos,
      vertices[1].pos,
      vertices[2].pos,
    );
  }

  clone(): CSGPolygon {
    return new CSGPolygon(
      this.vertices.map(v => v.clone()),
      this.shared,
    );
  }

  flip(): void {
    this.vertices.reverse();
    for (const v of this.vertices) v.flip();
    this.plane.flip();
  }
}

// ── BSP Node ──

class BSPNode {
  plane: CSGPlane | null = null;
  front: BSPNode | null = null;
  back: BSPNode | null = null;
  polygons: CSGPolygon[] = [];

  clone(): BSPNode {
    const node = new BSPNode();
    node.plane = this.plane?.clone() ?? null;
    node.front = this.front?.clone() ?? null;
    node.back = this.back?.clone() ?? null;
    node.polygons = this.polygons.map(p => p.clone());
    return node;
  }

  /** Flip solid ↔ empty */
  invert(): void {
    for (const p of this.polygons) p.flip();
    this.plane?.flip();
    this.front?.invert();
    this.back?.invert();
    const temp = this.front;
    this.front = this.back;
    this.back = temp;
  }

  /** Return all polygons recursively */
  allPolygons(): CSGPolygon[] {
    let polys = this.polygons.slice();
    if (this.front) polys = polys.concat(this.front.allPolygons());
    if (this.back) polys = polys.concat(this.back.allPolygons());
    return polys;
  }

  /** Remove polygons inside this BSP tree */
  clipPolygons(polygons: CSGPolygon[]): CSGPolygon[] {
    if (!this.plane) return polygons.slice();
    let front: CSGPolygon[] = [];
    let back: CSGPolygon[] = [];
    for (const p of polygons) {
      this.plane.splitPolygon(p, front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    if (this.back) back = this.back.clipPolygons(back);
    else back = [];
    return front.concat(back);
  }

  /** Remove polygons inside this BSP tree from the target tree */
  clipTo(bsp: BSPNode): void {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  }

  /** Build BSP tree from polygons */
  build(polygons: CSGPolygon[]): void {
    if (polygons.length === 0) return;
    if (!this.plane) this.plane = polygons[0].plane.clone();
    const front: CSGPolygon[] = [];
    const back: CSGPolygon[] = [];
    for (const p of polygons) {
      this.plane.splitPolygon(p, this.polygons, this.polygons, front, back);
    }
    if (front.length > 0) {
      if (!this.front) this.front = new BSPNode();
      this.front.build(front);
    }
    if (back.length > 0) {
      if (!this.back) this.back = new BSPNode();
      this.back.build(back);
    }
  }
}

// ── CSG Solid ──

export class CSG {
  polygons: CSGPolygon[] = [];

  clone(): CSG {
    const csg = new CSG();
    csg.polygons = this.polygons.map(p => p.clone());
    return csg;
  }

  private toNode(): BSPNode {
    const node = new BSPNode();
    node.build(this.polygons);
    return node;
  }

  private static fromNode(node: BSPNode): CSG {
    const csg = new CSG();
    csg.polygons = node.allPolygons();
    return csg;
  }

  /** A ∪ B */
  union(other: CSG): CSG {
    const a = this.toNode();
    const b = other.toNode();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    return CSG.fromNode(a);
  }

  /** A ∖ B  (subtract B from A) */
  subtract(other: CSG): CSG {
    const a = this.toNode();
    const b = other.toNode();
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    return CSG.fromNode(a);
  }

  /** A ∩ B */
  intersect(other: CSG): CSG {
    const a = this.toNode();
    const b = other.toNode();
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();
    return CSG.fromNode(a);
  }

  /** Flip inside ↔ outside */
  inverse(): CSG {
    const csg = this.clone();
    for (const p of csg.polygons) p.flip();
    return csg;
  }

  // ── Primitive Factories ──

  /** Axis-aligned box centered at origin */
  static box(cx = 0, cy = 0, cz = 0, sx = 1, sy = 1, sz = 1): CSG {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces: [Vec3[], Vec3][] = [
      // [positions CCW from outside, face normal]
      [[new Vec3(cx-hx,cy-hy,cz+hz), new Vec3(cx+hx,cy-hy,cz+hz), new Vec3(cx+hx,cy+hy,cz+hz), new Vec3(cx-hx,cy+hy,cz+hz)], new Vec3(0,0,1)],
      [[new Vec3(cx+hx,cy-hy,cz-hz), new Vec3(cx-hx,cy-hy,cz-hz), new Vec3(cx-hx,cy+hy,cz-hz), new Vec3(cx+hx,cy+hy,cz-hz)], new Vec3(0,0,-1)],
      [[new Vec3(cx-hx,cy+hy,cz+hz), new Vec3(cx+hx,cy+hy,cz+hz), new Vec3(cx+hx,cy+hy,cz-hz), new Vec3(cx-hx,cy+hy,cz-hz)], new Vec3(0,1,0)],
      [[new Vec3(cx-hx,cy-hy,cz-hz), new Vec3(cx+hx,cy-hy,cz-hz), new Vec3(cx+hx,cy-hy,cz+hz), new Vec3(cx-hx,cy-hy,cz+hz)], new Vec3(0,-1,0)],
      [[new Vec3(cx+hx,cy-hy,cz+hz), new Vec3(cx+hx,cy-hy,cz-hz), new Vec3(cx+hx,cy+hy,cz-hz), new Vec3(cx+hx,cy+hy,cz+hz)], new Vec3(1,0,0)],
      [[new Vec3(cx-hx,cy-hy,cz-hz), new Vec3(cx-hx,cy-hy,cz+hz), new Vec3(cx-hx,cy+hy,cz+hz), new Vec3(cx-hx,cy+hy,cz-hz)], new Vec3(-1,0,0)],
    ];
    return CSG.fromFaces(faces, sx, sy, sz);
  }

  /** Cylinder/cone along Y axis */
  static cylinder(cx = 0, cy = 0, cz = 0, radius = 0.5, height = 1, slices = 16, radiusTop?: number): CSG {
    const rTop = radiusTop ?? radius;
    const hy = height / 2;
    const polys: CSGPolygon[] = [];

    for (let i = 0; i < slices; i++) {
      const a0 = (2 * Math.PI * i) / slices;
      const a1 = (2 * Math.PI * ((i + 1) % slices)) / slices;
      const cos0 = Math.cos(a0), sin0 = Math.sin(a0);
      const cos1 = Math.cos(a1), sin1 = Math.sin(a1);

      // Bottom face (y = -hy)
      const b0 = new Vec3(cx + cos0 * radius, cy - hy, cz + sin0 * radius);
      const b1 = new Vec3(cx + cos1 * radius, cy - hy, cz + sin1 * radius);
      const bc = new Vec3(cx, cy - hy, cz);

      // Top face (y = +hy)
      const t0 = new Vec3(cx + cos0 * rTop, cy + hy, cz + sin0 * rTop);
      const t1 = new Vec3(cx + cos1 * rTop, cy + hy, cz + sin1 * rTop);
      const tc = new Vec3(cx, cy + hy, cz);

      const nDown = new Vec3(0, -1, 0);
      const nUp = new Vec3(0, 1, 0);

      // side normal (average of the two edge normals)
      const sn0 = new Vec3(cos0, 0, sin0).normalize();
      const sn1 = new Vec3(cos1, 0, sin1).normalize();

      // bottom cap
      polys.push(new CSGPolygon([
        new CSGVertex(bc.clone(), nDown, new Vec2(0.5, 0.5)),
        new CSGVertex(b1.clone(), nDown, new Vec2(0.5 + cos1 * 0.5, 0.5 + sin1 * 0.5)),
        new CSGVertex(b0.clone(), nDown, new Vec2(0.5 + cos0 * 0.5, 0.5 + sin0 * 0.5)),
      ]));

      // top cap
      polys.push(new CSGPolygon([
        new CSGVertex(tc.clone(), nUp, new Vec2(0.5, 0.5)),
        new CSGVertex(t0.clone(), nUp, new Vec2(0.5 + cos0 * 0.5, 0.5 + sin0 * 0.5)),
        new CSGVertex(t1.clone(), nUp, new Vec2(0.5 + cos1 * 0.5, 0.5 + sin1 * 0.5)),
      ]));

      // side quad (two triangles)
      const u0 = i / slices, u1 = (i + 1) / slices;
      polys.push(new CSGPolygon([
        new CSGVertex(b0.clone(), sn0.clone(), new Vec2(u0, 0)),
        new CSGVertex(b1.clone(), sn1.clone(), new Vec2(u1, 0)),
        new CSGVertex(t1.clone(), sn1.clone(), new Vec2(u1, 1)),
        new CSGVertex(t0.clone(), sn0.clone(), new Vec2(u0, 1)),
      ]));
    }

    const csg = new CSG();
    csg.polygons = polys;
    return csg;
  }

  /** Sphere at origin */
  static sphere(cx = 0, cy = 0, cz = 0, radius = 0.5, slices = 16, stacks = 8): CSG {
    const polys: CSGPolygon[] = [];
    for (let i = 0; i < slices; i++) {
      for (let j = 0; j < stacks; j++) {
        const verts: CSGVertex[] = [];
        const vertex = (ii: number, jj: number): CSGVertex => {
          const theta = (ii / slices) * Math.PI * 2;
          const phi = (jj / stacks) * Math.PI;
          const dir = new Vec3(
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta),
          );
          return new CSGVertex(
            new Vec3(cx + dir.x * radius, cy + dir.y * radius, cz + dir.z * radius),
            dir,
            new Vec2(ii / slices, jj / stacks),
          );
        };
        verts.push(vertex(i, j));
        if (j > 0) verts.push(vertex(i + 1, j));
        if (j < stacks - 1) verts.push(vertex(i + 1, j + 1));
        verts.push(vertex(i, j + 1));
        polys.push(new CSGPolygon(verts));
      }
    }
    const csg = new CSG();
    csg.polygons = polys;
    return csg;
  }

  /** Wedge (ramp / stairs step) — half of a box cut diagonally along the local Z axis */
  static wedge(cx = 0, cy = 0, cz = 0, sx = 1, sy = 1, sz = 1): CSG {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    // 5-face wedge: bottom, two sides, back, slope
    const n = (a: Vec3, b: Vec3, c: Vec3) => b.sub(a).cross(c.sub(a)).normalize();

    const p0 = new Vec3(cx - hx, cy - hy, cz - hz);
    const p1 = new Vec3(cx + hx, cy - hy, cz - hz);
    const p2 = new Vec3(cx + hx, cy - hy, cz + hz);
    const p3 = new Vec3(cx - hx, cy - hy, cz + hz);
    const p4 = new Vec3(cx + hx, cy + hy, cz - hz);
    const p5 = new Vec3(cx - hx, cy + hy, cz - hz);

    const polys: CSGPolygon[] = [];
    const face = (pts: Vec3[], shared = 0) => {
      const normal = n(pts[0], pts[1], pts[2]);
      polys.push(new CSGPolygon(
        pts.map((p, i) => {
          const u = i === 0 || i === 3 ? 0 : 1;
          const v = i < 2 ? 0 : 1;
          return new CSGVertex(p.clone(), normal.clone(), new Vec2(u, v));
        }),
        shared,
      ));
    };

    face([p3, p2, p1, p0]); // bottom
    face([p0, p1, p4, p5]); // back
    face([p0, p5, p3]);     // left tri
    face([p1, p2, p4]);     // right tri
    face([p3, p5, p4, p2]); // slope

    const csg = new CSG();
    csg.polygons = polys;
    return csg;
  }

  /** Staircase — n steps */
  static stairs(cx = 0, cy = 0, cz = 0, sx = 1, sy = 1, sz = 1, steps = 4): CSG {
    const stepH = sy / steps;
    const stepD = sz / steps;
    let result: CSG | null = null;
    for (let i = 0; i < steps; i++) {
      const stepY = cy - sy / 2 + stepH * i + stepH / 2;
      const stepZ = cz - sz / 2 + stepD * i + stepD / 2;
      const step = CSG.box(cx, stepY, stepZ, sx, stepH, stepD);
      result = result ? result.union(step) : step;
    }
    return result ?? new CSG();
  }

  /** Arch — box with a semicircular hole cut out */
  static arch(cx = 0, cy = 0, cz = 0, sx = 1, sy = 1, sz = 1, archRadius?: number, segments = 12): CSG {
    const r = archRadius ?? Math.min(sx, sy) * 0.4;
    const outer = CSG.box(cx, cy, cz, sx, sy, sz);
    const cutter = CSG.cylinder(cx, cy - sy / 2 + r, cz, r, sz + 0.01, segments);
    return outer.subtract(cutter);
  }

  // ── Helper for box face UV generation ──
  private static fromFaces(faces: [Vec3[], Vec3][], sx: number, sy: number, sz: number): CSG {
    const polys: CSGPolygon[] = [];
    for (const [positions, normal] of faces) {
      const verts = positions.map((p, _i) => {
        // Generate UVs based on face normal axis
        let u = 0, v = 0;
        const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
        if (ax >= ay && ax >= az) {
          u = (p.z / sz + 0.5);
          v = (p.y / sy + 0.5);
        } else if (ay >= ax && ay >= az) {
          u = (p.x / sx + 0.5);
          v = (p.z / sz + 0.5);
        } else {
          u = (p.x / sx + 0.5);
          v = (p.y / sy + 0.5);
        }
        return new CSGVertex(p.clone(), normal.clone(), new Vec2(u, v));
      });
      polys.push(new CSGPolygon(verts));
    }
    const csg = new CSG();
    csg.polygons = polys;
    return csg;
  }
}
