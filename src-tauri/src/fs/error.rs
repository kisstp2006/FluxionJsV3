// ============================================================
// FluxionJS V3 — Engine Filesystem API
// Error types
// ============================================================

use std::fmt;
use std::path::PathBuf;

/// All errors that can occur in filesystem operations.
#[derive(Debug)]
pub enum FsError {
    /// Low-level I/O error from the OS.
    Io(std::io::Error),
    /// The requested path does not exist.
    NotFound(PathBuf),
    /// The operation was denied by OS permissions.
    PermissionDenied(PathBuf),
    /// A file was expected but a directory (or other) was found.
    NotAFile(PathBuf),
    /// A directory was expected but a file (or other) was found.
    NotADirectory(PathBuf),
    /// The target path already exists and the operation does not overwrite.
    AlreadyExists(PathBuf),
    /// The path string is not valid UTF-8 or contains illegal characters.
    InvalidPath(String),
    /// Any other error not covered by the variants above.
    Other(String),
}

impl fmt::Display for FsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FsError::Io(e)                => write!(f, "IO error: {e}"),
            FsError::NotFound(p)          => write!(f, "Not found: {}", p.display()),
            FsError::PermissionDenied(p)  => write!(f, "Permission denied: {}", p.display()),
            FsError::NotAFile(p)          => write!(f, "Not a file: {}", p.display()),
            FsError::NotADirectory(p)     => write!(f, "Not a directory: {}", p.display()),
            FsError::AlreadyExists(p)     => write!(f, "Already exists: {}", p.display()),
            FsError::InvalidPath(s)       => write!(f, "Invalid path: {s}"),
            FsError::Other(s)             => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for FsError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        if let FsError::Io(e) = self { Some(e) } else { None }
    }
}

impl From<std::io::Error> for FsError {
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind;
        match e.kind() {
            ErrorKind::NotFound          => FsError::Io(e),
            ErrorKind::PermissionDenied  => FsError::Io(e),
            ErrorKind::AlreadyExists     => FsError::Io(e),
            _                            => FsError::Io(e),
        }
    }
}

/// Convenience conversion so Tauri commands can return `Result<T, String>`.
impl From<FsError> for String {
    fn from(e: FsError) -> Self {
        e.to_string()
    }
}

/// Shorthand result type for all FileSystem operations.
pub type FsResult<T> = Result<T, FsError>;
