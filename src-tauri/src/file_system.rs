use tauri::command;
use std::path::Path;
use std::fs;
use std::time::UNIX_EPOCH;
use sha2::Digest;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use crate::utils::{DirEntry, FileStat};

#[command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[command]
pub async fn write_file(path: String, data: String) -> Result<(), String> {
    // Create parent directories if they don't exist
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories for '{}': {}", path, e))?;
    }
    
    fs::write(&path, data)
        .map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[command]
pub async fn read_binary(path: String) -> Result<String, String> {
    let data = fs::read(&path)
        .map_err(|e| format!("Failed to read binary file '{}': {}", path, e))?;
    
    Ok(STANDARD.encode(&data))
}

#[command]
pub async fn write_binary(path: String, base64_data: String) -> Result<(), String> {
    let data = STANDARD.decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;
    
    // Create parent directories if they don't exist
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories for '{}': {}", path, e))?;
    }
    
    fs::write(&path, data)
        .map_err(|e| format!("Failed to write binary file '{}': {}", path, e))
}

#[command]
pub async fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory '{}': {}", path, e))?;
    
    let mut result = Vec::new();
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        let path = entry.path();
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        
        let path_str = path.to_string_lossy().to_string();
        
        result.push(DirEntry {
            name,
            is_directory: metadata.is_dir(),
            path: path_str,
        });
    }
    
    Ok(result)
}

#[command]
pub async fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    list_dir(path).await
}

#[command]
pub async fn exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[command]
pub async fn mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory '{}': {}", path, e))
}

#[command]
pub async fn delete_file(path: String) -> Result<(), String> {
    if Path::new(&path).is_dir() {
        fs::remove_dir_all(&path)
            .map_err(|e| format!("Failed to remove directory '{}': {}", path, e))
    } else {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to remove file '{}': {}", path, e))
    }
}

#[command]
pub async fn stat(path: String) -> Result<FileStat, String> {
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to get metadata for '{}': {}", path, e))?;
    
    let modified_at = metadata.modified().ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    
    Ok(FileStat {
        size: metadata.len(),
        is_directory: metadata.is_dir(),
        modified_at,
    })
}

#[command]
pub async fn rename(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename '{}' to '{}': {}", old_path, new_path, e))
}

#[command]
pub async fn copy(src_path: String, dest_path: String) -> Result<(), String> {
    // Create parent directories if they don't exist
    if let Some(parent) = Path::new(&dest_path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories for '{}': {}", dest_path, e))?;
    }
    
    fs::copy(&src_path, &dest_path)
        .map_err(|e| format!("Failed to copy '{}' to '{}': {}", src_path, dest_path, e))?;
    
    Ok(())
}

#[command]
pub async fn hash_file(path: String) -> Result<String, String> {
    let data = fs::read(&path)
        .map_err(|e| format!("Failed to read file for hashing '{}': {}", path, e))?;
    
    let mut hasher = sha2::Sha256::new();
    hasher.update(&data);
    Ok(format!("{:x}", hasher.finalize()))
}

#[command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to get metadata for '{}': {}", path, e))?;
    
    Ok(metadata.len())
}

#[command]
pub async fn is_file(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).is_file())
}

#[command]
pub async fn is_directory(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).is_dir())
}
