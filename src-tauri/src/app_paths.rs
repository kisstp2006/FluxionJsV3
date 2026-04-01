use tauri::{AppHandle, Manager, command};
use std::path::PathBuf;

#[command]
pub async fn get_app_data_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

#[command]
pub async fn get_app_config_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config directory: {}", e))?
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

#[command]
pub async fn get_home_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .home_dir()
        .map_err(|e| format!("Failed to get home directory: {}", e))?
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

#[command]
pub async fn get_cache_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .cache_dir()
        .map_err(|e| format!("Failed to get cache directory: {}", e))?
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

#[command]
pub async fn get_resource_path(app: AppHandle, resource: String) -> Result<String, String> {
    app.path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource directory: {}", e))?
        .join(&resource)
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

#[command]
pub async fn resolve_path(app: AppHandle, path: String) -> Result<String, String> {
    // Resolve relative paths against the app's resource directory
    let base_dir = app.path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource directory: {}", e))?;
    
    let resolved = if std::path::Path::new(&path).is_absolute() {
        PathBuf::from(path)
    } else {
        base_dir.join(path)
    };
    
    resolved.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}
