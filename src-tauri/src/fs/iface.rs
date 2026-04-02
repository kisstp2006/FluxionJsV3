// ============================================================
// FluxionJS V3 — Engine Filesystem API
// FileSystem trait — the core abstraction
// ============================================================

use std::path::{Path, PathBuf};
use super::{FsResult, FileEntry, FileStat, WalkOptions, CopyOptions};

/// Cross-platform filesystem abstraction for the Fluxion engine.
///
/// All implementations must be `Send + Sync` so they can be shared
/// safely across threads and stored as Tauri managed state.
///
/// # Platform targets
/// - **Windows** — full NTFS / ReFS access
/// - **macOS**   — HFS+ / APFS access (sandboxed in App Store builds)
/// - **Linux**   — any POSIX filesystem
/// - **Android** — app-internal storage via the sandbox; external
///                 storage through the Storage Access Framework
///                 is handled at the Tauri command layer.
pub trait FileSystem: Send + Sync {

    // ── Text I/O ──────────────────────────────────────────────────────────

    /// Read the entire file at `path` as a UTF-8 string.
    fn read_text(&self, path: &Path) -> FsResult<String>;

    /// Write `text` to `path`, creating the file and any missing parent
    /// directories.  Truncates any existing content.
    fn write_text(&self, path: &Path, text: &str) -> FsResult<()>;

    /// Append `text` to `path`, creating the file if it does not exist.
    fn append_text(&self, path: &Path, text: &str) -> FsResult<()>;

    // ── Binary I/O ────────────────────────────────────────────────────────

    /// Read the entire file at `path` as raw bytes.
    fn read_bytes(&self, path: &Path) -> FsResult<Vec<u8>>;

    /// Write `data` to `path`, creating the file and any missing parent
    /// directories.  Truncates any existing content.
    fn write_bytes(&self, path: &Path, data: &[u8]) -> FsResult<()>;

    // ── Atomic writes ────────────────────────────────────────────────────
    // Write to a temporary file first, then rename atomically.
    // Prevents half-written files on crash.

    /// Atomically write `text` to `path` (write-to-temp, then rename).
    fn write_text_atomic(&self, path: &Path, text: &str) -> FsResult<()>;

    /// Atomically write `data` to `path` (write-to-temp, then rename).
    fn write_bytes_atomic(&self, path: &Path, data: &[u8]) -> FsResult<()>;

    // ── Directory ─────────────────────────────────────────────────────────

    /// Return the immediate children of `path`.
    fn list_dir(&self, path: &Path) -> FsResult<Vec<FileEntry>>;

    /// Recursively enumerate all files and directories under `path`,
    /// applying the given `options`.
    fn walk_dir(&self, path: &Path, options: &WalkOptions) -> FsResult<Vec<FileEntry>>;

    /// Create `path` and all missing parent directories.
    fn mkdir(&self, path: &Path) -> FsResult<()>;

    // ── Queries ───────────────────────────────────────────────────────────

    /// Return `true` if `path` exists (file, directory, or symlink).
    fn exists(&self, path: &Path) -> bool;

    /// Return `true` if `path` is an existing regular file.
    fn is_file(&self, path: &Path) -> bool;

    /// Return `true` if `path` is an existing directory.
    fn is_dir(&self, path: &Path) -> bool;

    /// Return full metadata for `path`.
    fn stat(&self, path: &Path) -> FsResult<FileStat>;

    // ── Mutation ──────────────────────────────────────────────────────────

    /// Delete `path`.  For directories, removes the entire tree recursively.
    fn delete(&self, path: &Path) -> FsResult<()>;

    /// Move / rename `from` to `to`, creating missing parent directories
    /// in the destination.
    fn rename(&self, from: &Path, to: &Path) -> FsResult<()>;

    /// Copy a single file from `from` to `to`.
    fn copy_file(&self, from: &Path, to: &Path, opts: &CopyOptions) -> FsResult<()>;

    /// Recursively copy the directory tree rooted at `from` into `to`.
    fn copy_dir(&self, from: &Path, to: &Path, opts: &CopyOptions) -> FsResult<()>;

    // ── Platform directories ──────────────────────────────────────────────

    /// Returns the platform-specific directory for persistent app data.
    ///
    /// | Platform | Typical path |
    /// |----------|-------------|
    /// | Windows  | `%APPDATA%\<app>` |
    /// | macOS    | `~/Library/Application Support/<app>` |
    /// | Linux    | `$HOME/.local/share/<app>` |
    /// | Android  | `/data/data/<package>/files` |
    fn app_data_dir(&self) -> FsResult<PathBuf>;

    /// Returns the OS temporary directory.
    ///
    /// On Android this falls back to the app's internal cache directory
    /// because `std::env::temp_dir()` may not be writable.
    fn temp_dir(&self) -> PathBuf;

    // ── Convenience helpers ───────────────────────────────────────────────
    // Default implementations built on the required methods above.

    /// Read a JSON file and deserialize it into `T`.
    fn read_json<T: serde::de::DeserializeOwned>(&self, path: &Path) -> FsResult<T> {
        let text = self.read_text(path)?;
        serde_json::from_str(&text)
            .map_err(|e| super::FsError::Other(format!("JSON parse error in {}: {e}", path.display())))
    }

    /// Serialize `value` to pretty-printed JSON and write it atomically.
    fn write_json<T: serde::Serialize>(&self, path: &Path, value: &T) -> FsResult<()> {
        let text = serde_json::to_string_pretty(value)
            .map_err(|e| super::FsError::Other(format!("JSON serialize error: {e}")))?;
        self.write_text_atomic(path, &text)
    }

    /// Ensure a directory exists, creating it if necessary.
    fn ensure_dir(&self, path: &Path) -> FsResult<()> {
        if !self.exists(path) {
            self.mkdir(path)?;
        }
        Ok(())
    }

    /// Return the size of a file in bytes, or 0 if the path does not exist.
    fn file_size(&self, path: &Path) -> u64 {
        self.stat(path).map(|s| s.size).unwrap_or(0)
    }
}
