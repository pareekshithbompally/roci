//! Tauri commands for on-device speech-to-text: transcribe one WAV part, find its speech, and live dictation.


use tauri::ipc::Request;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use super::engine::{self, Timed};
use super::live::{LiveSession, LiveText};
use super::vad::{self, SpeechSpan};
use super::vocabulary::{self, RecognitionBoost, VocabularyEntry};
use super::SttState;
use crate::ipc::{header, raw_body};
use crate::models::catalog::{self, Kind};
use crate::models::{blocking, store, LocalError, LANGUAGE};
use crate::sync::lock;

const MODEL_HEADER: &str = "x-stt-model";
const LANGUAGE_HEADER: &str = "x-stt-language";

/// Transcribes one WAV raw body; headers `x-stt-model` (required) and `x-stt-language` (default `en`).
#[tauri::command]
pub async fn stt_transcribe(app: AppHandle, request: Request<'_>) -> Result<Timed, LocalError> {
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
    .await;

    // armed however the run ended: the touch above cancelled the earlier deadline
    schedule_idle_unload(app);
    segments
}

/// The speech spans in one WAV raw body (16 kHz mono 16-bit), by the bundled speech detector.
#[tauri::command]
pub async fn stt_speech_spans(app: AppHandle, request: Request<'_>) -> Result<Vec<SpeechSpan>, LocalError> {
    let wav = raw_body(&request).ok_or_else(|| LocalError::BadInput("expected a raw WAV body".into()))?;
    let pcm = engine::decode_wav(wav)?;
    let path = app.path().resolve(vad::MODEL_RESOURCE, BaseDirectory::Resource).map_err(|e| LocalError::Io(e.to_string()))?;
    blocking(move || app.state::<SttState>().detector.spans(&path, &pcm)).await
}

/// Drops the warm model once nothing has run for Settings' idle time (never when kept until quit).
fn schedule_idle_unload(app: AppHandle) {
    let generation = app.state::<SttState>().engine.touch();
    let Some(idle) = crate::models::idle_after() else { return };
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(idle).await;
        app.state::<SttState>().engine.unload_if_idle(generation);
    });
}

/// Sets the custom vocabulary and recognition boost runs read from now on (Settings › Personalization › Vocabulary).
#[tauri::command]
pub fn stt_set_vocabulary(entries: Vec<VocabularyEntry>, boost: RecognitionBoost) {
    vocabulary::apply(entries, boost);
}

/// Begins live dictation with a model that streams (ends any running one).
#[tauri::command]
pub async fn stt_live_start(app: AppHandle, model: String, language: String) -> Result<(), LocalError> {
    let model = catalog::find_kind(&model, Kind::Speech)?;
    let path = store::installed_dir(&app, model)?.join(model.main_file().name);
    lock(&app.state::<SttState>().live).take();
    let worker = app.clone();
    let started = blocking(move || LiveSession::start(worker, model.id, path, language)).await;
    let session = started.inspect_err(|_| schedule_idle_unload(app.clone()))?;
    *lock(&app.state::<SttState>().live) = Some(session);
    Ok(())
}

/// Feeds 16 kHz mono f32 (little-endian, the raw invoke body); answers with the text so far.
#[tauri::command]
pub async fn stt_live_feed(app: AppHandle, request: Request<'_>) -> Result<LiveText, LocalError> {
    let pcm = f32_samples(raw_body(&request).ok_or_else(|| LocalError::BadInput("expected raw f32 samples".into()))?)?;
    // A handle of its own, so waiting for the engine never holds the lock that cancel and finish take.
    let session = lock(&app.state::<SttState>().live).clone().ok_or_else(|| LocalError::BadInput("no live dictation".into()))?;
    blocking(move || session.feed(pcm)).await
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

/// Abandons live dictation, if one is running; the model unloads once idle, as after a finish.
#[tauri::command]
pub fn stt_live_cancel(app: AppHandle) {
    lock(&app.state::<SttState>().live).take();
    schedule_idle_unload(app);
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
