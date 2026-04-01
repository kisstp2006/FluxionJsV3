// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod utils;
mod dialogs;
mod file_system;
mod app_paths;
mod build_system;
mod file_watcher;

use commands::*;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize file watcher state
            file_watcher::init_watcher_safe(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // File dialogs
            show_open_dialog,
            show_save_dialog,
            show_open_files_dialog,
            show_open_dir_dialog,
            
            // File system operations
            read_file,
            write_file,
            list_dir,
            read_dir,
            mkdir,
            exists,
            delete_file,
            read_binary,
            write_binary,
            stat,
            rename,
            copy,
            hash_file,
            get_file_size,
            is_file,
            is_directory,
            
            // File watching
            watch_directory,
            unwatch_directory,
            unwatch_all,
            get_active_watchers,
            
            // Shell operations
            show_item_in_folder,
            open_path,
            
            // Window controls
            minimize_window,
            maximize_window,
            close_window,
            open_child_window,
            close_child_window,
            
            // Build system
            run_build,
            cancel_build,
            get_running_jobs,
            
            // npm commands
            run_npm,
            cancel_npm,
            
            // App paths
            get_app_data_path,
            get_app_config_path,
            get_home_path,
            get_cache_path,
            get_resource_path,
            resolve_path,
            get_engine_root_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
