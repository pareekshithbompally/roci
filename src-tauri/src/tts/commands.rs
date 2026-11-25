//! Tauri commands for read aloud: list an engine's voices, speak a reply, stop.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{system, text, voice_model, TtsState, VoiceOption};
#[cfg(target_os = "ios")]
use crate::audio_session::{self, Use};
use crate::models::catalog::{self, Kind};
use crate::models::{blocking, store, LocalError, LANGUAGE};

/// The system voices' engine (its id predates iPhone support); every other engine id is a downloaded voice model.
const SYSTEM_VOICES: &str = "macos";
/// Rust → webview: request `id` is now speaking `text` (one chunk of the reply).
const CHUNK_EVENT: &str = "tts://chunk";

#[derive(Clone, Serialize)]
struct Chunk {
    id: u64,
    text: String,
}

/// The voices `engine` can speak in, its default first (a model's are listed before it's downloaded).
#[tauri::command]
pub fn tts_voices(engine: String) -> Result<Vec<VoiceOption>, LocalError> {
    if engine == SYSTEM_VOICES {
        return Ok(system::voices(LANGUAGE));
    }
    let model = catalog::find_kind(&engine, Kind::Voice)?;
    Ok(model.voices.iter().map(|v| VoiceOption { id: v.id.to_string(), name: v.name.to_string(), detail: None }).collect())
}

/// Speaks a reply's markdown with `engine` in `voice`, emitting `tts://chunk` as each chunk begins.
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
    // iPhone: the shared session, refused while a recording holds it; heard with the silent switch on.
    #[cfg(target_os = "ios")]
    audio_session::activate(Use::Playback).map_err(LocalError::Engine)?;
    #[cfg(mobile)]
    let used = app.clone();
    let spoken = blocking(move || {
        if engine == SYSTEM_VOICES {
            return system::speak(&chunks, voice.as_deref(), &stop, on_chunk);
        }
        let model = catalog::find_kind(&engine, Kind::Voice)?;
        store::installed_path(&app, model, model.main_file())?;
        // The Mac: llama-server's speech endpoint; iPhone and iPad: llama.cpp in the app.
        #[cfg(desktop)]
        let synthesize = |chunk: &str| crate::llama_server::speak(&app, model.id, chunk, voice.as_deref());
        #[cfg(mobile)]
        let synthesize = {
            let projector = model.files.iter().find(|f| f.name.contains("mmproj")).ok_or(LocalError::NotDownloaded)?;
            let (path, projector) = (store::installed_path(&app, model, model.main_file())?, store::installed_path(&app, model, projector)?);
            move |chunk: &str| crate::llama::speak(model.id, &path, &projector, chunk, voice.as_deref())
        };
        voice_model::speak(chunks, stop, on_chunk, synthesize)
    })
    .await;
    #[cfg(target_os = "ios")]
    audio_session::deactivate(Use::Playback);
    #[cfg(mobile)]
    crate::llama::touch(&used, Kind::Voice);
    spoken
}

/// A reply's markdown as the plain speech every engine reads, in chunks of at most `max_chars` (cloud voices, called from the webview).
#[tauri::command]
pub fn tts_chunks(text: String, max_chars: usize) -> Vec<String> {
    text::chunks_of(&text::speakable(&text), max_chars)
}

/// Stops the reply speaking now, if any.
#[tauri::command]
pub fn tts_stop(state: State<'_, TtsState>) {
    state.stop();
}
