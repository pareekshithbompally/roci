//! Roci's curated on-device models: catalog, per-model storage, downloads and deletion.

pub mod catalog;
pub mod commands;
pub mod gpu;
pub mod store;
mod transfer;

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::Serialize;

/// Minutes an unused model stays loaded before it's freed; 0 keeps it until Roci quits. The webview sets it from
/// Settings (`modelIdleMinutes`); this default holds until then.
static IDLE_MINUTES: AtomicU64 = AtomicU64::new(5);

/// The app, for the memory-pressure handler (set once by `watch_pressure`).
static PRESSURE_APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Once at launch: the system's memory-pressure signal (Mac, iPhone, iPad) frees every idle model Roci holds itself: the
/// in-app engine's (iPhone, iPad) and speech-to-text's. On the Mac, llama-server keeps its own models within its margin.
pub fn watch_pressure(app: &tauri::AppHandle) {
    if PRESSURE_APP.set(app.clone()).is_ok() {
        // SAFETY: a plain `extern "C"` function that lives for the whole program.
        unsafe { roci_llama_sys::roci_llama_watch_pressure(on_pressure) }
    }
}

extern "C" fn on_pressure(level: std::ffi::c_int) {
    let Some(app) = PRESSURE_APP.get().cloned() else { return };
    std::thread::spawn(move || {
        #[cfg(mobile)]
        crate::llama::free_all(&format!("memory pressure (level {level})"));
        #[cfg(desktop)]
        log::info!("[memory] memory pressure (level {level})");
        tauri::Manager::state::<crate::stt::SttState>(&app).engine.release_if_idle();
    });
}

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

/// The setting that holds the model directory the user chose (`modelDirectory`, JSON text).
#[cfg(desktop)]
const DIRECTORY_SETTING: &str = "modelDirectory";

/// Applies the Settings model directory (None: Roci's own folder); refused when the folder can't be used, and the one in
/// use stays. A new folder restarts the engine with its models, and search catches up when its model is there.
#[tauri::command]
pub async fn local_models_set_directory(app: tauri::AppHandle, dir: Option<String>) -> Result<(), LocalError> {
    blocking(move || {
        if store::set_directory(dir.map(PathBuf::from))? {
            #[cfg(desktop)]
            crate::llama_server::models_changed();
            if crate::search_index::embedder_installed(&app) {
                crate::search_index::embedder_ready();
            }
        }
        Ok(())
    })
    .await
}

/// Applies the saved model directory as the database opens, before anything lists, loads or indexes a model (called
/// before search's own handler is registered, and handlers run in that order). A folder that can't be used is logged and
/// Roci's own stays.
#[cfg(desktop)]
pub fn follow_saved_directory(app: tauri::AppHandle) {
    tauri_plugin_store::on_database_open(move || {
        let Some(dir) = saved_directory(&app) else { return };
        if let Err(error) = store::set_directory(Some(dir.clone())) {
            log::error!("[models] the saved model folder {} can't be used, Roci's own stays: {error}", dir.display());
        }
    });
}

/// The model directory Settings saved; None when it holds Roci's own (never set, or cleared to `null`).
#[cfg(desktop)]
fn saved_directory(app: &tauri::AppHandle) -> Option<PathBuf> {
    let text = tauri_plugin_store::setting(app, DIRECTORY_SETTING)
        .inspect_err(|error| log::error!("[models] the saved model folder couldn't be read: {error}"))
        .ok()??;
    serde_json::from_str::<Option<String>>(&text).ok().flatten().map(PathBuf::from)
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
