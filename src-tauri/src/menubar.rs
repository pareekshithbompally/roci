//! Backend-owned menubar (system tray): icon, menu and visibility; the frontend only reports and receives.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Deserialize;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::path::BaseDirectory;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

/// Tray icon id. Single instance for the whole app lifetime.
pub const TRAY_ID: &str = "kasset-menubar";

/// Frontend event name carrying a menu item id as payload.
pub const MENUBAR_ACTION_EVENT: &str = "menubar-action";

/// Menu item ids: the wire contract the frontend maps to `TrayAction`.
pub mod item {
    pub const SHOW: &str = "show";
    pub const START_RECORDING: &str = "start_recording";
    pub const STOP_RECORDING: &str = "stop_recording";
    /// Speech Model rows carry the speech selection key: `speech_model:<provider::model>`.
    pub const SPEECH_MODEL_PREFIX: &str = "speech_model:";
    pub const SPEECH_MODELS_EMPTY: &str = "speech_models_empty";
    pub const MANAGE_MODELS: &str = "manage_models";
    pub const SETTINGS: &str = "settings";
    pub const CHECK_UPDATES: &str = "check_updates";
    pub const QUIT: &str = "quit";
    /// Status-only row for Kasset's MCP server (disabled, never dispatched).
    pub const MCP_STATUS: &str = "mcp_status";
}

/// Row labels.
const RECORD_LABEL: &str = "Record Meeting";
const SPEECH_MODEL_LABEL: &str = "Speech Model";
const NO_MODELS_LABEL: &str = "No downloaded models";
const MANAGE_MODELS_LABEL: &str = "Manage Models…";
const SHOW_LABEL: &str = "Show Kasset.ai";
const SETTINGS_LABEL: &str = "Settings…";
const UPDATE_LABEL: &str = "Check for Updates…";
const QUIT_LABEL: &str = "Quit Kasset";
/// Until Kasset's MCP server reports (`mcp_server::host::HostStatus::menu_label`).
const MCP_STARTING_LABEL: &str = "MCP Server: Starting…";

/// Default tooltip, mirroring `APP_CONFIG.tray.tooltip`.
const DEFAULT_TOOLTIP: &str = "Kasset.ai";

/// Bundled icon resources (see `tauri.conf.json > bundle.resources`).
const IDLE_ICON_RESOURCE: &str = "icons/iconTemplate@2x.png";
const RECORDING_ICON_RESOURCE: &str = "icons/iconRecordingTemplate@2x.png";

/// One row of the Speech Model submenu, reported by the frontend because the settings live there.
#[derive(Clone, Debug, Eq, PartialEq)]
struct SpeechModelEntry {
    id: String,
    name: String,
    selected: bool,
}

/// A Speech Model row as the frontend sends it.
#[derive(Clone, Debug, Deserialize)]
pub struct SpeechModelArg {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub selected: bool,
}

impl From<SpeechModelArg> for SpeechModelEntry {
    fn from(arg: SpeechModelArg) -> Self {
        Self {
            id: arg.id,
            name: arg.name,
            selected: arg.selected,
        }
    }
}

/// Menubar state shared between commands and the ticker thread; item handles are cheap `Arc` clones.
struct StateData {
    recording_active: bool,
    paused: bool,
    elapsed_secs: u64,
    close_to_tray: bool,
    hide_icon: bool,
    /// Ready keyless speech models (this Mac, Apple Speech, Hex), newest report wins.
    speech_models: Vec<SpeechModelEntry>,
    /// Kasset's MCP server, as its status row reads.
    mcp_status: String,
    /// The recorder row: Record when idle, Stop while recording; the ticker retitles it with elapsed time.
    recording_item: Option<MenuItem<Wry>>,
}

impl Default for StateData {
    fn default() -> Self {
        Self {
            recording_active: false,
            paused: false,
            elapsed_secs: 0,
            close_to_tray: true,
            hide_icon: false,
            speech_models: Vec::new(),
            mcp_status: MCP_STARTING_LABEL.to_string(),
            recording_item: None,
        }
    }
}

/// Managed menubar state.
#[derive(Clone, Default)]
pub struct MenubarShared {
    state: Arc<Mutex<StateData>>,
    /// Serializes menu rebuilds; apart from the state lock because building items blocks on the main thread.
    menu: Arc<Mutex<()>>,
}

/// The fields the menu is built from, copied out under the state lock.
#[derive(Clone, Default)]
struct MenuSnapshot {
    recording_active: bool,
    paused: bool,
    elapsed_secs: u64,
    speech_models: Vec<SpeechModelEntry>,
    mcp_status: String,
}

impl StateData {
    fn snapshot(&self) -> MenuSnapshot {
        MenuSnapshot {
            recording_active: self.recording_active,
            paused: self.paused,
            elapsed_secs: self.elapsed_secs,
            speech_models: self.speech_models.clone(),
            mcp_status: self.mcp_status.clone(),
        }
    }
}

impl MenubarShared {
    fn lock(&self) -> std::sync::MutexGuard<'_, StateData> {
        self.state.lock().unwrap_or_else(|poisoned| {
            log::error!("[Menubar] State mutex poisoned, recovering");
            poisoned.into_inner()
        })
    }

    fn lock_menu(&self) -> std::sync::MutexGuard<'_, ()> {
        self.menu.lock().unwrap_or_else(|poisoned| {
            log::error!("[Menubar] Menu mutex poisoned, recovering");
            poisoned.into_inner()
        })
    }

    fn snapshot(&self) -> MenuSnapshot {
        self.lock().snapshot()
    }

    /// Whether closing the window should hide to tray instead of quitting.
    pub fn close_to_tray(&self) -> bool {
        self.lock().close_to_tray
    }
}

/// Preference hides the icon, recording forces it back.
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

/// Menu id of one Speech Model row.
fn speech_model_action(model_id: &str) -> String {
    format!("{}{}", item::SPEECH_MODEL_PREFIX, model_id)
}

/// Whether a menu action picks a speech model.
fn is_speech_model_action(action: &str) -> bool {
    action.starts_with(item::SPEECH_MODEL_PREFIX)
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
        // The recording icon carries its own red; the idle icon is a template image so macOS tints it.
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

/// The Speech Model submenu: downloaded models as check rows, or a disabled placeholder, then Manage Models…
fn build_speech_models(
    app: &AppHandle,
    models: &[SpeechModelEntry],
) -> tauri::Result<Submenu<Wry>> {
    let mut rows: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::with_capacity(models.len() + 2);
    if models.is_empty() {
        rows.push(Box::new(MenuItem::with_id(
            app,
            item::SPEECH_MODELS_EMPTY,
            NO_MODELS_LABEL,
            false,
            None::<&str>,
        )?));
    } else {
        for model in models {
            // The selected model never picks again.
            rows.push(Box::new(CheckMenuItem::with_id(
                app,
                speech_model_action(&model.id),
                &model.name,
                !model.selected,
                model.selected,
                None::<&str>,
            )?));
        }
    }
    rows.push(Box::new(PredefinedMenuItem::separator(app)?));
    rows.push(Box::new(MenuItem::with_id(
        app,
        item::MANAGE_MODELS,
        MANAGE_MODELS_LABEL,
        true,
        None::<&str>,
    )?));

    let rows: Vec<&dyn IsMenuItem<Wry>> = rows.iter().map(|row| row.as_ref()).collect();
    Submenu::with_items(app, SPEECH_MODEL_LABEL, true, &rows)
}

/// Build the tray menu from state: the meeting recorder, the Speech Model submenu, then the app.
fn build_menu(app: &AppHandle, state: &MenuSnapshot) -> tauri::Result<(Menu<Wry>, MenuItem<Wry>)> {
    // One recorder row: Tauri menu items have no visibility flag, so Record and Stop never show together.
    let recording_item = if state.recording_active {
        MenuItem::with_id(
            app,
            item::STOP_RECORDING,
            stop_item_text(state.elapsed_secs, state.paused),
            true,
            None::<&str>,
        )?
    } else {
        MenuItem::with_id(app, item::START_RECORDING, RECORD_LABEL, true, None::<&str>)?
    };

    let speech_models = build_speech_models(app, &state.speech_models)?;
    let separator0 = PredefinedMenuItem::separator(app)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let mcp_status = MenuItem::with_id(
        app,
        item::MCP_STATUS,
        &state.mcp_status,
        false,
        None::<&str>,
    )?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let show_item = MenuItem::with_id(app, item::SHOW, SHOW_LABEL, true, None::<&str>)?;
    let settings_item = MenuItem::with_id(
        app,
        item::SETTINGS,
        SETTINGS_LABEL,
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let update_item =
        MenuItem::with_id(app, item::CHECK_UPDATES, UPDATE_LABEL, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, item::QUIT, QUIT_LABEL, true, Some("CmdOrCtrl+Q"))?;

    let menu = Menu::with_items(
        app,
        &[
            &recording_item,
            &separator0,
            &speech_models,
            &separator1,
            &mcp_status,
            &separator2,
            &show_item,
            &settings_item,
            &update_item,
            &quit_item,
        ],
    )?;

    Ok((menu, recording_item))
}

/// Rebuild the tray menu from state and swap it in.
fn rebuild_menu(app: &AppHandle) {
    let Some(shared) = app.try_state::<MenubarShared>() else {
        return;
    };
    // One rebuild at a time, each snapshotting after the previous finished, so the last report wins.
    let _build = shared.lock_menu();
    let snapshot = shared.snapshot();
    let (menu, recording_item) = match build_menu(app, &snapshot) {
        Ok(built) => built,
        Err(e) => {
            log::error!("[Menubar] Failed to build menu: {e}");
            return;
        }
    };
    shared.lock().recording_item = Some(recording_item);

    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Err(e) = tray.set_menu(Some(menu)) {
        log::error!("[Menubar] Failed to set tray menu: {e}");
    }
}

/// Refresh the menu, icon, and visibility for the current recording state.
fn refresh_recording_items(app: &AppHandle) {
    let Some(shared) = app.try_state::<MenubarShared>() else {
        return;
    };
    let recording_active = shared.lock().recording_active;

    rebuild_menu(app);
    apply_icon(app, recording_active);
    apply_visibility(app);
}

/// Dispatch a menu action; `kasset://record`, `stop`, `show` and `settings` come through here too.
pub(crate) fn dispatch(app: &AppHandle, action: &str) {
    if action == item::SHOW {
        crate::window::show_main(app);
        return;
    }
    let handled = matches!(
        action,
        item::START_RECORDING
            | item::STOP_RECORDING
            | item::MANAGE_MODELS
            | item::SETTINGS
            | item::CHECK_UPDATES
            | item::QUIT
    ) || is_speech_model_action(action);
    if !handled {
        log::warn!("[Menubar] Unknown menu action: {action}");
        return;
    }
    if let Err(e) = app.emit(MENUBAR_ACTION_EVENT, action) {
        log::error!("[Menubar] Failed to emit menubar action: {e}");
    }
}

/// Build the tray icon and menu: recorder, speech model, app actions.
fn install(app: &AppHandle, shared: &MenubarShared) -> tauri::Result<()> {
    let (menu, recording_item) = build_menu(app, &shared.snapshot())?;
    shared.lock().recording_item = Some(recording_item);

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

/// Create the shared state, install the tray, and start the ticker; call once from setup.
pub fn setup(app: &AppHandle) {
    let shared = MenubarShared::default();
    app.manage(shared.clone());
    match install(app, &shared) {
        Ok(()) => spawn_ticker(shared),
        Err(e) => log::error!("[Menubar] Tray installation failed: {e}"),
    }
}

/// Start the 1s elapsed ticker; the backend owns the clock (pause freezes, resume continues, stop resets).
fn spawn_ticker(shared: MenubarShared) {
    std::thread::Builder::new()
        .name("menubar-ticker".to_string())
        .spawn(move || {
            loop {
                std::thread::sleep(Duration::from_secs(1));
                let (active, paused, elapsed, recording_item) = {
                    let mut state = shared.lock();
                    if state.recording_active && !state.paused {
                        state.elapsed_secs = state.elapsed_secs.saturating_add(1);
                    }
                    (
                        state.recording_active,
                        state.paused,
                        state.elapsed_secs,
                        state.recording_item.clone(),
                    )
                };
                if !active {
                    continue;
                }
                if let Some(item) = recording_item {
                    let _ = item.set_text(stop_item_text(elapsed, paused));
                }
            }
        })
        .expect("failed to spawn menubar ticker thread");
}

/// Report a recording transition from the frontend; the backend keeps the only elapsed clock.
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

/// Replace the Speech Model submenu with the ready models, keeping the check mark and one recorder row.
#[tauri::command]
pub async fn menubar_set_speech_models(
    app: AppHandle,
    models: Vec<SpeechModelArg>,
) -> Result<(), String> {
    let shared = app
        .try_state::<MenubarShared>()
        .ok_or_else(|| "Menubar not installed".to_string())?;
    {
        let mut state = shared.lock();
        state.speech_models = models.into_iter().map(Into::into).collect();
    }
    rebuild_menu(&app);
    Ok(())
}

/// Retitle the MCP status row; the rebuild runs on a blocking worker to avoid a main-thread deadlock.
pub fn set_mcp_status(app: &AppHandle, label: String) {
    let Some(shared) = app.try_state::<MenubarShared>() else {
        return;
    };
    {
        let mut state = shared.lock();
        if state.mcp_status == label {
            return;
        }
        state.mcp_status = label;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || rebuild_menu(&app));
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

/// Behaviour preferences: hide the menu bar icon, close the window to the tray.
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
pub async fn menubar_get_state(app: AppHandle) -> Result<serde_json::Value, String> {
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

/// Read the close-to-tray preference for the window close handler; `true` when state is unavailable.
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
        assert_eq!(stop_item_text(125, true), "Stop Recording  2:05 (paused)");
    }

    #[test]
    fn speech_model_rows_carry_the_model_id() {
        assert_eq!(
            speech_model_action("parakeet-unified-english"),
            "speech_model:parakeet-unified-english"
        );
        assert!(is_speech_model_action(
            "speech_model:whisper-large-v3-turbo"
        ));
        assert!(!is_speech_model_action(item::SETTINGS));
        assert!(!is_speech_model_action("speech_model_typo"));
    }

    #[test]
    fn recording_forces_icon_visible() {
        assert!(icon_shown(false, false));
        assert!(icon_shown(false, true));
        assert!(!icon_shown(true, false));
        // The hide preference never hides an active recording.
        assert!(icon_shown(true, true));
    }
}
