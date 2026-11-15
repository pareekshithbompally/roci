//! Tauri commands for on-device speech-to-text: transcribe one WAV part, and
//! live dictation (start, feed audio as it's spoken, finish or cancel).

use std::time::Duration;

use tauri::ipc::Request;
use tauri::{AppHandle, Manager, State};

use super::engine::{self, TimedText};
use super::live::{LiveSession, LiveText};
use super::SttState;
use crate::ipc::{header, raw_body};
use crate::models::catalog::{self, Kind};
use crate::models::{blocking, store, LocalError, LANGUAGE};
use crate::sync::lock;

const MODEL_HEADER: &str = "x-stt-model";
const LANGUAGE_HEADER: &str = "x-stt-language";
/// A warm model is dropped after this long without a transcription.
const IDLE_UNLOAD: Duration = Duration::from_secs(10 * 60);

/// Transcribes one complete WAV part sent as the raw invoke body.
/// Headers: `x-stt-model` (required), `x-stt-language` (default `en`).
#[tauri::command]
pub async fn stt_transcribe(app: AppHandle, request: Request<'_>) -> Result<Vec<TimedText>, LocalError> {
    let wav = raw_body(&request).ok_or_else(|| LocalError::BadInput("expected a raw WAV body".into()))?;
    let model = catalog::find_kind(header(&request, MODEL_HEADER).unwrap_or_default(), Kind::Speech)?;
    let language = header(&request, LANGUAGE_HEADER).unwrap_or(LANGUAGE).to_string();
    let path = store::installed_dir(&app, model)?.join(model.main_file().name);
    let pcm = engine::decode_wav(wav)?;

    let worker = app.clone();
    let segments = blocking(move || {
        let state = worker.state::<SttState>();
        state.engine.touch(); // a pending idle unload must not fire mid-run
        state.engine.transcribe(model.id, &path, &pcm, &language)
    })
    .await?;

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

/// Begins live dictation with a model that streams (ends any running one).
#[tauri::command]
pub async fn stt_live_start(app: AppHandle, model: String, language: String) -> Result<(), LocalError> {
    let model = catalog::find_kind(&model, Kind::Speech)?;
    let path = store::installed_dir(&app, model)?.join(model.main_file().name);
    lock(&app.state::<SttState>().live).take();
    let worker = app.clone();
    let session = blocking(move || LiveSession::start(worker, model.id, path, language)).await?;
    *lock(&app.state::<SttState>().live) = Some(session);
    Ok(())
}

/// Feeds 16 kHz mono f32 (little-endian, the raw invoke body); answers with the text so far.
#[tauri::command]
pub async fn stt_live_feed(app: AppHandle, request: Request<'_>) -> Result<LiveText, LocalError> {
    let pcm = f32_samples(raw_body(&request).ok_or_else(|| LocalError::BadInput("expected raw f32 samples".into()))?)?;
    blocking(move || {
        let state = app.state::<SttState>();
        let live = lock(&state.live);
        live.as_ref().ok_or_else(|| LocalError::BadInput("no live dictation".into()))?.feed(pcm)
    })
    .await
}

/// Ends live dictation; answers with the final text.
#[tauri::command]
pub async fn stt_live_finish(app: AppHandle) -> Result<LiveText, LocalError> {
    let session = lock(&app.state::<SttState>().live).take();
    let session = session.ok_or_else(|| LocalError::BadInput("no live dictation".into()))?;
    let text = blocking(move || session.finish()).await?;
    schedule_idle_unload(app);
    Ok(text)
}

/// Abandons live dictation, if one is running.
#[tauri::command]
pub fn stt_live_cancel(state: State<'_, SttState>) {
    lock(&state.live).take();
}

fn f32_samples(bytes: &[u8]) -> Result<Vec<f32>, LocalError> {
    if bytes.len() % 4 != 0 {
        return Err(LocalError::BadInput("audio isn't whole f32 samples".into()));
    }
    Ok(bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect())
}

#[cfg(test)]
mod tests {
    use super::f32_samples;

    #[test]
    fn reads_little_endian_f32() {
        let bytes: Vec<u8> = [0.5f32, -1.0].iter().flat_map(|v| v.to_le_bytes()).collect();
        assert_eq!(f32_samples(&bytes).unwrap(), vec![0.5, -1.0]);
        assert!(f32_samples(&bytes[..3]).is_err());
    }
}
