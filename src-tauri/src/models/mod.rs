//! Kasset's curated on-device models: what can be downloaded, where it lives,
//! and its downloads (resume, SHA-256, cancel) and deletion. Every engine that
//! runs a model on this Mac (speech-to-text, read aloud) finds its files here;
//! nothing is bundled in the app.
//!
//! - `catalog`: the curated models, each file pinned to a revision and checksum.
//! - `store`: one folder per model under `<app data>/models/`, and its downloads.
//! - `commands`: list, download, cancel, delete.

pub mod catalog;
pub mod commands;
pub mod store;

use serde::Serialize;

/// The language Kasset speaks and transcribes in unless told otherwise
/// (mirrors `TRANSCRIPTION_CONFIG.language` in the webview).
pub const LANGUAGE: &str = "en";

/// Runs blocking work (a model, the disk) off the async runtime.
pub async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, LocalError> + Send + 'static) -> Result<T, LocalError> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|e| LocalError::Engine(e.to_string()))?
}

/// Downloads running now, managed by Tauri.
#[derive(Default)]
pub struct ModelsState {
    downloads: store::Downloads,
}

/// Errors of every local-model command (models, speech-to-text, read aloud),
/// serialized as `{ code, detail? }` for the webview to map to copy.
#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "detail", rename_all = "kebab-case")]
pub enum LocalError {
    /// No curated model has this id.
    UnknownModel(String),
    /// The model isn't downloaded yet.
    NotDownloaded,
    /// The input audio or text can't be used.
    BadInput(String),
    /// The download failed (network, disk, or a checksum mismatch).
    Download(String),
    /// The engine refused the model or the input.
    Engine(String),
    /// App data couldn't be read or written.
    Io(String),
}

impl std::fmt::Display for LocalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LocalError::UnknownModel(id) => write!(f, "unknown model {id}"),
            LocalError::NotDownloaded => f.write_str("the model isn't downloaded"),
            LocalError::BadInput(detail) | LocalError::Download(detail) | LocalError::Engine(detail) | LocalError::Io(detail) => {
                f.write_str(detail)
            }
        }
    }
}

impl From<std::io::Error> for LocalError {
    fn from(error: std::io::Error) -> Self {
        LocalError::Io(error.to_string())
    }
}
