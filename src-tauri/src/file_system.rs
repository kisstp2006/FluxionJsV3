use tauri::command;
use std::path::Path;
use std::sync::Arc;
use sha2::Digest;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use crate::utils::{DirEntry, FileStat};
use crate::fs::{NativeFs, FileSystem, CopyOptions};

// Helper: convert a FileEntry list to the legacy DirEntry format used by
// the frontend (camelCase, flat path string).
fn to_dir_entries(entries: Vec<crate::fs::FileEntry>) -> Vec<DirEntry> {
    entries
        .into_iter()
        .map(|e| DirEntry {
            name:         e.name,
            is_directory: e.kind.is_directory(),
            path:         e.path.to_string_lossy().into_owned(),
            size:         e.size,
            modified_at:  e.modified_at,
        })
        .collect()
}

// ── Text I/O ─────────────────────────────────────────────────────────────────

#[command]
pub async fn read_file(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<String, String> {
    state.read_text(Path::new(&path)).map_err(|e| e.to_string())
}

#[command]
pub async fn write_file(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
    data:  String,
) -> Result<(), String> {
    state.write_text(Path::new(&path), &data).map_err(|e| e.to_string())
}

// ── Binary I/O (Base64 transport) ────────────────────────────────────────────

#[command]
pub async fn read_binary(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<String, String> {
    let bytes = state.read_bytes(Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&bytes))
}

#[command]
pub async fn write_binary(
    state:       tauri::State<'_, Arc<NativeFs>>,
    path:        String,
    base64_data: String,
) -> Result<(), String> {
    let data = STANDARD.decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {e}"))?;
    state.write_bytes(Path::new(&path), &data).map_err(|e| e.to_string())
}

// ── Directory ─────────────────────────────────────────────────────────────────

#[command]
pub async fn list_dir(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<Vec<DirEntry>, String> {
    let entries = state.list_dir(Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(to_dir_entries(entries))
}

#[command]
pub async fn read_dir(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<Vec<DirEntry>, String> {
    list_dir(state, path).await
}

#[command]
pub async fn mkdir(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<(), String> {
    state.mkdir(Path::new(&path)).map_err(|e| e.to_string())
}

// ── Queries ───────────────────────────────────────────────────────────────────

#[command]
pub async fn exists(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<bool, String> {
    Ok(state.exists(Path::new(&path)))
}

#[command]
pub async fn stat(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<FileStat, String> {
    let s = state.stat(Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(FileStat {
        size:         s.size,
        is_directory: s.kind.is_directory(),
        modified_at:  s.modified_at,
    })
}

#[command]
pub async fn is_file(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<bool, String> {
    Ok(state.is_file(Path::new(&path)))
}

#[command]
pub async fn is_directory(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<bool, String> {
    Ok(state.is_dir(Path::new(&path)))
}

// ── Mutation ──────────────────────────────────────────────────────────────────

#[command]
pub async fn delete_file(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<(), String> {
    state.delete(Path::new(&path)).map_err(|e| e.to_string())
}

#[command]
pub async fn rename(
    state:    tauri::State<'_, Arc<NativeFs>>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    state.rename(Path::new(&old_path), Path::new(&new_path))
        .map_err(|e| e.to_string())
}

#[command]
pub async fn copy(
    state:     tauri::State<'_, Arc<NativeFs>>,
    src_path:  String,
    dest_path: String,
) -> Result<(), String> {
    state.copy_file(
        Path::new(&src_path),
        Path::new(&dest_path),
        &CopyOptions { overwrite: true, skip_existing: false },
    ).map_err(|e| e.to_string())
}

// ── Hashing ───────────────────────────────────────────────────────────────────

#[command]
pub async fn hash_file(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<String, String> {
    let data = state.read_bytes(Path::new(&path)).map_err(|e| e.to_string())?;
    let mut hasher = sha2::Sha256::new();
    hasher.update(&data);
    Ok(format!("{:x}", hasher.finalize()))
}

// ── Convenience ───────────────────────────────────────────────────────────────

#[command]
pub async fn get_file_size(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
) -> Result<u64, String> {
    Ok(state.file_size(Path::new(&path)))
}

// ── Atomic writes ─────────────────────────────────────────────────────────────

#[command]
pub async fn append_file(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
    data:  String,
) -> Result<(), String> {
    state.append_text(Path::new(&path), &data).map_err(|e| e.to_string())
}

#[command]
pub async fn write_file_atomic(
    state: tauri::State<'_, Arc<NativeFs>>,
    path:  String,
    data:  String,
) -> Result<(), String> {
    state.write_text_atomic(Path::new(&path), &data).map_err(|e| e.to_string())
}

#[command]
pub async fn write_binary_atomic(
    state:       tauri::State<'_, Arc<NativeFs>>,
    path:        String,
    base64_data: String,
) -> Result<(), String> {
    let data = STANDARD.decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {e}"))?;
    state.write_bytes_atomic(Path::new(&path), &data).map_err(|e| e.to_string())
}

// ── Walk directory ────────────────────────────────────────────────────────────

#[command]
pub async fn walk_dir_cmd(
    state:          tauri::State<'_, Arc<NativeFs>>,
    path:           String,
    recursive:      Option<bool>,
    include_hidden: Option<bool>,
    max_depth:      Option<usize>,
    filter_exts:    Option<Vec<String>>,
) -> Result<Vec<DirEntry>, String> {
    use crate::fs::WalkOptions;
    let opts = WalkOptions {
        include_hidden:   include_hidden.unwrap_or(false),
        max_depth:        if recursive.unwrap_or(true) { max_depth } else { Some(0) },
        filter_extensions: filter_exts.unwrap_or_default(),
    };
    let entries = state.walk_dir(Path::new(&path), &opts).map_err(|e| e.to_string())?;
    Ok(entries.into_iter().map(|e| DirEntry {
        name:         e.name,
        is_directory: e.kind.is_directory(),
        path:         e.path.to_string_lossy().into_owned(),
        size:         e.size,
        modified_at:  e.modified_at,
    }).collect())
}

// ── Platform paths ────────────────────────────────────────────────────────────

#[command]
pub async fn get_temp_dir(
    state: tauri::State<'_, Arc<NativeFs>>,
) -> Result<String, String> {
    Ok(state.temp_dir().to_string_lossy().into_owned())
}
