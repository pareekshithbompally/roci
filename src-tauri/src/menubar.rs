//! Backend-owned menubar (system tray) for Kasset.ai.
//!
//! Faithful port of Hex's menubar pattern (`src/macos_rune/status_item.rs`
//! driven by the pump in `src/macos_rune.rs`, shared menu model in
//! `src/desktop/tray_menu.rs`):
//!
//! - One backend module owns the tray icon, menu, and visibility state.
//!   The frontend never constructs tray or menu objects; it only reports
//!   recording transitions and receives action events.
//! - Menu rows follow Hex's `Row`/`ROWS` order: recording group first,
//!   then window actions, then app actions.
//! - `icon_shown(!hide_icon || recording_active)`: the icon can be hidden
//!   by preference but is forced visible while recording.
//! - Recording transitions swap the icon (template idle <-> red recording)
//!   and retitle the Stop item with elapsed time, like Hex's
//!   `update_meeting()`.
//! - Menu clicks dispatch through one function, like Hex's
//!   `Pump::status_action`. Show is handled inline; recording and quit
//!   actions go to the frontend, and the real exit runs once through
//!   `menubar_quit` so the existing `ExitRequested` guard always runs.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem};
use tauri::path::BaseDirectory;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

/// Tray icon id. Single instance for the whole app lifetime.
pub const TRAY_ID: &str = "kasset-menubar";

/// Frontend event name carrying a menu item id as payload.
pub const MENUBAR_ACTION_EVENT: &str = "menubar-action";

/// Menu item ids. These are the wire contract: the frontend maps them to
/// `TrayAction` and Hex's `TrayCommand`/`StatusItemAction` equivalents are
/// `Show`, `StartRecording`/`RecordMeeting`, `StopRecording`/`StopMeeting`,
/// `Quit`.
pub mod item {
    pub const SHOW: &str = "show";
    pub const START_RECORDING: &str = "start_recording";
    pub const STOP_RECORDING: &str = "stop_recording";
    pub const QUIT: &str = "quit";
}

/// Default tooltip, mirroring `APP_CONFIG.tray.tooltip`.
const DEFAULT_TOOLTIP: &str = "Kasset.ai";

/// Bundled icon resources (see `tauri.conf.json > bundle.resources`).
const IDLE_ICON_RESOURCE: &str = "icons/iconTemplate@2x.png";
const RECORDING_ICON_RESOURCE: &str = "icons/iconRecordingTemplate@2x.png";

/// Menubar state shared between commands and the ticker thread.
/// Item handles are cloned `Arc` wrappers, so sharing them is cheap.
struct StateData {
    recording_active: bool,
    paused: bool,
    elapsed_secs: u64,
    close_to_tray: bool,
    hide_icon: bool,
    start_item: Option<MenuItem<Wry>>,
    stop_item: Option<MenuItem<Wry>>,
}

impl Default for StateData {
    fn default() -> Self {
        Self {
            recording_active: false,
            paused: false,
            elapsed_secs: 0,
            close_to_tray: true,
            hide_icon: false,
            start_item: None,
            stop_item: None,
        }
    }
}

/// Managed menubar state (Hex: settings + tray state behind the pump).
#[derive(Clone, Default)]
pub struct MenubarShared(Arc<Mutex<StateData>>);

impl MenubarShared {
    fn lock(&self) -> std::sync::MutexGuard<'_, StateData> {
        self.0.lock().unwrap_or_else(|poisoned| {
            log::error!("[Menubar] State mutex poisoned, recovering");
            poisoned.into_inner()
        })
    }

    /// Whether closing the window should hide to tray instead of quitting.
    pub fn close_to_tray(&self) -> bool {
        self.lock().close_to_tray
    }
}

/// Hex visibility rule: preference hides the icon, recording forces it back.
fn icon_shown(hide_icon: bool, recording_active: bool) -> bool {
    !hide_icon || recording_active
}

/// `M:SS` elapsed formatting for the Stop item title.
fn format_elapsed(total_secs: u64) -> String {
    format!("{}:{:02}", total_secs / 60, total_secs % 60)
}

/// Stop item title for a recording second count, with pause marker.
fn stop_item_text(elapsed_secs: u64, paused: bool) -> String {
    if paused {
        format!("Stop Recording  {} (paused)", format_elapsed(elapsed_secs))
    } else {
        format!("Stop Recording  {}", format_elapsed(elapsed_secs))
    }
}

fn load_icon(app: &AppHandle, resource: &str) -> Option<Image<'static>> {
    let path = app
        .path()
        .resolve(resource, BaseDirectory::Resource)
        .map_err(|e| {
            log::error!("[Menubar] Failed to resolve icon resource {resource}: {e}");
            e
        })
        .ok()?;
    Image::from_path(&path)
        .map_err(|e| log::error!("[Menubar] Failed to load icon {resource}: {e}"))
        .ok()
}

fn apply_icon(app: &AppHandle, recording: bool) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let resource = if recording {
        RECORDING_ICON_RESOURCE
    } else {
        IDLE_ICON_RESOURCE
    };
    if let Some(image) = load_icon(app, resource) {
        if let Err(e) = tray.set_icon(Some(image)) {
            log::error!("[Menubar] Failed to set tray icon: {e}");
        }
        // Recording icon carries its own red color; idle icon is a template
        // image so macOS tints it (Hex: template image + STATUS_ICON_POINTS).
        if let Err(e) = tray.set_icon_as_template(!recording) {
            log::error!("[Menubar] Failed to set icon template flag: {e}");
        }
    }
}

fn apply_visibility(app: &AppHandle) {
    let (hide_icon, recording_active) = {
        let Some(shared) = app.try_state::<MenubarShared>() else {
            return;
        };
        let state = shared.lock();
        (state.hide_icon, state.recording_active)
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID)
        && let Err(e) = tray.set_visible(icon_shown(hide_icon, recording_active))
    {
        log::error!("[Menubar] Failed to set tray visibility: {e}");
    }
}

/// Refresh menu items for the current recording state (Hex: `update_meeting`).
fn refresh_recording_items(app: &AppHandle) {
    let Some(shared) = app.try_state::<MenubarShared>() else {
        return;
    };
    let (recording_active, paused, elapsed_secs, start_item, stop_item) = {
        let state = shared.lock();
        (
            state.recording_active,
            state.paused,
            state.elapsed_secs,
            state.start_item.clone(),
            state.stop_item.clone(),
        )
    };

    if let Some(item) = start_item {
        let _ = item.set_enabled(!recording_active);
    }
    if let Some(item) = stop_item {
        let _ = item.set_enabled(recording_active);
        let _ = item.set_text(if recording_active {
            stop_item_text(elapsed_secs, paused)
        } else {
            "Stop Recording".to_string()
        });
    }

    apply_icon(app, recording_active);
    apply_visibility(app);
}

/// Dispatch a menu action (Hex: `Pump::status_action`).
fn dispatch(app: &AppHandle, action: &str) {
    match action {
        item::SHOW => crate::window::show_main(app),
        item::START_RECORDING | item::STOP_RECORDING | item::QUIT => {
            if let Err(e) = app.emit(MENUBAR_ACTION_EVENT, action) {
                log::error!("[Menubar] Failed to emit menubar action: {e}");
            }
        }
        other => log::warn!("[Menubar] Unknown menu action: {other}"),
    }
}

/// Build the tray icon and menu (Hex: `status_item::install`). Row order
/// mirrors Hex's `ROWS`: recording group, window action, app actions.
fn install(app: &AppHandle, shared: &MenubarShared) -> tauri::Result<()> {
    let package = app.package_info();
    let about = PredefinedMenuItem::about(
        app,
        Some("Kasset"),
        Some(AboutMetadata {
            name: Some("Kasset".to_string()),
            version: Some(package.version.to_string()),
            copyright: Some("Copyright © 2026 Kasset.ai. All rights reserved.".to_string()),
            ..Default::default()
        }),
    )?;
    let separator0 = PredefinedMenuItem::separator(app)?;
    let start_item = MenuItem::with_id(
        app,
        item::START_RECORDING,
        "Start Recording",
        true,
        None::<&str>,
    )?;
    let stop_item = MenuItem::with_id(
        app,
        item::STOP_RECORDING,
        "Stop Recording",
        false,
        None::<&str>,
    )?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let show_item = MenuItem::with_id(app, item::SHOW, "Show Kasset.ai", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, item::QUIT, "Quit", true, None::<&str>)?;

    // Stash clones for refreshes and the ticker (Hex: pump-held item refs).
    {
        let mut state = shared.lock();
        state.start_item = Some(start_item.clone());
        state.stop_item = Some(stop_item.clone());
    }

    let menu = Menu::with_items(
        app,
        &[
            &about,
            &separator0,
            &start_item,
            &stop_item,
            &separator1,
            &show_item,
            &separator2,
            &quit_item,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(DEFAULT_TOOLTIP)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| dispatch(app, event.id.as_ref()));

    match load_icon(app, IDLE_ICON_RESOURCE) {
        Some(icon) => builder = builder.icon(icon),
        None => log::error!("[Menubar] Idle icon missing, tray starts without icon"),
    }

    builder.build(app)?;

    log::info!("[Menubar] Tray installed");
    Ok(())
}

/// Create the shared state, install the tray, and start the ticker.
/// Call once from the Tauri setup hook.
pub fn setup(app: &AppHandle) {
    let shared = MenubarShared::default();
    app.manage(shared.clone());
    match install(app, &shared) {
        Ok(()) => spawn_ticker(shared),
        Err(e) => log::error!("[Menubar] Tray installation failed: {e}"),
    }
}

/// Start the 1s elapsed ticker (Hex: elapsed button title in `update_meeting`).
/// Backend owns the clock: pause freezes it, resume continues, stop resets.
fn spawn_ticker(shared: MenubarShared) {
    std::thread::Builder::new()
        .name("menubar-ticker".to_string())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(1));
            let (active, paused, elapsed, stop_item) = {
                let mut state = shared.lock();
                if state.recording_active && !state.paused {
                    state.elapsed_secs = state.elapsed_secs.saturating_add(1);
                }
                (
                    state.recording_active,
                    state.paused,
                    state.elapsed_secs,
                    state.stop_item.clone(),
                )
            };
            if !active {
                continue;
            }
            if let Some(item) = stop_item {
                let _ = item.set_text(stop_item_text(elapsed, paused));
            }
        })
        .expect("failed to spawn menubar ticker thread");
}

/// Report a recording transition from the frontend. Backend resets, freezes,
/// and resumes its own elapsed clock; the frontend keeps no tray timer.
#[tauri::command]
pub async fn menubar_set_recording_state(
    app: AppHandle,
    active: bool,
    paused: bool,
) -> Result<(), String> {
    let shared = app
        .try_state::<MenubarShared>()
        .ok_or_else(|| "Menubar not installed".to_string())?;
    {
        let mut state = shared.lock();
        if active && !state.recording_active {
            state.elapsed_secs = 0;
        }
        state.recording_active = active;
        state.paused = active && paused;
        if !active {
            state.elapsed_secs = 0;
        }
    }
    refresh_recording_items(&app);
    Ok(())
}

/// Set the tray tooltip.
#[tauri::command]
pub async fn menubar_set_tooltip(app: AppHandle, tooltip: String) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Err("Menubar not installed".to_string());
    };
    tray.set_tooltip(Some(tooltip))
        .map_err(|e| format!("Failed to set tooltip: {e}"))?;
    Ok(())
}

/// Show or hide the icon, subject to the recording force-visible rule.
#[tauri::command]
pub async fn menubar_set_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let shared = app
        .try_state::<MenubarShared>()
        .ok_or_else(|| "Menubar not installed".to_string())?;
    shared.lock().hide_icon = !visible;
    apply_visibility(&app);
    Ok(())
}

/// Behaviour preferences (Hex: `hide_menu_bar_icon`, `quit_closes_window` labs).
#[tauri::command]
pub async fn menubar_set_prefs(
    app: AppHandle,
    close_to_tray: Option<bool>,
    hide_icon: Option<bool>,
) -> Result<(), String> {
    let shared = app
        .try_state::<MenubarShared>()
        .ok_or_else(|| "Menubar not installed".to_string())?;
    {
        let mut state = shared.lock();
        if let Some(value) = close_to_tray {
            state.close_to_tray = value;
        }
        if let Some(value) = hide_icon {
            state.hide_icon = value;
        }
    }
    apply_visibility(&app);
    Ok(())
}

/// Current menubar status for frontend sync.
#[tauri::command]
pub async fn menubar_get_state(
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let shared = app
        .try_state::<MenubarShared>()
        .ok_or_else(|| "Menubar not installed".to_string())?;
    let state = shared.lock();
    Ok(serde_json::json!({
        "recording": state.recording_active,
        "paused": state.paused,
        "elapsedSecs": state.elapsed_secs,
        "closeToTray": state.close_to_tray,
        "hideIcon": state.hide_icon,
    }))
}

/// Quit through the single exit path (existing guards + cleanup run).
#[tauri::command]
pub async fn menubar_quit(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

/// Read the close-to-tray preference for the window close handler.
/// Defaults to `true` when menubar state is unavailable.
pub fn close_to_tray(app: &AppHandle) -> bool {
    app.try_state::<MenubarShared>()
        .map(|shared| shared.close_to_tray())
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_zero_and_sub_minute_elapsed() {
        assert_eq!(format_elapsed(0), "0:00");
        assert_eq!(format_elapsed(5), "0:05");
        assert_eq!(format_elapsed(59), "0:59");
    }

    #[test]
    fn formats_minute_and_hour_boundaries() {
        assert_eq!(format_elapsed(60), "1:00");
        assert_eq!(format_elapsed(65), "1:05");
        assert_eq!(format_elapsed(3599), "59:59");
        assert_eq!(format_elapsed(3600), "60:00");
    }

    #[test]
    fn stop_title_shows_elapsed_and_pause_marker() {
        assert_eq!(stop_item_text(0, false), "Stop Recording  0:00");
        assert_eq!(stop_item_text(125, false), "Stop Recording  2:05");
        assert_eq!(
            stop_item_text(125, true),
            "Stop Recording  2:05 (paused)"
        );
    }

    #[test]
    fn recording_forces_icon_visible() {
        assert!(icon_shown(false, false));
        assert!(icon_shown(false, true));
        assert!(!icon_shown(true, false));
        // Hex rule: hide preference never hides an active recording.
        assert!(icon_shown(true, true));
    }
}
