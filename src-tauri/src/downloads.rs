//! Web downloads — `<a download>` and blob links (Streamdown's code-block and
//! table buttons, diagrams, images). WKWebView drops them unless the app takes
//! them, so the main webview takes every one: it lands in ~/Downloads (never
//! overwriting), and the webview gets [`FINISHED_EVENT`] with where it went.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, MutexGuard};

use serde::Serialize;
use tauri::webview::DownloadEvent;
use tauri::{Emitter, Manager, Runtime, Webview};

/// Webview: a download finished (`{ path, success }`).
pub const FINISHED_EVENT: &str = "downloads://finished";

/// Where each download was sent, by URL: macOS reports no path on finish.
static DESTINATIONS: LazyLock<Mutex<HashMap<String, PathBuf>>> = LazyLock::new(Default::default);

#[derive(Clone, Serialize)]
struct Finished {
    path: Option<PathBuf>,
    success: bool,
}

/// `on_download` hook for the main webview.
pub fn handle<R: Runtime>(webview: Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            let Ok(dir) = webview.app_handle().path().download_dir() else { return false };
            let name = destination.file_name().map_or_else(|| "download".into(), |n| n.to_owned());
            *destination = available(&dir.join(name));
            destinations().insert(url.to_string(), destination.clone());
        }
        DownloadEvent::Finished { url, success, .. } => {
            let path = destinations().remove(url.as_str());
            if let Err(error) = webview.emit(FINISHED_EVENT, Finished { path, success }) {
                log::warn!("[downloads] {FINISHED_EVENT} failed: {error}");
            }
        }
        _ => {}
    }
    true
}

fn destinations() -> MutexGuard<'static, HashMap<String, PathBuf>> {
    DESTINATIONS.lock().unwrap_or_else(|error| error.into_inner())
}

/// `path`, or `name (2).ext`, `name (3).ext`… — the first that doesn't exist (Finder's rule).
fn available(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..)
        .map(|n| path.with_file_name(format!("{stem} ({n}){ext}")))
        .find(|candidate| !candidate.exists())
        .unwrap_or_else(|| path.to_path_buf())
}
