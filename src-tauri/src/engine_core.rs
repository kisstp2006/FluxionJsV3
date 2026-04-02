// ============================================================
// FluxionJS V3 — Engine Core Tauri Commands
// Thin async wrappers around fluxion-core Rust functions.
// ============================================================

use tauri::command;
use fluxion_core::csg::bridge::{CsgMeshData, csg_operation};
use fluxion_core::scene::{SceneFileData, load_scene_file, save_scene_file};

/// Run a CSG boolean operation on two serialized meshes.
/// `op` must be `"union"`, `"subtract"`, or `"intersect"`.
///
/// Both `a` and `b` are `CsgMeshData` JSON objects.
/// Returns the result as a `CsgMeshData` JSON object.
#[command]
pub async fn csg_op(
    a:  CsgMeshData,
    b:  CsgMeshData,
    op: String,
) -> Result<CsgMeshData, String> {
    // Spawn on a blocking thread so large BSP operations don't stall the async executor.
    tokio::task::spawn_blocking(move || {
        csg_operation(a, b, &op)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Batch CSG: apply a sequence of operations against a base mesh.
/// `ops` is an array of `{ op: string, mesh: CsgMeshData }`.
/// Reduces left-to-right so the caller doesn't need multiple round-trips.
#[command]
pub async fn csg_op_batch(
    base: CsgMeshData,
    ops:  Vec<CsgOpEntry>,
) -> Result<CsgMeshData, String> {
    tokio::task::spawn_blocking(move || {
        let mut acc = base;
        for entry in ops {
            acc = csg_operation(acc, entry.mesh, &entry.op)?;
        }
        Ok(acc)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[derive(serde::Deserialize)]
pub struct CsgOpEntry {
    pub op:   String,
    pub mesh: CsgMeshData,
}

/// Read a scene file from `path`, parse JSON, topologically sort entities
/// (parents before children), and return the validated `SceneFileData`.
#[command]
pub async fn load_scene(path: String) -> Result<SceneFileData, String> {
    tokio::task::spawn_blocking(move || load_scene_file(&path))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

/// Validate `data` and atomically write it as pretty JSON to `path`.
/// Uses a `.tmp` rename to prevent partial writes on crash.
#[command]
pub async fn save_scene(path: String, data: SceneFileData) -> Result<(), String> {
    tokio::task::spawn_blocking(move || save_scene_file(&path, &data))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
