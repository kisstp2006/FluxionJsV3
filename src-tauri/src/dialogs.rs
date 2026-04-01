use tauri::{AppHandle, Runtime, command};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogResult {
    pub request_id: String,
    pub result: Option<String>,
    pub results: Option<Vec<String>>,
}

fn emit_dialog_result(app: &AppHandle, result: DialogResult) {
    if let Ok(json) = serde_json::to_string(&result) {
        let _ = app.emit("dialog-result", json);
    }
}

fn build_file_dialog<R: Runtime>(
    builder: tauri_plugin_dialog::FileDialogBuilder<R>,
    filters: Option<Vec<FileFilter>>,
    title: Option<String>,
    default_path: Option<String>,
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    let mut b = builder.set_title(title.unwrap_or_else(|| "Select File".to_string()));

    if let Some(filters) = filters {
        for f in filters {
            let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
            b = b.add_filter(&f.name, &exts);
        }
    }

    if let Some(path) = default_path {
        b = b.set_directory(path);
    }

    b
}

#[command]
pub async fn show_open_dialog(
    app: AppHandle,
    filters: Option<Vec<FileFilter>>,
    title: Option<String>,
    default_path: Option<String>,
) -> Result<String, String> {
    let request_id = Uuid::new_v4().to_string();
    let rid = request_id.clone();
    let app_clone = app.clone();

    let builder = build_file_dialog(app.dialog().file(), filters, title, default_path);
    builder.pick_file(move |path_opt| {
        emit_dialog_result(&app_clone, DialogResult {
            request_id: rid,
            result: path_opt.map(|p| p.to_string()),
            results: None,
        });
    });

    Ok(request_id)
}

#[command]
pub async fn show_save_dialog(
    app: AppHandle,
    filters: Option<Vec<FileFilter>>,
    title: Option<String>,
    default_path: Option<String>,
    default_name: Option<String>,
) -> Result<String, String> {
    let request_id = Uuid::new_v4().to_string();
    let rid = request_id.clone();
    let app_clone = app.clone();

    let mut builder = build_file_dialog(app.dialog().file(), filters, title, default_path);
    if let Some(name) = default_name {
        builder = builder.set_file_name(name);
    }
    builder.save_file(move |path_opt| {
        emit_dialog_result(&app_clone, DialogResult {
            request_id: rid,
            result: path_opt.map(|p| p.to_string()),
            results: None,
        });
    });

    Ok(request_id)
}

#[command]
pub async fn show_open_files_dialog(
    app: AppHandle,
    filters: Option<Vec<FileFilter>>,
    title: Option<String>,
    default_path: Option<String>,
) -> Result<String, String> {
    let request_id = Uuid::new_v4().to_string();
    let rid = request_id.clone();
    let app_clone = app.clone();

    let builder = build_file_dialog(app.dialog().file(), filters, title, default_path);
    builder.pick_files(move |paths_opt| {
        let results = paths_opt
            .map(|paths| paths.into_iter().map(|p| p.to_string()).collect())
            .unwrap_or_default();
        emit_dialog_result(&app_clone, DialogResult {
            request_id: rid,
            result: None,
            results: Some(results),
        });
    });

    Ok(request_id)
}

#[command]
pub async fn show_open_dir_dialog(
    app: AppHandle,
    title: Option<String>,
    default_path: Option<String>,
) -> Result<String, String> {
    let request_id = Uuid::new_v4().to_string();
    let rid = request_id.clone();
    let app_clone = app.clone();

    let mut builder = app.dialog().file()
        .set_title(title.unwrap_or_else(|| "Select Folder".to_string()));
    if let Some(path) = default_path {
        builder = builder.set_directory(path);
    }
    builder.pick_folder(move |path_opt| {
        emit_dialog_result(&app_clone, DialogResult {
            request_id: rid,
            result: path_opt.map(|p| p.to_string()),
            results: None,
        });
    });

    Ok(request_id)
}
