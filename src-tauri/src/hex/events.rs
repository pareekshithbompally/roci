//! Watches Hex's `GET /meetings/events` (Server-Sent Events) while the Hex
//! integration is on, and tells the webview `hex://meeting-finished` per id.
//! Hex allows one subscriber; the route answers 404 while its Labs toggle
//! "Meeting finished event" is off. The watcher reconnects with backoff and
//! reports its state on `hex://events` so the integration row can say why.

use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_http::reqwest::StatusCode;

use super::client::client;
use super::discovery;

pub const MEETING_FINISHED_EVENT: &str = "hex://meeting-finished";
pub const EVENTS_STATE_EVENT: &str = "hex://events";

const PATH: &str = "/meetings/events";
const FIRST_RETRY: Duration = Duration::from_secs(2);
const MAX_RETRY: Duration = Duration::from_secs(60);
/// While Labs is off, check this often whether it was turned on.
const LABS_OFF_RETRY: Duration = Duration::from_secs(60);

/// What the watcher is doing, for the integration row.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum EventsState {
    /// Subscribed: new meetings arrive as they finish.
    Live,
    /// Hex runs, but Labs › "Meeting finished event" is off.
    LabsOff,
    /// Hex isn't running (or dropped the stream); retrying.
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
    /// `was_live`: the stream had connected, so the next retry starts fast again.
    Dropped { was_live: bool },
}

/// Runs until the task is aborted (integration turned off or app exit).
pub async fn watch(app: AppHandle, data_dir: PathBuf) {
    let mut retry = FIRST_RETRY;
    loop {
        let wait = match subscribe(&app, &data_dir).await {
            Ended::LabsOff => {
                report(&app, EventsState::LabsOff);
                LABS_OFF_RETRY
            }
            Ended::Dropped { was_live } => {
                report(&app, EventsState::Waiting);
                if was_live {
                    retry = FIRST_RETRY;
                }
                retry
            }
        };
        tokio::time::sleep(wait).await;
        retry = (retry * 2).min(MAX_RETRY);
    }
}

/// One subscription: forwards `meeting.finished` ids until the stream ends.
async fn subscribe(app: &AppHandle, data_dir: &PathBuf) -> Ended {
    let Ok(endpoint) = discovery::read(data_dir) else { return Ended::Dropped { was_live: false } };
    let response = client()
        .get(format!("{}{PATH}", endpoint.base_url))
        .bearer_auth(&endpoint.token)
        .send()
        .await;
    let mut response = match response {
        Ok(response) if response.status() == StatusCode::NOT_FOUND => return Ended::LabsOff,
        Ok(response) if response.status().is_success() => response,
        _ => return Ended::Dropped { was_live: false },
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
    Ended::Dropped { was_live: true }
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
