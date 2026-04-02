mod geom;
mod bsp;
pub mod bridge;
pub mod primitives;

pub use geom::{Csg, CsgPolygon, CsgVertex, CsgPlane, Vec3, Vec2};
pub use bsp::BspNode;
pub use bridge::{CsgMeshData, csg_operation};
pub use primitives::{
    build_box, build_cylinder, build_sphere,
    build_wedge, build_stairs, build_arch,
    apply_mat4,
};
