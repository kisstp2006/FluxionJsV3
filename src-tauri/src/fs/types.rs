// ============================================================
// FluxionJS V3 — Engine Filesystem API
// Shared data types
// ============================================================

use std::path::PathBuf;
use serde::{Deserialize, Serialize};

/// Describes what kind of filesystem node an entry is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileKind {
    File,
    Directory,
    Symlink,
    Unknown,
}

impl FileKind {
    pub fn is_file(&self) -> bool      { matches!(self, FileKind::File) }
    pub fn is_directory(&self) -> bool { matches!(self, FileKind::Directory) }
    pub fn is_symlink(&self) -> bool   { matches!(self, FileKind::Symlink) }
}

/// A single entry returned by `FileSystem::list_dir` or `walk_dir`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    /// Filename only (no parent path).
    pub name: String,
    /// Full absolute path.
    pub path: PathBuf,
    /// Type of this entry.
    pub kind: FileKind,
    /// File size in bytes (0 for directories).
    pub size: u64,
    /// Last-modified time as Unix seconds (0 if unavailable).
    pub modified_at: u64,
}

/// Full metadata for a single path, returned by `FileSystem::stat`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    /// Type of this entry.
    pub kind: FileKind,
    /// Size in bytes.
    pub size: u64,
    /// Creation time as Unix seconds, if the OS provides it.
    pub created_at: Option<u64>,
    /// Last-modified time as Unix seconds.
    pub modified_at: u64,
    /// Last-accessed time as Unix seconds, if the OS provides it.
    pub accessed_at: Option<u64>,
    /// True if the file/directory is read-only.
    pub readonly: bool,
}

/// Options for copy operations.
#[derive(Debug, Clone, Default)]
pub struct CopyOptions {
    /// Overwrite the destination if it already exists.
    pub overwrite: bool,
    /// Skip entries that already exist in the destination (when overwrite = false).
    pub skip_existing: bool,
}

/// Options for walk_dir.
#[derive(Debug, Clone)]
pub struct WalkOptions {
    /// Include hidden files/directories (names starting with '.').
    pub include_hidden: bool,
    /// Maximum directory depth (None = unlimited).
    pub max_depth: Option<usize>,
    /// File extensions to include (empty = include all).
    pub filter_extensions: Vec<String>,
}

impl Default for WalkOptions {
    fn default() -> Self {
        Self {
            include_hidden: false,
            max_depth: None,
            filter_extensions: Vec::new(),
        }
    }
}
