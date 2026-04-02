// ============================================================
// FluxionJS V3 — Engine Filesystem API
// Module root — public re-exports
// ============================================================

pub mod error;
pub mod types;
pub mod iface;
pub mod path_utils;
pub mod native;

pub use error::{FsError, FsResult};
pub use types::{FileEntry, FileStat, FileKind, CopyOptions, WalkOptions};
pub use iface::FileSystem;
pub use native::NativeFs;
pub use path_utils as paths;
