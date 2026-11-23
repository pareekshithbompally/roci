//! Watches the Hex app's meeting-finished SSE stream and reports on `hex://events`. Between subscriptions it waits for Hex's
//! folder to change (Hex writes `local-api.json` on launch, removes it on quit, and saves Labs to `settings.json`), not a timer.

use serde::Serialize;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_http::reqwest::StatusCode;

use super::client::client;
use super::discovery;

pub const MEETING_FINISHED_EVENT: &str = "hex://meeting-finished";
pub const EVENTS_STATE_EVENT: &str = "hex://events";

const PATH: &str = "/meetings/events";
/// Hex's folder under the data dir (its discovery file and settings live there).
const HEX_DIR: &str = "hex";
/// After Hex's folder changes, the moment Hex takes to finish writing (and serving) before Roci looks.
const SETTLE: Duration = Duration::from_millis(500);

/// What the watcher is doing, for the integration row.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum EventsState {
    /// Subscribed: new meetings arrive as they finish.
    Live,
    /// Hex runs, but Labs › "Meeting finished event" is off.
    LabsOff,
    /// Hex isn't running (or dropped the stream); waiting for it to start.
    Waiting,
}

#[derive(Clone, Serialize)]
struct MeetingFinished {
    id: String,
}

#[derive(serde::Deserialize)]
struct EventData {
    #[serde(rename = "type")]
    kind: String,
    id: String,
}

/// How one subscription ended.
enum Ended {
    LabsOff,
    Dropped,
}

/// Runs until the task is aborted (integration turned off or app exit).
pub async fn watch(app: AppHandle, data_dir: PathBuf) {
    let (changed, mut changes) = mpsc::unbounded_channel();
    // Held for the task's life: dropping it stops the folder events.
    let Some(mut folder) = watch_folder(&data_dir, changed.clone()) else { return report(&app, EventsState::Waiting) };
    loop {
        // Changes before this attempt are covered by it; one during it means look again at once.
        while changes.try_recv().is_ok() {}
        let state = match subscribe(&app, &data_dir).await {
            Ended::LabsOff => EventsState::LabsOff,
            Ended::Dropped => EventsState::Waiting,
        };
        report(&app, state);
        if changes.recv().await.is_none() {
            return;
        }
        // Hex's folder appeared (Hex's first launch): watch inside it from now on.
        if !folder.inside && data_dir.join(HEX_DIR).is_dir() {
            let Some(inside) = watch_folder(&data_dir, changed.clone()) else { return report(&app, EventsState::Waiting) };
            folder = inside;
        }
        tokio::time::sleep(SETTLE).await;
    }
}

/// The folder watch; `inside`: on Hex's folder itself, rather than its parent while it doesn't exist yet.
struct FolderWatch {
    _watcher: RecommendedWatcher,
    inside: bool,
}

/// Watches Hex's folder, or the data dir until it exists; any change in Hex's folder is sent on `changed`.
fn watch_folder(data_dir: &Path, changed: mpsc::UnboundedSender<()>) -> Option<FolderWatch> {
    start_watch(data_dir, changed)
        .inspect_err(|error| log::warn!("[hex] can't watch Hex's folder: {error}"))
        .ok()
}

fn start_watch(data_dir: &Path, changed: mpsc::UnboundedSender<()>) -> notify::Result<FolderWatch> {
    let hex_dir = data_dir.join(HEX_DIR);
    let target = hex_dir.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if event.is_ok_and(|event| event.paths.iter().any(|path| path.starts_with(&target))) {
            let _ = changed.send(());
        }
    })?;
    // Recursive from the data dir would wake on every app's files; the folder itself, or its parent until it exists.
    let inside = hex_dir.is_dir();
    watcher.watch(if inside { &hex_dir } else { data_dir }, RecursiveMode::NonRecursive)?;
    Ok(FolderWatch { _watcher: watcher, inside })
}

/// One subscription: forwards `meeting.finished` ids until the stream ends.
async fn subscribe(app: &AppHandle, data_dir: &Path) -> Ended {
    let Ok(endpoint) = discovery::read(data_dir) else { return Ended::Dropped };
    let response = client()
        .get(format!("{}{PATH}", endpoint.base_url))
        .bearer_auth(&endpoint.token)
        .send()
        .await;
    let mut response = match response {
        Ok(response) if response.status() == StatusCode::NOT_FOUND => return Ended::LabsOff,
        Ok(response) if response.status().is_success() => response,
        _ => return Ended::Dropped,
    };
    report(app, EventsState::Live);

    let mut buffer = String::new();
    while let Ok(Some(chunk)) = response.chunk().await {
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(end) = buffer.find('\n') {
            let line: String = buffer.drain(..=end).collect();
            forward(app, line.trim_end());
        }
    }
    Ended::Dropped
}

/// `data: {"type":"meeting.finished","id":"…"}` → the webview. Keepalive comments are ignored.
fn forward(app: &AppHandle, line: &str) {
    let Some(json) = line.strip_prefix("data:") else { return };
    let Ok(event) = serde_json::from_str::<EventData>(json.trim()) else { return };
    if event.kind == "meeting.finished" {
        if let Err(error) = app.emit(MEETING_FINISHED_EVENT, MeetingFinished { id: event.id }) {
            log::warn!("[hex] meeting-finished event failed: {error}");
        }
    }
}

fn report(app: &AppHandle, state: EventsState) {
    if let Err(error) = app.emit(EVENTS_STATE_EVENT, state) {
        log::warn!("[hex] events state failed: {error}");
    }
}
