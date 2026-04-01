use tauri::{AppHandle, Window, Manager, WebviewWindowBuilder, WebviewUrl, command};
use tauri_plugin_shell::ShellExt;

// Re-export from modules
pub use crate::dialogs::*;
pub use crate::file_system::*;
pub use crate::app_paths::*;
pub use crate::build_system::*;
pub use crate::file_watcher::*;

// ── Shell Operations ───────────────────────────────────────────────────────

#[command]
pub fn show_item_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .args(["/select,", &path])
        .spawn()
        .map_err(|e| format!("Failed to show item in folder: {}", e))?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| format!("Failed to show item in folder: {}", e))?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new(&path)))
        .spawn()
        .map_err(|e| format!("Failed to show item in folder: {}", e))?;
    Ok(())
}

#[command]
pub fn open_path(path: String, app: AppHandle) -> Result<(), String> {
    app.shell()
        .open(&path, None)
        .map_err(|e| format!("Failed to open path: {}", e))
}

// ── Window Controls ───────────────────────────────────────────────────────

#[command]
pub fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| format!("Failed to minimize window: {}", e))
}

#[command]
pub fn maximize_window(window: Window) -> Result<(), String> {
    window.maximize().map_err(|e| format!("Failed to maximize window: {}", e))
}

#[command]
pub fn close_window(window: Window) -> Result<(), String> {
    window.close().map_err(|e| format!("Failed to close window: {}", e))
}

// ── Child Window Management ──────────────────────────────────────────────────

#[command]
pub async fn open_child_window(
    app: AppHandle,
    label: String,
    url: String,
    title: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    // If a window with this label already exists, focus it instead
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(width.unwrap_or(1200.0), height.unwrap_or(800.0))
        .build()
        .map_err(|e| format!("Failed to open window: {}", e))?;

    Ok(())
}

#[command]
pub async fn close_child_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| format!("Failed to close window '{}': {}", label, e))?;
    }
    Ok(())
}

// ── Legacy Engine Root (for compatibility) ───────────────────────────────────

#[command]
pub fn get_engine_root_cmd() -> Result<String, String> {
    let root = crate::utils::get_engine_root()?;
    Ok(root.display().to_string())
}
