// ============================================================
// FluxionJS V3 — CSG ↔ THREE.js Bridge
// Converts CSG polygons to THREE.BufferGeometry and back.
// ============================================================

import * as THREE from 'three';
import { CSG, CSGVertex, CSGPolygon, Vec3, Vec2 } from './CSGCore';

/**
 * Convert CSG solid to a THREE.BufferGeometry.
 * Triangulates convex n-gon faces via fan triangulation.
 */
export function csgToGeometry(csg: CSG): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let idx = 0;
  for (const poly of csg.polygons) {
    const verts = poly.vertices;
    const base = idx;

    for (const v of verts) {
      positions.push(v.pos.x, v.pos.y, v.pos.z);
      normals.push(v.normal.x, v.normal.y, v.normal.z);
      uvs.push(v.uv.x, v.uv.y);
      idx++;
    }

    // Fan triangulation (polygon is convex)
    for (let i = 2; i < verts.length; i++) {
      indices.push(base, base + i - 1, base + i);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Convert a THREE.BufferGeometry to a CSG solid.
 * Useful for importing external meshes into the CSG pipeline.
 */
export function geometryToCSG(geometry: THREE.BufferGeometry): CSG {
  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();

  const polys: CSGPolygon[] = [];
  const triCount = index ? index.count / 3 : pos.count / 3;

  for (let i = 0; i < triCount; i++) {
    const verts: CSGVertex[] = [];
    for (let j = 0; j < 3; j++) {
      const k = index ? index.getX(i * 3 + j) : i * 3 + j;
      verts.push(new CSGVertex(
        new Vec3(pos.getX(k), pos.getY(k), pos.getZ(k)),
        norm ? new Vec3(norm.getX(k), norm.getY(k), norm.getZ(k)) : new Vec3(0, 1, 0),
        uv ? new Vec2(uv.getX(k), uv.getY(k)) : new Vec2(),
      ));
    }
    polys.push(new CSGPolygon(verts));
  }

  const csg = new CSG();
  csg.polygons = polys;
  return csg;
}
