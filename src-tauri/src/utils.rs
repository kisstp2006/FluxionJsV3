use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BuildEvent {
    pub job_id: String,
    pub event_type: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub is_directory: bool,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub size: u64,
    pub is_directory: bool,
    pub modified_at: u64,
}


pub fn generate_job_id(prefix: &str, counter: u32) -> String {
    format!("{}_{}", prefix, counter + 1)
}

pub fn get_engine_root() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        // Development: assume we're running from src-tauri/
        std::env::current_dir()
            .map(|p| p.parent().unwrap_or(&p).to_path_buf())
            .map_err(|e| format!("Failed to get current directory: {}", e))
    } else {
        // Production: use the app's executable directory
        std::env::current_exe()
            .and_then(|p| p.parent().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "No parent directory")).map(|p| p.to_path_buf()))
            .map_err(|e| format!("Failed to get executable directory: {}", e))
    }
}
