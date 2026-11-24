//! Roci's curated on-device models: catalog, per-model storage, downloads and deletion.

pub mod catalog;
pub mod commands;
pub mod gpu;
pub mod store;

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::Serialize;

/// Minutes an unused model stays loaded before it's freed; 0 keeps it until Roci quits. The webview sets it from
/// Settings (`modelIdleMinutes`); this default holds until then.
static IDLE_MINUTES: AtomicU64 = AtomicU64::new(5);

/// How long an unused model of any engine stays loaded; `None` keeps it until quit.
pub fn idle_after() -> Option<Duration> {
    match IDLE_MINUTES.load(Ordering::Relaxed) {
        0 => None,
        minutes => Some(Duration::from_secs(minutes * 60)),
    }
}

/// Applies the Settings idle time to models used from now on.
#[tauri::command]
pub fn local_models_set_idle(minutes: u64) {
    IDLE_MINUTES.store(minutes, Ordering::Relaxed);
}

/// The read-aloud voices' language, and a transcription's when the webview sends none.
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

/// Errors of every local-model command, serialized as `{ code, detail? }` for the webview.
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
    /// The speech model neither takes the spoken language nor tells one itself.
    NeedsLanguage,
    /// App data couldn't be read or written.
    Io(String),
}

impl std::fmt::Display for LocalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LocalError::UnknownModel(id) => write!(f, "unknown model {id}"),
            LocalError::NotDownloaded => f.write_str("the model isn't downloaded"),
            LocalError::NeedsLanguage => f.write_str("the model doesn't take the spoken language"),
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
