use tauri::{AppHandle, command};
use tauri::Emitter;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::process::Command as TokioCommand;
use tokio::io::{AsyncBufReadExt, BufReader};
use crate::utils::{BuildEvent, generate_job_id};
use std::sync::atomic::{AtomicU32, Ordering};

static BUILD_COUNTER: AtomicU32 = AtomicU32::new(0);
static NPM_COUNTER: AtomicU32 = AtomicU32::new(0);

type JobMap = Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>;

static BUILD_JOBS: std::sync::LazyLock<JobMap> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));
static NPM_JOBS: std::sync::LazyLock<JobMap> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

fn emit_build_event(app: &AppHandle, channel: &str, job_id: &str, event_type: &str, data: String) {
    let event = BuildEvent {
        job_id: job_id.to_string(),
        event_type: event_type.to_string(),
        data,
    };
    if let Ok(json) = serde_json::to_string(&event) {
        let _ = app.emit(channel, json);
    }
}

async fn stream_process(
    app: AppHandle,
    channel: &'static str,
    job_id: String,
    jobs: &'static std::sync::LazyLock<JobMap>,
    mut child: tokio::process::Child,
) {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let jid_out = job_id.clone();
    let stdout_task = tokio::spawn(async move {
        if let Some(s) = stdout {
            let mut reader = BufReader::new(s).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                emit_build_event(&app_out, channel, &jid_out, "stdout", line);
            }
        }
    });

    let app_err = app.clone();
    let jid_err = job_id.clone();
    let stderr_task = tokio::spawn(async move {
        if let Some(s) = stderr {
            let mut reader = BufReader::new(s).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                emit_build_event(&app_err, channel, &jid_err, "stderr", line);
            }
        }
    });

    let _ = tokio::join!(stdout_task, stderr_task);

    match child.wait().await {
        Ok(status) => emit_build_event(
            &app, channel, &job_id,
            if status.success() { "done" } else { "error" },
            status.to_string(),
        ),
        Err(e) => emit_build_event(&app, channel, &job_id, "error", e.to_string()),
    }

    jobs.lock().unwrap().remove(&job_id);
}

#[command]
pub async fn run_build(
    app: AppHandle,
    engine_root: String,
    config_path: String,
) -> Result<String, String> {
    let job_id = generate_job_id("build", BUILD_COUNTER.fetch_add(1, Ordering::SeqCst));

    let webpack_bin = std::path::Path::new(&engine_root)
        .join("node_modules").join("webpack").join("bin").join("webpack.js");

    let child = TokioCommand::new("node")
        .arg(&webpack_bin)
        .arg("--config").arg(&config_path)
        .current_dir(&engine_root)
        .env("FORCE_COLOR", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn webpack: {}", e))?;

    let handle = tokio::spawn(stream_process(app, "build-output", job_id.clone(), &BUILD_JOBS, child));
    BUILD_JOBS.lock().unwrap().insert(job_id.clone(), handle);

    Ok(job_id)
}

#[command]
pub async fn cancel_build(job_id: String) -> Result<(), String> {
    if let Some(handle) = BUILD_JOBS.lock().unwrap().remove(&job_id) {
        handle.abort();
    }
    Ok(())
}

#[command]
pub async fn run_npm(
    app: AppHandle,
    project_dir: String,
    args: Vec<String>,
) -> Result<String, String> {
    let job_id = generate_job_id("npm", NPM_COUNTER.fetch_add(1, Ordering::SeqCst));

    let npm_cmd = if cfg!(target_os = "windows") { "npm.cmd" } else { "npm" };

    let child = TokioCommand::new(npm_cmd)
        .args(&args)
        .current_dir(&project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn npm: {}", e))?;

    let handle = tokio::spawn(stream_process(app, "npm-output", job_id.clone(), &NPM_JOBS, child));
    NPM_JOBS.lock().unwrap().insert(job_id.clone(), handle);

    Ok(job_id)
}

#[command]
pub async fn cancel_npm(job_id: String) -> Result<(), String> {
    if let Some(handle) = NPM_JOBS.lock().unwrap().remove(&job_id) {
        handle.abort();
    }
    Ok(())
}

#[command]
pub async fn get_running_jobs() -> Result<Vec<String>, String> {
    let mut job_ids: Vec<String> = BUILD_JOBS.lock().unwrap().keys().cloned().collect();
    job_ids.extend(NPM_JOBS.lock().unwrap().keys().cloned());
    Ok(job_ids)
}
