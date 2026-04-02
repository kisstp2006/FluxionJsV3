// ============================================================
// FluxionJS V3 — Engine Core Tauri Commands
// Thin async wrappers around fluxion-core Rust functions.
// ============================================================

use tauri::command;
use fluxion_core::csg::bridge::{CsgMeshData, csg_operation, PrimitiveRequest, build_primitive};
use fluxion_core::scene::{SceneFileData, load_scene_file, save_scene_file};

/// BSP recursion can get very deep for complex geometry.
/// Run `f` on a dedicated thread with a large stack (64 MB) to avoid overflow.
async fn run_csg<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<T, String>>();
    std::thread::Builder::new()
        .stack_size(64 * 1024 * 1024)
        .spawn(move || { let _ = tx.send(f()); })
        .map_err(|e| format!("Thread spawn error: {e}"))?;
    rx.await.map_err(|_| "CSG thread dropped sender unexpectedly".to_string())?
}

/// Run a CSG boolean operation on two serialized meshes.
/// `op` must be `"union"`, `"subtract"`, or `"intersect"`.
#[command]
pub async fn csg_op(
    a:  CsgMeshData,
    b:  CsgMeshData,
    op: String,
) -> Result<CsgMeshData, String> {
    run_csg(move || csg_operation(a, b, &op)).await
}

/// Batch CSG: apply a sequence of operations against a base mesh.
/// `ops` is an array of `{ op: string, mesh: CsgMeshData }`.
/// Reduces left-to-right so the caller doesn't need multiple round-trips.
#[command]
pub async fn csg_op_batch(
    base: CsgMeshData,
    ops:  Vec<CsgOpEntry>,
) -> Result<CsgMeshData, String> {
    run_csg(move || {
        let mut acc = base;
        for entry in ops {
            acc = csg_operation(acc, entry.mesh, &entry.op)?;
        }
        Ok(acc)
    }).await
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

/// Build a CSG primitive (box, cylinder, sphere, wedge, stairs, arch) and
/// optionally apply a column-major 4×4 transform to it.
/// Returns a `CsgMeshData` ready for boolean operations or direct rendering.
#[command]
pub async fn build_csg_primitive(req: PrimitiveRequest) -> Result<CsgMeshData, String> {
    tokio::task::spawn_blocking(move || build_primitive(req))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
