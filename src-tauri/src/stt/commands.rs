//! Tauri command for on-device speech-to-text: transcribe one WAV part.

use std::time::Duration;

use tauri::ipc::Request;
use tauri::{AppHandle, Manager};

use super::engine::{self, TimedText};
use super::SttState;
use crate::ipc::{header, raw_body};
use crate::models::catalog::{self, Kind};
use crate::models::{store, LocalError};

const MODEL_HEADER: &str = "x-stt-model";
const LANGUAGE_HEADER: &str = "x-stt-language";
const DEFAULT_LANGUAGE: &str = "en";
/// A warm model is dropped after this long without a transcription (Hex uses the same).
const IDLE_UNLOAD: Duration = Duration::from_secs(10 * 60);

/// Transcribes one complete WAV part sent as the raw invoke body.
/// Headers: `x-stt-model` (required), `x-stt-language` (default `en`).
#[tauri::command]
pub async fn stt_transcribe(app: AppHandle, request: Request<'_>) -> Result<Vec<TimedText>, LocalError> {
    let wav = raw_body(&request).ok_or_else(|| LocalError::BadInput("expected a raw WAV body".into()))?;
    let model = catalog::find_kind(header(&request, MODEL_HEADER).unwrap_or_default(), Kind::Speech)?;
    let language = header(&request, LANGUAGE_HEADER).unwrap_or(DEFAULT_LANGUAGE).to_string();
    let path = store::installed_dir(&app, model)?.join(model.main_file().name);
    let pcm = engine::decode_wav(wav)?;

    let worker = app.clone();
    let segments = tauri::async_runtime::spawn_blocking(move || {
        let state = worker.state::<SttState>();
        state.engine.touch(); // a pending idle unload must not fire mid-run
        state.engine.transcribe(model.id, &path, &pcm, &language)
    })
    .await
    .map_err(|e| LocalError::Engine(e.to_string()))??;

    schedule_idle_unload(app);
    Ok(segments)
}

/// Drops the warm model once nothing has run for `IDLE_UNLOAD`.
fn schedule_idle_unload(app: AppHandle) {
    let generation = app.state::<SttState>().engine.touch();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(IDLE_UNLOAD).await;
        app.state::<SttState>().engine.unload_if_idle(generation);
    });
}
