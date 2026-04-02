// ============================================================
// fluxion-core — BSP Tree
// Ported from BSPNode in src/csg/CSGCore.ts
// ============================================================

use super::geom::{CsgPlane, CsgPolygon};

pub struct BspNode {
    plane:    Option<CsgPlane>,
    front:    Option<Box<BspNode>>,
    back:     Option<Box<BspNode>>,
    polygons: Vec<CsgPolygon>,
}

impl BspNode {
    pub fn new() -> Self {
        BspNode { plane: None, front: None, back: None, polygons: Vec::new() }
    }

    /// Build a BSP tree from a polygon list.
    pub fn from_polygons(polygons: Vec<CsgPolygon>) -> Self {
        let mut node = BspNode::new();
        node.build(polygons);
        node
    }

    /// Flip solid ↔ empty (invert all winding + swap front/back subtrees).
    pub fn invert(&mut self) {
        for p in &mut self.polygons { p.flip(); }
        if let Some(ref mut pl) = self.plane { pl.flip(); }
        if let Some(ref mut f) = self.front { f.invert(); }
        if let Some(ref mut b) = self.back  { b.invert(); }
        std::mem::swap(&mut self.front, &mut self.back);
    }

    /// Collect all polygons in this node and its children.
    pub fn all_polygons(&self) -> Vec<CsgPolygon> {
        let mut result = self.polygons.clone();
        if let Some(ref f) = self.front { result.extend(f.all_polygons()); }
        if let Some(ref b) = self.back  { result.extend(b.all_polygons()); }
        result
    }

    /// Remove all polygons inside `other` BSP tree from this tree.
    pub fn clip_to(&mut self, other: &BspNode) {
        self.polygons = other.clip_polygons(std::mem::take(&mut self.polygons));
        if let Some(ref mut f) = self.front { f.clip_to(other); }
        if let Some(ref mut b) = self.back  { b.clip_to(other); }
    }

    /// Return the subset of `polygons` that are outside this BSP tree.
    pub fn clip_polygons(&self, polygons: Vec<CsgPolygon>) -> Vec<CsgPolygon> {
        if self.plane.is_none() {
            return polygons;
        }
        let plane = self.plane.unwrap();
        let mut front_list: Vec<CsgPolygon> = Vec::new();
        let mut back_list:  Vec<CsgPolygon> = Vec::new();

        let mut coplanar_front: Vec<CsgPolygon> = Vec::new();
        let mut coplanar_back:  Vec<CsgPolygon> = Vec::new();

        for p in polygons {
            plane.split_polygon(&p, &mut coplanar_front, &mut coplanar_back, &mut front_list, &mut back_list);
        }
        // Coplanar-front → front bucket; coplanar-back → back bucket
        front_list.extend(coplanar_front);
        back_list.extend(coplanar_back);

        let mut front_out = match &self.front {
            Some(f) => f.clip_polygons(front_list),
            None    => front_list,
        };

        let back_out = match &self.back {
            Some(b) => b.clip_polygons(back_list),
            None    => Vec::new(), // discard: inside solid
        };

        front_out.extend(back_out);
        front_out
    }

    /// Build / extend the BSP tree with more polygons.
    pub fn build(&mut self, polygons: Vec<CsgPolygon>) {
        if polygons.is_empty() { return; }

        if self.plane.is_none() {
            self.plane = Some(polygons[0].plane);
        }
        let plane = self.plane.unwrap();

        let mut front_list: Vec<CsgPolygon> = Vec::new();
        let mut back_list:  Vec<CsgPolygon> = Vec::new();

        let mut coplanar_front: Vec<CsgPolygon> = Vec::new();
        let mut coplanar_back:  Vec<CsgPolygon> = Vec::new();

        for p in polygons {
            plane.split_polygon(
                &p,
                &mut coplanar_front,
                &mut coplanar_back,
                &mut front_list,
                &mut back_list,
            );
        }
        // Both coplanar variants belong to this node's polygon list
        self.polygons.extend(coplanar_front);
        self.polygons.extend(coplanar_back);

        if !front_list.is_empty() {
            self.front
                .get_or_insert_with(|| Box::new(BspNode::new()))
                .build(front_list);
        }
        if !back_list.is_empty() {
            self.back
                .get_or_insert_with(|| Box::new(BspNode::new()))
                .build(back_list);
        }
    }
}
