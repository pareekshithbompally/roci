use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::audio::bridge;
use crate::audio::types::{AudioCaptureOptions, CaptureError};
use crate::permissions;

/// Both output paths returned by `stop_audio_capture`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingPaths {
    pub playback_path: String,
    pub ai_path: String,
}

/// Maps `…/recording_<ts>.wav` → `…/recording_<ts>.ai.wav`
fn ai_sibling_path(hq_path: &str) -> String {
    let path = std::path::Path::new(hq_path);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("recording");
    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    parent.join(format!("{stem}.ai.wav")).to_string_lossy().into_owned()
}

struct CaptureHandle {
    hq_path: String,
    ai_path: String,
    /// Boxed-AppHandle pointer (as usize for Send) held by the Swift bridge.
    ctx: usize,
}

static CAPTURE_STATE: Mutex<Option<CaptureHandle>> = Mutex::new(None);

fn create_output_path(
    app: &AppHandle,
    file_name: Option<String>,
    recordings_dir: Option<String>,
) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    let dir_name = recordings_dir.unwrap_or_else(|| "recordings".to_string());
    let recordings_path = data_dir.join(dir_name);
    if let Err(e) = std::fs::create_dir_all(&recordings_path) {
        return Err(format!("Failed to create recordings directory: {e}"));
    }
    let filename = file_name.unwrap_or_else(|| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("recording_{}.wav", ts)
    });
    Ok(recordings_path.join(filename).to_string_lossy().to_string())
}

#[tauri::command]
pub async fn start_audio_capture(
    app: AppHandle,
    options: AudioCaptureOptions,
) -> Result<(), CaptureError> {
    if let Some(kind) = permissions::missing(options.source.needs()) {
        return Err(CaptureError::Permission { kind });
    }
    stop_audio_capture().await.ok();

    let hq_path = create_output_path(&app, options.file_name, options.recordings_dir)?;
    let ai_path = ai_sibling_path(&hq_path);
    log::info!("Audio capture starting, hq={}, ai={}", hq_path, ai_path);

    let ctx = bridge::start(options.source.tag(), &hq_path, &ai_path, app.clone())?;

    *CAPTURE_STATE.lock().unwrap() = Some(CaptureHandle { hq_path, ai_path, ctx });
    log::info!("Audio capture started.");
    Ok(())
}

#[tauri::command]
pub async fn stop_audio_capture() -> Result<RecordingPaths, String> {
    let state = { CAPTURE_STATE.lock().unwrap().take() };

    let Some(state) = state else {
        return Ok(RecordingPaths {
            playback_path: "No active audio capture".to_string(),
            ai_path: String::new(),
        });
    };

    // bridge::stop tears down the streams, the engine, and closes (finalizes)
    // the WAV files — blocking work. Run it off the async runtime so it never
    // freezes other IPC (the old "Stop needs two clicks / stalled widget" bug).
    let ctx = state.ctx;
    tauri::async_runtime::spawn_blocking(move || bridge::stop(ctx))
        .await
        .map_err(|e| format!("Audio stop task panicked: {e}"))?;

    log::info!("Audio capture stopped, hq={}", state.hq_path);
    Ok(RecordingPaths {
        playback_path: state.hq_path,
        ai_path: state.ai_path,
    })
}

#[tauri::command]
pub async fn pause_audio_capture() -> Result<(), String> {
    bridge::pause()
}

#[tauri::command]
pub async fn resume_audio_capture() -> Result<(), String> {
    bridge::resume()
}
