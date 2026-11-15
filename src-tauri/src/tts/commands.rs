//! Tauri commands for read aloud: the voices of an engine, speaking a reply in
//! one, and stopping.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{macos, text, TtsState, VoiceOption};
use crate::models::catalog::{self, Kind};
use crate::models::{blocking, store, LocalError, LANGUAGE};

/// The system voices' engine; every other engine id is a downloaded voice model.
const MACOS_VOICE: &str = "macos";
/// Rust → webview: request `id` is now speaking `text` (one chunk of the reply).
const CHUNK_EVENT: &str = "tts://chunk";

#[derive(Clone, Serialize)]
struct Chunk {
    id: u64,
    text: String,
}

/// The voices `engine` can speak in (Phonon's are listed before it's downloaded).
#[tauri::command]
pub fn tts_voices(engine: String) -> Result<Vec<VoiceOption>, LocalError> {
    if engine == MACOS_VOICE {
        return Ok(macos::voices(LANGUAGE));
    }
    let model = catalog::find_kind(&engine, Kind::Voice)?;
    Ok(model.voices.iter().map(|v| VoiceOption { id: v.name.to_string(), name: v.name.to_string(), detail: None }).collect())
}

/// Speaks a reply's markdown with `engine` in `voice` (None = the engine's
/// default); emits `tts://chunk` as each chunk's audio begins; resolves when
/// it's done or stopped.
#[tauri::command]
pub async fn tts_speak(app: AppHandle, id: u64, text: String, engine: String, voice: Option<String>) -> Result<(), LocalError> {
    let speakable = text::speakable(&text);
    if speakable.is_empty() {
        return Ok(());
    }
    let chunks = text::chunks(&speakable);
    let stop = app.state::<TtsState>().begin();
    let emitter = app.clone();
    let on_chunk = move |text: &str| {
        if let Err(e) = emitter.emit(CHUNK_EVENT, Chunk { id, text: text.to_string() }) {
            log::warn!("[tts] chunk event failed: {e}");
        }
    };
    blocking(move || {
        if engine == MACOS_VOICE {
            return macos::speak(&chunks, voice.as_deref(), &stop, on_chunk);
        }
        let model = catalog::find_kind(&engine, Kind::Voice)?;
        let dir = store::installed_dir(&app, model)?;
        app.state::<TtsState>().phonon.speak(model, &dir, chunks, voice.as_deref(), stop, on_chunk)
    })
    .await
}

/// Stops the reply speaking now, if any.
#[tauri::command]
pub fn tts_stop(state: State<'_, TtsState>) {
    state.stop();
}
