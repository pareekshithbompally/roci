//! Tauri commands for read aloud: speak a reply in a voice, or stop.

use tauri::{AppHandle, Manager, State};

use super::{macos, text, TtsState};
use crate::models::catalog::{self, Kind};
use crate::models::{store, LocalError};

/// The system voice; every other voice id is a downloaded model.
const MACOS_VOICE: &str = "macos";

/// Speaks a reply's markdown; resolves when it's done or stopped.
#[tauri::command]
pub async fn tts_speak(app: AppHandle, text: String, voice: String) -> Result<(), LocalError> {
    let speakable = text::speakable(&text);
    if speakable.is_empty() {
        return Ok(());
    }
    let stop = app.state::<TtsState>().begin();
    tauri::async_runtime::spawn_blocking(move || {
        if voice == MACOS_VOICE {
            return macos::speak(&speakable, &stop);
        }
        let model = catalog::find_kind(&voice, Kind::Voice)?;
        let dir = store::installed_dir(&app, model)?;
        app.state::<TtsState>().phonon.speak(&dir, text::chunks(&speakable), stop)
    })
    .await
    .map_err(|e| LocalError::Engine(e.to_string()))?
}

/// Stops the reply speaking now, if any.
#[tauri::command]
pub fn tts_stop(state: State<'_, TtsState>) {
    state.stop();
}
