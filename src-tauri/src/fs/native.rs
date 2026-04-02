// ============================================================
// FluxionJS V3 — Engine Filesystem API
// NativeFs — cross-platform implementation
//
// Platform support:
//   Windows  — std::fs, NTFS/ReFS paths
//   macOS    — std::fs, HFS+/APFS paths
//   Linux    — std::fs, any POSIX FS
//   Android  — std::fs inside the app sandbox;
//              temp_dir falls back to app-internal cache
// ============================================================

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use uuid::Uuid;

use super::{
    iface::FileSystem,
    error::{FsError, FsResult},
    types::{FileEntry, FileKind, FileStat, CopyOptions, WalkOptions},
    path_utils,
};

// ── NativeFs ─────────────────────────────────────────────────────────────────

/// Standard OS filesystem backend using `std::fs`.
///
/// Works on Windows, macOS, Linux and Android (within the app sandbox).
pub struct NativeFs {
    app_data_dir: PathBuf,
}

impl NativeFs {
    /// Create a new `NativeFs`.
    ///
    /// `app_data_dir` must be the platform-specific persistent storage
    /// directory for this application (provided by Tauri's path resolver).
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self { app_data_dir }
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

impl NativeFs {
    fn entry_kind(meta: &fs::Metadata) -> FileKind {
        if meta.is_file()       { FileKind::File }
        else if meta.is_dir()   { FileKind::Directory }
        else if meta.is_symlink() { FileKind::Symlink }
        else                    { FileKind::Unknown }
    }

    fn modified_secs(meta: &fs::Metadata) -> u64 {
        meta.modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }

    fn created_secs(meta: &fs::Metadata) -> Option<u64> {
        meta.created()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
    }

    fn accessed_secs(meta: &fs::Metadata) -> Option<u64> {
        meta.accessed()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
    }

    /// Create all missing parent directories for `path`.
    fn ensure_parents(path: &Path) -> FsResult<()> {
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(FsError::from)?;
            }
        }
        Ok(())
    }

    /// Build a `FileEntry` from a directory entry.
    fn make_entry(entry: &fs::DirEntry) -> FsResult<FileEntry> {
        let meta  = entry.metadata().map_err(FsError::from)?;
        let path  = entry.path();
        let name  = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("?")
            .to_string();
        Ok(FileEntry {
            name,
            path,
            kind: Self::entry_kind(&meta),
            size: meta.len(),
            modified_at: Self::modified_secs(&meta),
        })
    }

    fn walk_recursive(
        dir: &Path,
        opts: &WalkOptions,
        depth: usize,
        out: &mut Vec<FileEntry>,
    ) -> FsResult<()> {
        if let Some(max) = opts.max_depth {
            if depth > max {
                return Ok(());
            }
        }
        let entries = fs::read_dir(dir).map_err(FsError::from)?;
        for raw in entries {
            let raw = raw.map_err(FsError::from)?;
            let entry = Self::make_entry(&raw)?;
            // Hidden-file filter
            if !opts.include_hidden && path_utils::is_hidden(&entry.path) {
                continue;
            }
            // Extension filter (applies to files only)
            if entry.kind.is_file() && !opts.filter_extensions.is_empty() {
                let ext = path_utils::extension(&entry.path).unwrap_or_default();
                if !opts.filter_extensions.iter().any(|e| e == &ext) {
                    continue;
                }
            }
            let is_dir = entry.kind.is_directory();
            out.push(entry);
            if is_dir {
                Self::walk_recursive(&raw.path(), opts, depth + 1, out)?;
            }
        }
        Ok(())
    }

    fn copy_dir_recursive(from: &Path, to: &Path, opts: &CopyOptions) -> FsResult<()> {
        fs::create_dir_all(to).map_err(FsError::from)?;
        for raw in fs::read_dir(from).map_err(FsError::from)? {
            let raw = raw.map_err(FsError::from)?;
            let src  = raw.path();
            let dest = to.join(raw.file_name());
            if src.is_dir() {
                Self::copy_dir_recursive(&src, &dest, opts)?;
            } else {
                if dest.exists() {
                    if opts.skip_existing { continue; }
                    if !opts.overwrite    { continue; }
                }
                fs::copy(&src, &dest).map_err(FsError::from)?;
            }
        }
        Ok(())
    }
}

// ── FileSystem impl ───────────────────────────────────────────────────────────

impl FileSystem for NativeFs {

    // ── Text I/O ─────────────────────────────────────────────────────────

    fn read_text(&self, path: &Path) -> FsResult<String> {
        fs::read_to_string(path).map_err(FsError::from)
    }

    fn write_text(&self, path: &Path, text: &str) -> FsResult<()> {
        Self::ensure_parents(path)?;
        fs::write(path, text).map_err(FsError::from)
    }

    fn append_text(&self, path: &Path, text: &str) -> FsResult<()> {
        Self::ensure_parents(path)?;
        let mut file = OpenOptions::new()
            .append(true)
            .create(true)
            .open(path)
            .map_err(FsError::from)?;
        file.write_all(text.as_bytes()).map_err(FsError::from)
    }

    // ── Binary I/O ───────────────────────────────────────────────────────

    fn read_bytes(&self, path: &Path) -> FsResult<Vec<u8>> {
        fs::read(path).map_err(FsError::from)
    }

    fn write_bytes(&self, path: &Path, data: &[u8]) -> FsResult<()> {
        Self::ensure_parents(path)?;
        fs::write(path, data).map_err(FsError::from)
    }

    // ── Atomic writes ─────────────────────────────────────────────────────

    fn write_text_atomic(&self, path: &Path, text: &str) -> FsResult<()> {
        self.write_bytes_atomic(path, text.as_bytes())
    }

    fn write_bytes_atomic(&self, path: &Path, data: &[u8]) -> FsResult<()> {
        Self::ensure_parents(path)?;
        // Write to a sibling temp file, then rename atomically.
        let dir = path.parent().unwrap_or(Path::new("."));
        let tmp_name = format!(".flx_{}.tmp", Uuid::new_v4().as_simple());
        let tmp_path = dir.join(tmp_name);
        fs::write(&tmp_path, data).map_err(FsError::from)?;
        fs::rename(&tmp_path, path).map_err(|e| {
            // Best-effort cleanup if rename fails.
            let _ = fs::remove_file(&tmp_path);
            FsError::from(e)
        })
    }

    // ── Directory ─────────────────────────────────────────────────────────

    fn list_dir(&self, path: &Path) -> FsResult<Vec<FileEntry>> {
        let mut result = Vec::new();
        for raw in fs::read_dir(path).map_err(FsError::from)? {
            let raw = raw.map_err(FsError::from)?;
            result.push(Self::make_entry(&raw)?);
        }
        Ok(result)
    }

    fn walk_dir(&self, path: &Path, options: &WalkOptions) -> FsResult<Vec<FileEntry>> {
        let mut result = Vec::new();
        Self::walk_recursive(path, options, 0, &mut result)?;
        Ok(result)
    }

    fn mkdir(&self, path: &Path) -> FsResult<()> {
        fs::create_dir_all(path).map_err(FsError::from)
    }

    // ── Queries ───────────────────────────────────────────────────────────

    fn exists(&self, path: &Path) -> bool {
        path.exists()
    }

    fn is_file(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn is_dir(&self, path: &Path) -> bool {
        path.is_dir()
    }

    fn stat(&self, path: &Path) -> FsResult<FileStat> {
        let meta = fs::metadata(path).map_err(FsError::from)?;
        Ok(FileStat {
            kind:        Self::entry_kind(&meta),
            size:        meta.len(),
            created_at:  Self::created_secs(&meta),
            modified_at: Self::modified_secs(&meta),
            accessed_at: Self::accessed_secs(&meta),
            readonly:    meta.permissions().readonly(),
        })
    }

    // ── Mutation ──────────────────────────────────────────────────────────

    fn delete(&self, path: &Path) -> FsResult<()> {
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(FsError::from)
        } else {
            fs::remove_file(path).map_err(FsError::from)
        }
    }

    fn rename(&self, from: &Path, to: &Path) -> FsResult<()> {
        Self::ensure_parents(to)?;
        fs::rename(from, to).map_err(FsError::from)
    }

    fn copy_file(&self, from: &Path, to: &Path, opts: &CopyOptions) -> FsResult<()> {
        if to.exists() && !opts.overwrite {
            if opts.skip_existing { return Ok(()); }
            return Err(FsError::AlreadyExists(to.to_path_buf()));
        }
        Self::ensure_parents(to)?;
        fs::copy(from, to)
            .map(|_| ())
            .map_err(FsError::from)
    }

    fn copy_dir(&self, from: &Path, to: &Path, opts: &CopyOptions) -> FsResult<()> {
        Self::copy_dir_recursive(from, to, opts)
    }

    // ── Platform directories ──────────────────────────────────────────────

    fn app_data_dir(&self) -> FsResult<PathBuf> {
        Ok(self.app_data_dir.clone())
    }

    fn temp_dir(&self) -> PathBuf {
        #[cfg(target_os = "android")]
        {
            // std::env::temp_dir() may not be writable inside Android sandbox.
            // Use a sub-directory of the app data dir as a reliable alternative.
            self.app_data_dir.join("__tmp__")
        }
        #[cfg(not(target_os = "android"))]
        {
            std::env::temp_dir()
        }
    }
}
