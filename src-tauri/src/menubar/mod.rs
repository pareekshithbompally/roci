//! Backend-owned menubar (system tray): icon, menu and visibility; the frontend only reports and receives.
//! `menu` builds the rows from one snapshot; this module owns the state, the reports in and the actions out.

mod menu;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Deserialize;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

use menu::{
    activity_text, build_menu, load_resource_image, next_meeting_text, same_activity_rows, same_next_meeting_row, stop_item_text,
    ActivityEntry, LiveRows, MenuSnapshot, RecentMeetingEntry, SpeechModelEntry,
};

/// Tray icon id. Single instance for the whole app lifetime.
pub const TRAY_ID: &str = "kasset-menubar";

/// Frontend event name carrying a menu item id as payload.
pub const MENUBAR_ACTION_EVENT: &str = "menubar-action";

/// Menu item ids: the wire contract the frontend maps to `TrayAction` (`src/services/tauri/types.ts`).
pub mod item {
    pub const SHOW: &str = "show";
    pub const START_RECORDING: &str = "start_recording";
    pub const STOP_RECORDING: &str = "stop_recording";
    pub const PAUSE_RECORDING: &str = "pause_recording";
    pub const RESUME_RECORDING: &str = "resume_recording";
    /// Speech Model rows carry the speech selection key: `speech_model:<provider::model>`.
    pub const SPEECH_MODEL_PREFIX: &str = "speech_model:";
    pub const SPEECH_MODELS: &str = "speech_models";
    pub const SPEECH_MODELS_EMPTY: &str = "speech_models_empty";
    pub const MANAGE_MODELS: &str = "manage_models";
    pub const MANAGE_AGENTS: &str = "manage_agents";
    pub const NEW_CHAT: &str = "new_chat";
    pub const SEARCH: &str = "search";
    pub const RECENT_MEETINGS: &str = "recent_meetings";
    // Handled here too: recent meeting rows carry the meeting id, `open_meeting:<id>`.
    pub const OPEN_MEETING_PREFIX: &str = "open_meeting:";
    pub const SETTINGS: &str = "settings";
    pub const CHECK_UPDATES: &str = "check_updates";
    pub const INSTALL_UPDATE: &str = "install_update";
    pub const QUIT: &str = "quit";
    /// Status row for Kasset's MCP server (a submenu of connected agents when any).
    pub const MCP_STATUS: &str = "mcp_status";
    // Handled here, never sent to the webview:
    /// One connected agent's row (opens Manage Agents).
    pub const AGENT_PREFIX: &str = "agent:";
    /// One background job's row (opens Kasset).
    pub const ACTIVITY_PREFIX: &str = "activity:";
    pub const NEXT_MEETING: &str = "next_meeting";
    /// Next meeting's choices carry its occurrence: `next_meeting_join:<occurrence>`.
    pub const NEXT_MEETING_JOIN_PREFIX: &str = "next_meeting_join:";
    pub const NEXT_MEETING_RECORD_PREFIX: &str = "next_meeting_record:";
}

/// Default tooltip, mirroring `APP_CONFIG.tray.tooltip`.
const DEFAULT_TOOLTIP: &str = "Kasset.ai";

/// Bundled icon resources (see `tauri.conf.json > bundle.resources`); macOS draws them 18 pt tall.
const IDLE_ICON_RESOURCE: &str = "icons/iconTemplate@2x.png";
const RECORDING_ICON_RESOURCE: &str = "icons/iconRecordingTemplate@2x.png";

/// How often the ticker re-reads the next meeting (its row counts down in minutes).
const NEXT_MEETING_REFRESH_SECS: u64 = 15;

// ── Reports in ──

/// How healthy a status row's service is, drawn as macOS's own status dot.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum StatusLevel {
    Available,
    #[default]
    Starting,
    Unavailable,
}

/// The MCP server row: its summary, dot, and the agents connected (`(client name, title)`, as each announced itself).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct McpMenuStatus {
    pub summary: String,
    pub level: StatusLevel,
    pub agents: Vec<(String, String)>,
}

impl Default for McpMenuStatus {
    fn default() -> Self {
        Self { summary: "Starting…".to_string(), level: StatusLevel::Starting, agents: Vec::new() }
    }
}

/// A Speech Model row as the frontend sends it.
#[derive(Clone, Debug, Deserialize)]
pub struct SpeechModelArg {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub selected: bool,
}

/// A background job as the frontend sends it.
#[derive(Clone, Debug, Deserialize)]
pub struct ActivityArg {
    pub label: String,
    pub percent: Option<u8>,
}

/// A recent meeting as the frontend sends it.
#[derive(Clone, Debug, Deserialize)]
pub struct RecentMeetingArg {
    pub id: String,
    pub title: String,
}

// ── State ──

/// Menubar state shared between commands and the ticker thread; item handles are cheap `Arc` clones.
#[derive(Default)]
struct StateData {
    recording_active: bool,
    paused: bool,
    elapsed_secs: u64,
    close_to_tray: bool,
    hide_icon: bool,
    /// Ready keyless speech models (this Mac, Apple Speech, Hex), newest report wins.
    speech_models: Vec<SpeechModelEntry>,
    mcp: McpMenuStatus,
    activity: Vec<ActivityEntry>,
    recent_meetings: Vec<RecentMeetingEntry>,
    update_version: Option<String>,
    /// The rows retitled in place (elapsed time, next meeting's minutes, jobs' percent) instead of rebuilt.
    live: LiveRows,
}

impl StateData {
    fn snapshot(&self) -> MenuSnapshot {
        MenuSnapshot {
            recording_active: self.recording_active,
            paused: self.paused,
            elapsed_secs: self.elapsed_secs,
            next_meeting: None,
            activity: self.activity.clone(),
            mcp: self.mcp.clone(),
            speech_models: self.speech_models.clone(),
            recent_meetings: self.recent_meetings.clone(),
            update_version: self.update_version.clone(),
        }
    }
}

/// Managed menubar state.
#[derive(Clone)]
pub struct MenubarShared {
    state: Arc<Mutex<StateData>>,
    /// Serializes menu rebuilds; apart from the state lock because building items blocks on the main thread.
    menu: Arc<Mutex<()>>,
}

impl Default for MenubarShared {
    fn default() -> Self {
        let state = StateData { close_to_tray: true, ..StateData::default() };
        Self { state: Arc::new(Mutex::new(state)), menu: Arc::default() }
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

    /// What the menu shows now; the next meeting is read from the calendar cache outside the state lock.
    fn snapshot(&self) -> MenuSnapshot {
        let mut snapshot = self.lock().snapshot();
        snapshot.next_meeting = crate::meeting_reminders::next_meeting();
        snapshot
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

fn apply_icon(app: &AppHandle, recording: bool) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let resource = if recording {
        RECORDING_ICON_RESOURCE
    } else {
        IDLE_ICON_RESOURCE
    };
    if let Some(image) = load_resource_image(app, resource) {
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

/// Rebuild the tray menu from state and swap it in.
fn rebuild_menu(app: &AppHandle) {
    let Some(shared) = app.try_state::<MenubarShared>() else {
        return;
    };
    // One rebuild at a time, each snapshotting after the previous finished, so the last report wins.
    let _build = shared.lock_menu();
    let snapshot = shared.snapshot();
    let (menu, live) = match build_menu(app, &snapshot) {
        Ok(built) => built,
        Err(e) => {
            log::error!("[Menubar] Failed to build menu: {e}");
            return;
        }
    };
    shared.lock().live = live;

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

/// Actions the webview carries out (it owns recording, chat, search, settings, updates and meetings).
const WEBVIEW_ACTIONS: [&str; 12] = [
    item::START_RECORDING,
    item::STOP_RECORDING,
    item::PAUSE_RECORDING,
    item::RESUME_RECORDING,
    item::MANAGE_MODELS,
    item::MANAGE_AGENTS,
    item::NEW_CHAT,
    item::SEARCH,
    item::SETTINGS,
    item::CHECK_UPDATES,
    item::INSTALL_UPDATE,
    item::QUIT,
];

/// Webview actions that carry an id after their prefix.
const WEBVIEW_ACTION_PREFIXES: [&str; 1] = [item::SPEECH_MODEL_PREFIX];

fn emit_action(app: &AppHandle, action: &str) {
    if let Err(e) = app.emit(MENUBAR_ACTION_EVENT, action) {
        log::error!("[Menubar] Failed to emit menubar action: {e}");
    }
}

/// Dispatch a menu action; `kasset://record`, `stop`, `show` and `settings` come through here too.
/// Window, background-job, next-meeting and recent-meeting rows are handled here; the rest go to the webview.
pub(crate) fn dispatch(app: &AppHandle, action: &str) {
    if action == item::SHOW || action.starts_with(item::ACTIVITY_PREFIX) {
        crate::window::show_main(app);
    } else if action.starts_with(item::AGENT_PREFIX) {
        emit_action(app, item::MANAGE_AGENTS);
    } else if let Some(occurrence) = action.strip_prefix(item::NEXT_MEETING_JOIN_PREFIX) {
        crate::meeting_reminders::record_occurrence(occurrence, true);
    } else if let Some(occurrence) = action.strip_prefix(item::NEXT_MEETING_RECORD_PREFIX) {
        crate::meeting_reminders::record_occurrence(occurrence, false);
    } else if let Some(id) = action.strip_prefix(item::OPEN_MEETING_PREFIX) {
        // The same path as `kasset://meeting/<id>` and Spotlight results.
        crate::url_actions::open_meeting(app, id.to_string());
    } else if WEBVIEW_ACTIONS.contains(&action) || WEBVIEW_ACTION_PREFIXES.iter().any(|p| action.starts_with(p)) {
        emit_action(app, action);
    } else {
        log::warn!("[Menubar] Unknown menu action: {action}");
    }
}

/// Build the tray icon and menu: recorder, speech model, app actions.
fn install(app: &AppHandle, shared: &MenubarShared) -> tauri::Result<()> {
    let (menu, live) = build_menu(app, &shared.snapshot())?;
    shared.lock().live = live;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(DEFAULT_TOOLTIP)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| dispatch(app, event.id.as_ref()));

    match load_resource_image(app, IDLE_ICON_RESOURCE) {
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
        Ok(()) => spawn_ticker(app.clone(), shared),
        Err(e) => log::error!("[Menubar] Tray installation failed: {e}"),
    }
}

/// Start the 1s elapsed ticker; the backend owns the clock (pause freezes, resume continues, stop resets).
fn spawn_ticker(app: AppHandle, shared: MenubarShared) {
    std::thread::Builder::new()
        .name("menubar-ticker".to_string())
        .spawn(move || {
            let mut next_meeting = crate::meeting_reminders::next_meeting();
            let mut seconds: u64 = 0;
            loop {
                std::thread::sleep(Duration::from_secs(1));
                seconds = seconds.wrapping_add(1);
                if seconds % NEXT_MEETING_REFRESH_SECS == 0 {
                    refresh_next_meeting(&app, &mut next_meeting);
                }
                let (active, paused, elapsed, recording_item) = {
                    let mut state = shared.lock();
                    if state.recording_active && !state.paused {
                        state.elapsed_secs = state.elapsed_secs.saturating_add(1);
                    }
                    (
                        state.recording_active,
                        state.paused,
                        state.elapsed_secs,
                        state.live.recording.clone(),
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

/// Follow the next meeting: its minutes are retitled in place; a different meeting (or none) rebuilds the menu.
fn refresh_next_meeting(app: &AppHandle, last: &mut Option<crate::meeting_reminders::NextMeeting>) {
    let next = crate::meeting_reminders::next_meeting();
    if next == *last {
        return;
    }
    let same_row = same_next_meeting_row(last, &next);
    *last = next;
    let row = app.try_state::<MenubarShared>().and_then(|shared| shared.lock().live.next_meeting.clone());
    match (same_row, row, last.as_ref()) {
        (true, Some(row), Some(meeting)) => {
            let _ = row.set_text(next_meeting_text(meeting));
        }
        _ => rebuild_menu(app),
    }
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
        state.speech_models = models
            .into_iter()
            .map(|m| SpeechModelEntry { id: m.id, name: m.name, selected: m.selected })
            .collect();
    }
    rebuild_menu(&app);
    Ok(())
}

/// Update the MCP status row (dot and agents); the rebuild runs on a blocking worker to avoid a main-thread deadlock.
pub fn set_mcp_status(app: &AppHandle, status: McpMenuStatus) {
    let Some(shared) = app.try_state::<MenubarShared>() else {
        return;
    };
    {
        let mut state = shared.lock();
        if state.mcp == status {
            return;
        }
        state.mcp = status;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || rebuild_menu(&app));
}

/// Apply one report to the state and rebuild the menu only when it changed what the menu shows.
fn report(app: &AppHandle, apply: impl FnOnce(&mut StateData) -> bool) -> Result<(), String> {
    let shared = app
        .try_state::<MenubarShared>()
        .ok_or_else(|| "Menubar not installed".to_string())?;
    let changed = apply(&mut shared.lock());
    if changed {
        rebuild_menu(app);
    }
    Ok(())
}

/// The background jobs running now (the webview's activity tray), one row each. A percent change retitles the rows
/// in place; only a job starting or ending rebuilds the menu (a rebuild under an open menu loses the user's click).
#[tauri::command]
pub async fn menubar_set_activity(app: AppHandle, items: Vec<ActivityArg>) -> Result<(), String> {
    let shared = app
        .try_state::<MenubarShared>()
        .ok_or_else(|| "Menubar not installed".to_string())?;
    let activity: Vec<ActivityEntry> = items.into_iter().map(|a| ActivityEntry { label: a.label, percent: a.percent }).collect();
    let rows = {
        let mut state = shared.lock();
        if state.activity == activity {
            return Ok(());
        }
        let same_rows = same_activity_rows(&state.activity, &activity);
        state.activity = activity.clone();
        same_rows.then(|| state.live.activity.clone())
    };
    match rows {
        Some(rows) => {
            for (row, entry) in rows.iter().zip(&activity) {
                let _ = row.set_text(activity_text(entry));
            }
        }
        None => rebuild_menu(&app),
    }
    Ok(())
}

/// The update waiting to install, if any: its row reads "Update to vX…" instead of "Check for Updates…".
#[tauri::command]
pub async fn menubar_set_update(app: AppHandle, version: Option<String>) -> Result<(), String> {
    report(&app, |state| std::mem::replace(&mut state.update_version, version.clone()) != version)
}

/// The most recent meetings, newest first, for the Recent Meetings submenu.
#[tauri::command]
pub async fn menubar_set_recent_meetings(app: AppHandle, meetings: Vec<RecentMeetingArg>) -> Result<(), String> {
    let recent: Vec<RecentMeetingEntry> = meetings.into_iter().map(|m| RecentMeetingEntry { id: m.id, title: m.title }).collect();
    report(&app, |state| std::mem::replace(&mut state.recent_meetings, recent.clone()) != recent)
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
    fn recording_forces_icon_visible() {
        assert!(icon_shown(false, false));
        assert!(icon_shown(false, true));
        assert!(!icon_shown(true, false));
        // The hide preference never hides an active recording.
        assert!(icon_shown(true, true));
    }

    #[test]
    fn webview_actions_cover_the_rows_it_handles() {
        assert!(WEBVIEW_ACTIONS.contains(&item::PAUSE_RECORDING));
        assert!(WEBVIEW_ACTIONS.contains(&item::INSTALL_UPDATE));
        assert!(!WEBVIEW_ACTIONS.contains(&item::SHOW));
        assert!(WEBVIEW_ACTION_PREFIXES.iter().any(|p| "speech_model:on-device::parakeet".starts_with(p)));
    }
}
