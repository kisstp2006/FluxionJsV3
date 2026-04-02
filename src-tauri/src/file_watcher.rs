use tauri::{AppHandle, command};
use tauri::Emitter;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use notify::{Watcher, RecursiveMode, EventKind, RecommendedWatcher, Config};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

/// Minimum interval between emitting events for the same path.
const DEBOUNCE_DURATION: Duration = Duration::from_millis(100);

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

        // Per-path debounce: track the last time we emitted for each path.
        // Wrapped in Arc<Mutex> so the closure can hold it across calls.
        let last_emitted: Arc<Mutex<HashMap<PathBuf, Instant>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let mut watcher = RecommendedWatcher::new(
            move |res: notify::Result<notify::Event>| {
                match res {
                    Ok(event) => {
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

                        let now = Instant::now();
                        let mut debounce = last_emitted.lock().unwrap_or_else(|e| e.into_inner());

                        for p in &event.paths {
                            // Skip if we emitted for this path too recently
                            if let Some(last) = debounce.get(p) {
                                if now.duration_since(*last) < DEBOUNCE_DURATION {
                                    continue;
                                }
                            }
                            debounce.insert(p.clone(), now);

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
                    Err(e) => {
                        eprintln!("[file_watcher] watch error: {e}");
                    }
                }
            },
            Config::default(),
        ).map_err(|e| format!("Failed to create watcher: {}", e))?;

        let mode = if recursive { RecursiveMode::Recursive } else { RecursiveMode::NonRecursive };
        watcher.watch(&path_buf, mode)
            .map_err(|e| format!("Failed to watch '{}': {}", path, e))?;

        self.watchers.lock().unwrap_or_else(|e| e.into_inner()).insert(watcher_id.clone(), watcher);
        Ok(watcher_id)
    }

    pub fn unwatch_directory(&self, watcher_id: &str) -> Result<(), String> {
        self.watchers.lock().unwrap_or_else(|e| e.into_inner())
            .remove(watcher_id)
            .map(|_| ())
            .ok_or_else(|| format!("Watcher '{}' not found", watcher_id))
    }

    pub fn unwatch_all(&self) {
        self.watchers.lock().unwrap_or_else(|e| e.into_inner()).clear();
    }

    pub fn active_ids(&self) -> Vec<String> {
        self.watchers.lock().unwrap_or_else(|e| e.into_inner()).keys().cloned().collect()
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
