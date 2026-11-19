//! Tauri commands. Bridge calls block (Swift semaphores), so they run off the main thread.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::command;
use tauri::ipc::{Channel, InvokeBody, Request};
use tauri::State;

use crate::bridge;
use crate::types::{
    AppleError, Availability, Empty, Granted, LiveText, ModelStatus, Reply, SpeechSegment, SpeechStatus, StreamEvent, Text,
    Transcription,
};

/// Longest one generation may take (a full summary measured ~20 s on Apple silicon).
const GENERATE_TIMEOUT: Duration = Duration::from_secs(120);
const LANGUAGE_HEADER: &str = "x-language";
/// Which live speech stream a raw-body feed is for.
const STREAM_HEADER: &str = "x-stream";
const DEFAULT_LANGUAGE: &str = "en";

async fn off_main<T: Send + 'static>(work: impl FnOnce() -> Result<T, AppleError> + Send + 'static) -> Result<T, AppleError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| AppleError::Failed(format!("Apple Intelligence task failed: {e}")))?
}

/// A bridge reply → its value, or the typed failure.
fn take<T>(reply: Result<Reply<T>, String>) -> Result<T, AppleError> {
    let reply = reply.map_err(AppleError::Failed)?;
    match (reply.error, reply.value) {
        (Some(failure), _) => Err(failure.into()),
        (None, Some(value)) => Ok(value),
        (None, None) => Err(AppleError::Failed("Empty reply from the Apple Intelligence bridge".into())),
    }
}

/// Whether the on-device language model can run, and its context size.
#[command]
pub fn availability() -> ModelStatus {
    let availability = Availability::from_code(bridge::availability());
    let context_tokens = if matches!(availability, Availability::Available) { bridge::context_size() } else { 0 };
    ModelStatus { availability, context_tokens }
}

/// One generation, `id` chosen by the webview. `schema` (JSON Schema) → guided JSON output; none → plain text.
/// `generate_cancel` stops it.
#[command]
pub async fn generate(id: u32, instructions: String, prompt: String, schema: Option<String>) -> Result<String, AppleError> {
    off_main(move || {
        let timeout = GENERATE_TIMEOUT.as_millis() as u64;
        take::<Text>(bridge::generate(id, &instructions, &prompt, schema.as_deref().unwrap_or(""), timeout)).map(|g| g.text)
    })
    .await
}

/// Stops generation `id` on the device; its `generate` call returns at once.
#[command]
pub fn generate_cancel(id: u32) {
    bridge::generate_cancel(id);
}

/// Each streaming reply's stop flag, by its channel id.
#[derive(Default)]
pub struct Streams(Mutex<HashMap<u32, Arc<AtomicBool>>>);

/// Commands run concurrently, so a Stop can arrive before its stream starts: whichever comes first makes the flag.
impl Streams {
    fn flag(&self, id: u32) -> Arc<AtomicBool> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).entry(id).or_default().clone()
    }

    fn stop(&self, id: u32) {
        self.flag(id).store(true, Ordering::Relaxed);
    }

    fn end(&self, id: u32) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
    }
}

/// A chat reply (`{instructions, turns}` JSON) streamed to `on_delta`, closed by `finish`; `stream_cancel` stops it.
#[command]
pub async fn stream(request: String, on_delta: Channel<StreamEvent>, streams: State<'_, Streams>) -> Result<(), AppleError> {
    let id = on_delta.id();
    let stop = streams.flag(id);
    let result = off_main(move || {
        let timeout = GENERATE_TIMEOUT.as_millis() as u64;
        let send = |delta: &str| !stop.load(Ordering::Relaxed) && on_delta.send(StreamEvent::Delta(delta.to_owned())).is_ok();
        take::<Empty>(bridge::stream(&request, timeout, send))?;
        on_delta.send(StreamEvent::Finish).map_err(|e| AppleError::Failed(e.to_string()))
    })
    .await;
    streams.end(id);
    result
}

/// Stops the reply streaming to channel `channel_id`; what it sent so far stays.
#[command]
pub fn stream_cancel(channel_id: u32, streams: State<'_, Streams>) {
    streams.stop(channel_id);
}

#[command]
pub async fn speech_status(language: String) -> Result<SpeechStatus, AppleError> {
    off_main(move || bridge::speech_status(&language).map_err(AppleError::Failed)).await
}

/// The Speech Recognition prompt (only while undecided); whether it's granted.
#[command]
pub async fn speech_request_access() -> Result<bool, AppleError> {
    off_main(|| take::<Granted>(bridge::speech_request_access()).map(|g| g.granted)).await
}

/// Downloads the language's speech model when missing.
#[command]
pub async fn speech_prepare(language: String) -> Result<(), AppleError> {
    off_main(move || take::<Empty>(bridge::speech_prepare(&language)).map(|_| ())).await
}

/// Transcribes a raw-body WAV part (header `x-language`) via a temp file, since SpeechAnalyzer reads files.
#[command]
pub async fn speech_transcribe(request: Request<'_>) -> Result<Vec<SpeechSegment>, AppleError> {
    let wav = raw_body(&request, "a raw WAV body")?;
    let language = header(&request, LANGUAGE_HEADER).unwrap_or(DEFAULT_LANGUAGE).to_string();
    off_main(move || {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or_default();
        let path = std::env::temp_dir().join(format!("roci-apple-speech-{}-{stamp}.wav", std::process::id()));
        std::fs::write(&path, &wav).map_err(|e| AppleError::Failed(e.to_string()))?;
        let result = take::<Transcription>(bridge::speech_transcribe(&path.to_string_lossy(), &language));
        let _ = std::fs::remove_file(&path);
        result.map(|t| t.segments)
    })
    .await
}

/// Starts live speech stream `id` (the webview's): its own analyzer, so several run at once.
#[command]
pub async fn speech_live_start(id: u32, language: String) -> Result<(), AppleError> {
    off_main(move || take::<Empty>(bridge::speech_live_start(id, &language)).map(|_| ())).await
}

/// Feeds a live stream (header `x-stream`) 16 kHz mono f32, the raw little-endian body; answers with the text so far.
#[command]
pub async fn speech_live_feed(request: Request<'_>) -> Result<LiveText, AppleError> {
    let pcm = raw_body(&request, "raw f32 samples")?;
    let id = header(&request, STREAM_HEADER)
        .and_then(|value| value.parse::<u32>().ok())
        .ok_or_else(|| AppleError::Failed("expected an x-stream id".into()))?;
    off_main(move || take::<LiveText>(bridge::speech_live_feed(id, &pcm))).await
}

/// Ends live stream `id` once its audio is transcribed; answers with everything it heard.
#[command]
pub async fn speech_live_finish(id: u32) -> Result<String, AppleError> {
    off_main(move || take::<Text>(bridge::speech_live_finish(id)).map(|t| t.text)).await
}

/// Abandons live stream `id`, if it's running.
#[command]
pub fn speech_live_cancel(id: u32) {
    bridge::speech_live_cancel(id);
}

/// A raw invoke body (`what` names it in the error), copied to move off the main thread.
fn raw_body(request: &Request<'_>, what: &str) -> Result<Vec<u8>, AppleError> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err(AppleError::Failed(format!("expected {what}"))),
    }
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|value| value.to_str().ok())
}
