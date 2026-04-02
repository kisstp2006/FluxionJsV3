// ============================================================
// FluxionJS V3 — Engine Filesystem API
// Path utilities — cross-platform helpers
// ============================================================

use std::path::{Component, Path, PathBuf};

/// Normalize `path` to use forward slashes on all platforms.
///
/// This is the canonical form used throughout the engine for storing
/// and comparing paths in project files, regardless of the host OS.
pub fn normalize(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Normalize a path string to forward slashes.
pub fn normalize_str(path: &str) -> String {
    path.replace('\\', "/")
}

/// Join `segment` onto `base`, returning the new `PathBuf`.
pub fn join(base: &Path, segment: &str) -> PathBuf {
    base.join(segment)
}

/// Return the file extension of `path` in lowercase, without the leading dot.
///
/// Returns `None` if the path has no extension.
pub fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
}

/// Return the filename without its extension.
pub fn stem(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

/// Return the filename component (including extension) as a `String`.
pub fn filename(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
}

/// Return the parent directory of `path`, if one exists.
pub fn parent(path: &Path) -> Option<PathBuf> {
    path.parent().map(|p| p.to_path_buf())
}

/// Return `true` if `child` is located inside `ancestor`.
///
/// This comparison uses `canonicalize` when both paths exist on disk
/// (resolves symlinks and `..`).  If either path does not exist, a
/// lexical prefix check is used as a best-effort fallback.
pub fn is_inside(child: &Path, ancestor: &Path) -> bool {
    match (child.canonicalize(), ancestor.canonicalize()) {
        (Ok(c), Ok(a)) => c.starts_with(&a),
        _              => child.starts_with(ancestor),
    }
}

/// Compute `target` relative to `base`.
///
/// Returns `None` if `target` is not under `base`.
pub fn relative_from(target: &Path, base: &Path) -> Option<PathBuf> {
    target.strip_prefix(base).ok().map(|p| p.to_path_buf())
}

/// Lexically clean a path by resolving `.` and `..` components without
/// hitting the filesystem (no `canonicalize`).
///
/// Useful for normalizing paths that may not exist yet.
pub fn clean(path: &Path) -> PathBuf {
    let mut out: Vec<&std::ffi::OsStr> = Vec::new();
    for comp in path.components() {
        match comp {
            Component::Prefix(p)  => out.push(p.as_os_str()),
            Component::RootDir    => out.push(std::ffi::OsStr::new("/")),
            Component::CurDir     => {}
            Component::ParentDir  => { out.pop(); }
            Component::Normal(n)  => out.push(n),
        }
    }
    out.iter().collect()
}

/// Replace the extension of `path` with `new_ext` (no leading dot).
pub fn with_extension(path: &Path, new_ext: &str) -> PathBuf {
    path.with_extension(new_ext)
}

/// Return `true` if the filename component starts with a dot, indicating
/// a hidden file on POSIX systems.
pub fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

/// Build an absolute path from `base` + `relative`, cleaning the result.
pub fn resolve(base: &Path, relative: &str) -> PathBuf {
    clean(&base.join(relative))
}

/// Split `path` into `(parent_dir, filename_without_extension, extension)`.
pub fn split(path: &Path) -> (PathBuf, String, Option<String>) {
    let dir  = parent(path).unwrap_or_else(|| PathBuf::from("."));
    let stem = stem(path).unwrap_or_default();
    let ext  = extension(path);
    (dir, stem, ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize() {
        assert_eq!(normalize(Path::new("C:\\foo\\bar")), "C:/foo/bar");
        assert_eq!(normalize(Path::new("/foo/bar")),    "/foo/bar");
    }

    #[test]
    fn test_clean() {
        assert_eq!(clean(Path::new("/a/b/../c")), PathBuf::from("/a/c"));
        assert_eq!(clean(Path::new("a/./b")),     PathBuf::from("a/b"));
    }

    #[test]
    fn test_relative_from() {
        let base   = Path::new("/project");
        let target = Path::new("/project/src/main.ts");
        assert_eq!(relative_from(target, base), Some(PathBuf::from("src/main.ts")));
    }

    #[test]
    fn test_is_hidden() {
        assert!(is_hidden(Path::new("/home/user/.gitignore")));
        assert!(!is_hidden(Path::new("/home/user/file.txt")));
    }
}
