use tauri::{AppHandle, command};
use tauri::Emitter;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::path::PathBuf;
use notify::{Watcher, RecursiveMode, EventKind, RecommendedWatcher, Config};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileWatchEvent {
    pub watcher_id: String,
    pub path: String,
    pub event_type: String,
    pub timestamp: u64,
}

pub struct FileWatcherManager {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    app_handle: AppHandle,
}

impl FileWatcherManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
            app_handle,
        }
    }

    pub fn watch_directory(&self, path: String, recursive: bool) -> Result<String, String> {
        let watcher_id = Uuid::new_v4().to_string();
        let path_buf = PathBuf::from(&path);

        let app = self.app_handle.clone();
        let wid = watcher_id.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res: notify::Result<notify::Event>| {
                if let Ok(event) = res {
                    let event_type = match event.kind {
                        EventKind::Create(_) => "created",
                        EventKind::Modify(_) => "modified",
                        EventKind::Remove(_) => "removed",
                        EventKind::Access(_) => "accessed",
                        _ => "changed",
                    };
                    let ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    for p in &event.paths {
                        let we = FileWatchEvent {
                            watcher_id: wid.clone(),
                            path: p.to_string_lossy().to_string(),
                            event_type: event_type.to_string(),
                            timestamp: ts,
                        };
                        if let Ok(json) = serde_json::to_string(&we) {
                            let _ = app.emit("file-changed", json);
                        }
                    }
                }
            },
            Config::default(),
        ).map_err(|e| format!("Failed to create watcher: {}", e))?;

        let mode = if recursive { RecursiveMode::Recursive } else { RecursiveMode::NonRecursive };
        watcher.watch(&path_buf, mode)
            .map_err(|e| format!("Failed to watch '{}': {}", path, e))?;

        self.watchers.lock().unwrap().insert(watcher_id.clone(), watcher);
        Ok(watcher_id)
    }

    pub fn unwatch_directory(&self, watcher_id: &str) -> Result<(), String> {
        self.watchers.lock().unwrap()
            .remove(watcher_id)
            .map(|_| ())
            .ok_or_else(|| format!("Watcher '{}' not found", watcher_id))
    }

    pub fn unwatch_all(&self) {
        self.watchers.lock().unwrap().clear();
    }

    pub fn active_ids(&self) -> Vec<String> {
        self.watchers.lock().unwrap().keys().cloned().collect()
    }
}

static GLOBAL_WATCHER: OnceLock<Arc<FileWatcherManager>> = OnceLock::new();

pub fn init_watcher_safe(app_handle: AppHandle) {
    let _ = GLOBAL_WATCHER.set(Arc::new(FileWatcherManager::new(app_handle)));
}

fn get_manager() -> Result<Arc<FileWatcherManager>, String> {
    GLOBAL_WATCHER.get().cloned()
        .ok_or_else(|| "File watcher not initialized".to_string())
}

#[command]
pub async fn watch_directory(path: String, recursive: Option<bool>) -> Result<String, String> {
    get_manager()?.watch_directory(path, recursive.unwrap_or(true))
}

#[command]
pub async fn unwatch_directory(watcher_id: String) -> Result<(), String> {
    get_manager()?.unwatch_directory(&watcher_id)
}

#[command]
pub async fn unwatch_all() -> Result<(), String> {
    get_manager()?.unwatch_all();
    Ok(())
}

#[command]
pub async fn get_active_watchers() -> Result<Vec<String>, String> {
    Ok(get_manager()?.active_ids())
}
