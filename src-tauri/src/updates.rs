//! App updates, owned here: GitHub's signed `latest.json` is checked shortly after launch and then every 24 h (one
//! sleeping task, no polling), the update found is held, the menu bar, the webview and (once per version) macOS are
//! told, and it installs on request: download, verify, replace, relaunch.

use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notifications::{self as notifications, Action, Category, Notice, Response, Status};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Webview: the update state changed (`UpdateState`).
const STATE_EVENT: &str = "updates://state";
/// The first check waits for launch to settle; later ones follow a day apart.
const FIRST_CHECK: Duration = Duration::from_secs(10);
const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

const NOTICE_ID: &str = "update";
const CATEGORY: &str = "update";
const ACTION_INSTALL: &str = "install";
/// The notification plugin's answer for a click on the banner itself.
const ACTION_OPEN: &str = "open";

/// What the webview shows: the tray row and Settings follow it.
#[derive(Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum UpdateState {
    Idle,
    Available { version: String, notes: Option<String> },
    /// `total` is unknown until the server sends it.
    Downloading { version: String, downloaded: u64, total: Option<u64> },
    Installing { version: String },
    Failed { version: String, error: String },
}

struct Updates {
    state: UpdateState,
    /// The update found by the last check; what Install installs.
    pending: Option<Update>,
    /// The version macOS was last told about: one notification per version.
    notified: Option<String>,
}

static UPDATES: Mutex<Updates> = Mutex::new(Updates { state: UpdateState::Idle, pending: None, notified: None });

fn updates() -> MutexGuard<'static, Updates> {
    UPDATES.lock().unwrap_or_else(|error| error.into_inner())
}

/// The version the menu bar offers: Update to vX… while one waits (or failed and can be retried).
fn offered_version(state: &UpdateState) -> Option<String> {
    match state {
        UpdateState::Available { version, .. } | UpdateState::Failed { version, .. } => Some(version.clone()),
        _ => None,
    }
}

/// Stores `state`, then announces it.
fn set_state(app: &AppHandle, state: UpdateState) {
    updates().state = state.clone();
    publish(app, &state);
}

/// Tells the menu bar and the webview what `state` is.
fn publish(app: &AppHandle, state: &UpdateState) {
    crate::menubar::set_update(app, offered_version(state));
    if let Err(error) = app.emit(STATE_EVENT, state) {
        log::warn!("[updates] state event failed: {error}");
    }
}

// ── Lifecycle ──

/// Registers the notification's Install button and, in release builds, starts the daily check.
pub fn start(app: AppHandle) {
    notifications::add_categories(&[Category {
        id: CATEGORY.into(),
        actions: vec![Action { id: ACTION_INSTALL.into(), title: "Install".into() }],
    }]);
    let handle = app.clone();
    notifications::on_response_received(move |response| handle_response(&handle, response));
    // A development build is never served by the updater: Check for Updates still works on demand.
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            if let Err(error) = check(&app, true).await {
                log::warn!("[updates] scheduled check failed: {error}");
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

/// Asks the endpoint for a newer version; `notify` posts the macOS notification (once per version).
async fn check(app: &AppHandle, notify: bool) -> Result<UpdateState, String> {
    let found = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let state = found.as_ref().map_or(UpdateState::Idle, |update| UpdateState::Available {
        version: update.version.clone(),
        notes: update.body.clone(),
    });
    let announce = {
        let mut updates = updates();
        // A download or install already running keeps its own state.
        if matches!(updates.state, UpdateState::Downloading { .. } | UpdateState::Installing { .. }) {
            return Ok(updates.state.clone());
        }
        updates.pending = found;
        let version = offered_version(&state);
        let first = version.is_some() && updates.notified != version;
        if first {
            updates.notified.clone_from(&version);
        }
        version.filter(|_| first && notify)
    };
    set_state(app, state.clone());
    if let Some(version) = announce {
        post_notice(&version);
    }
    Ok(state)
}

/// Posted only when notifications are already allowed: an update never raises the permission prompt.
fn post_notice(version: &str) {
    if notifications::status() != Status::Authorized {
        return;
    }
    notifications::post(&Notice {
        id: NOTICE_ID.into(),
        title: format!("Roci {version} is available"),
        body: "Install it now, or later from the menu bar.".into(),
        category: Some(CATEGORY.into()),
        user_info: Default::default(),
        kind: None,
    });
}

fn handle_response(app: &AppHandle, response: &Response) {
    if response.id != NOTICE_ID {
        return;
    }
    match response.action.as_str() {
        ACTION_INSTALL => request_install(app),
        ACTION_OPEN => crate::window::show_main(app),
        _ => {}
    }
}

/// Installs from the menu bar or the notification; a failure shows in the tray row.
pub(crate) fn request_install(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = install(&app).await {
            log::warn!("[updates] install failed: {error}");
        }
    });
}

/// Downloads, verifies and installs the waiting update, then relaunches through the normal exit path.
async fn install(app: &AppHandle) -> Result<(), String> {
    // Relaunching would end the recording.
    if crate::audio::commands::capture_active() {
        return Err("Stop recording before updating".into());
    }
    // Claimed under one lock, so a second Install while this one runs finds it already downloading.
    let (update, started) = {
        let mut updates = updates();
        let waiting = matches!(updates.state, UpdateState::Available { .. } | UpdateState::Failed { .. });
        let update = updates.pending.clone().filter(|_| waiting).ok_or("No update is waiting")?;
        updates.state = UpdateState::Downloading { version: update.version.clone(), downloaded: 0, total: None };
        (update, updates.state.clone())
    };
    publish(app, &started);
    let version = update.version.clone();

    let mut downloaded = 0u64;
    let mut shown_percent = None;
    let result = update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                // One event per whole percent, not per network chunk.
                let percent = total.map(|t| downloaded * 100 / t.max(1));
                if percent != shown_percent {
                    shown_percent = percent;
                    set_state(app, UpdateState::Downloading { version: version.clone(), downloaded, total });
                }
            },
            || set_state(app, UpdateState::Installing { version: version.clone() }),
        )
        .await;

    match result {
        Ok(()) => {
            app.request_restart();
            Ok(())
        }
        Err(error) => {
            let error = error.to_string();
            set_state(app, UpdateState::Failed { version, error: error.clone() });
            Err(error)
        }
    }
}

// ── Commands ──

/// Check now (Settings, menu bar); the outcome is returned for the toast, without a notification.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateState, String> {
    check(&app, false).await
}

/// The current state, for a webview that loaded after an event.
#[tauri::command]
pub fn update_state() -> UpdateState {
    updates().state.clone()
}

/// Install the waiting update (the tray row's Update now).
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    install(&app).await
}
