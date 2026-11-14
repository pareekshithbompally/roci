//! Tauri commands for the Hex integration. The bearer token never leaves Rust.

use serde::Serialize;
use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

use super::client::{self, HexModel};
use super::meetings::{self, HexMeeting, HexMeetingDetail};
use super::{discovery, events, HexError, HexState};

const MODEL_HEADER: &str = "x-hex-model";
const LANGUAGE_HEADER: &str = "x-hex-language";
const DEFAULT_LANGUAGE: &str = "en";

#[derive(Serialize)]
pub struct HexStatus {
    running: bool,
    models: Vec<HexModel>,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, HexError> {
    app.path().data_dir().map_err(|error| HexError::Rejected(error.to_string()))
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|value| value.to_str().ok())
}

/// Whether Hex is running, and its models (installed or not). Hex not running is a normal state.
#[tauri::command]
pub async fn hex_status(app: AppHandle) -> Result<HexStatus, HexError> {
    let endpoint = match discovery::read(&data_dir(&app)?) {
        Err(HexError::NotRunning) => return Ok(HexStatus { running: false, models: Vec::new() }),
        other => other?,
    };
    match client::models(&endpoint).await {
        Ok(models) => Ok(HexStatus { running: true, models }),
        Err(HexError::NotRunning) => Ok(HexStatus { running: false, models: Vec::new() }),
        Err(error) => Err(error),
    }
}

/// Transcribes one complete PCM WAV sent as the raw invoke body.
/// Headers: `x-hex-model` (required), `x-hex-language` (default `en`).
#[tauri::command]
pub async fn hex_transcribe(app: AppHandle, request: Request<'_>) -> Result<String, HexError> {
    let InvokeBody::Raw(wav) = request.body() else {
        return Err(HexError::Rejected("expected a raw WAV body".into()));
    };
    let model = header(&request, MODEL_HEADER).ok_or_else(|| HexError::Rejected("missing model".into()))?;
    let language = header(&request, LANGUAGE_HEADER).unwrap_or(DEFAULT_LANGUAGE);
    let endpoint = discovery::read(&data_dir(&app)?)?;
    client::transcribe(&endpoint, wav.clone(), model, language).await
}

/// Every Hex meeting, newest first (Hex's CLI JSON, read-only).
#[tauri::command]
pub async fn hex_meetings_list() -> Result<Vec<HexMeeting>, HexError> {
    meetings::list_all().await
}

/// One Hex meeting with its notes and full transcript.
#[tauri::command]
pub async fn hex_meeting_show(id: String) -> Result<HexMeetingDetail, HexError> {
    meetings::show(&id).await
}

/// Starts or stops the meeting-finished watcher (the integration switch).
#[tauri::command]
pub fn hex_watch(app: AppHandle, state: tauri::State<'_, HexState>, on: bool) -> Result<(), HexError> {
    let mut watcher = state.watcher.lock().map_err(|error| HexError::Rejected(error.to_string()))?;
    if let Some(task) = watcher.take() {
        task.abort();
    }
    if on {
        let data_dir = data_dir(&app)?;
        *watcher = Some(tauri::async_runtime::spawn(events::watch(app, data_dir)));
    }
    Ok(())
}
