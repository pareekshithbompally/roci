//! Tauri commands. Bridge calls block (Swift semaphores), so they run off the main thread.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::command;
use tauri::ipc::{InvokeBody, Request};

use crate::bridge;
use crate::types::{
    AppleError, Availability, Empty, Generated, Granted, ModelStatus, Reply, SpeechSegment, SpeechStatus, Transcription,
};

/// Longest one generation may take (a full summary measured ~20 s on Apple silicon).
const GENERATE_TIMEOUT: Duration = Duration::from_secs(120);
const LANGUAGE_HEADER: &str = "x-language";
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

/// One generation. `schema` (JSON Schema) → guided JSON output; none → plain text.
#[command]
pub async fn generate(instructions: String, prompt: String, schema: Option<String>) -> Result<String, AppleError> {
    off_main(move || {
        let timeout = GENERATE_TIMEOUT.as_millis() as u64;
        take::<Generated>(bridge::generate(&instructions, &prompt, schema.as_deref().unwrap_or(""), timeout)).map(|g| g.text)
    })
    .await
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

/// Transcribes one PCM WAV part on this Mac, sent as the raw invoke body (header `x-language`, default `en`).
/// SpeechAnalyzer reads files, so the part goes through a temporary file that is removed afterwards.
#[command]
pub async fn speech_transcribe(request: Request<'_>) -> Result<Vec<SpeechSegment>, AppleError> {
    let InvokeBody::Raw(wav) = request.body() else {
        return Err(AppleError::Failed("expected a raw WAV body".into()));
    };
    let language = request
        .headers()
        .get(LANGUAGE_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or(DEFAULT_LANGUAGE)
        .to_string();
    let wav = wav.clone();
    off_main(move || {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or_default();
        let path = std::env::temp_dir().join(format!("kasset-apple-speech-{}-{stamp}.wav", std::process::id()));
        std::fs::write(&path, &wav).map_err(|e| AppleError::Failed(e.to_string()))?;
        let result = take::<Transcription>(bridge::speech_transcribe(&path.to_string_lossy(), &language));
        let _ = std::fs::remove_file(&path);
        result.map(|t| t.segments)
    })
    .await
}
