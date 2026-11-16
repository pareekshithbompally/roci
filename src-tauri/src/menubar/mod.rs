//! Backend-owned menu bar: a native menu on the status item (`status-menu` crate). The frontend only reports and
//! receives; `menu` turns the state into the menu's rows, and this module owns the state, the reports in and the actions out.

mod menu;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};

use menu::{menu_sections, ActivityEntry, AgentEntry, MenuSnapshot, MenuRow, RecentMeetingEntry, SpeechModelEntry};

/// Frontend event name carrying an action id as payload.
pub const MENUBAR_ACTION_EVENT: &str = "menubar-action";

/// Action ids: the wire contract the frontend maps to `TrayAction` (`src/services/tauri/types.ts`).
pub mod item {
    pub const SHOW: &str = "show";
    pub const START_RECORDING: &str = "start_recording";
    pub const STOP_RECORDING: &str = "stop_recording";
    pub const PAUSE_RECORDING: &str = "pause_recording";
    pub const RESUME_RECORDING: &str = "resume_recording";
    /// Speech Model choices carry the speech selection key: `speech_model:<provider::model>`.
    pub const SPEECH_MODEL_PREFIX: &str = "speech_model:";
    pub const MANAGE_MODELS: &str = "manage_models";
    pub const MANAGE_AGENTS: &str = "manage_agents";
    pub const NEW_CHAT: &str = "new_chat";
    pub const SEARCH: &str = "search";
    pub const SETTINGS: &str = "settings";
    pub const CHECK_UPDATES: &str = "check_updates";
    pub const INSTALL_UPDATE: &str = "install_update";
    pub const QUIT: &str = "quit";
    // Handled here, never sent to the webview:
    /// Recent meetings carry the meeting id: `open_meeting:<id>`.
    pub const OPEN_MEETING_PREFIX: &str = "open_meeting:";
    /// The next meeting's choices carry its occurrence: `next_meeting_join:<occurrence>`.
    pub const NEXT_MEETING_JOIN_PREFIX: &str = "next_meeting_join:";
    pub const NEXT_MEETING_RECORD_PREFIX: &str = "next_meeting_record:";
}

/// Default tooltip: the app name.
const DEFAULT_TOOLTIP: &str = env!("APP_NAME");

/// Bundled images (see `tauri.conf.json > bundle.resources`); the status menu draws the status item image 18 pt tall.
const IDLE_ICON_RESOURCE: &str = "icons/iconTemplate@2x.png";
const RECORDING_ICON_RESOURCE: &str = "icons/iconRecordingTemplate@2x.png";

/// Agents Roci knows, by the MCP client name each announces (read from their own builds): their name and icon.
const KNOWN_AGENTS: [(&str, &str, &str); 2] = [
    ("claude-code", "Claude Code", "icons/agents/claude-code.png"),
    ("opencode", "OpenCode", "icons/agents/opencode.png"),
];

/// A connected agent's row: Roci's name for it when known, else the title it announced.
fn agent_entry(images: &Images, name: &str, title: &str) -> AgentEntry {
    let known = KNOWN_AGENTS.iter().find(|(client, _, _)| *client == name);
    AgentEntry {
        title: known.map_or(title, |(_, known_title, _)| known_title).to_string(),
        icon: images.agents.get(name).cloned(),
    }
}

/// How often the ticker re-reads the next meeting (its row counts down in minutes).
const NEXT_MEETING_REFRESH_SECS: u64 = 15;

// ── Reports in ──

/// How healthy a status row's service is, drawn as a coloured dot.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
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

/// A Speech Model choice as the frontend sends it.
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

/// Menu bar state shared by the commands, the MCP host and the ticker.
struct StateData {
    recording_active: bool,
    paused: bool,
    elapsed_secs: u64,
    close_to_tray: bool,
    hide_icon: bool,
    tooltip: String,
    /// Ready keyless speech models (this Mac, Apple Speech, Hex), newest report wins.
    speech_models: Vec<SpeechModelEntry>,
    mcp: McpMenuStatus,
    activity: Vec<ActivityEntry>,
    recent_meetings: Vec<RecentMeetingEntry>,
    update_version: Option<String>,
}

impl Default for StateData {
    fn default() -> Self {
        Self {
            recording_active: false,
            paused: false,
            elapsed_secs: 0,
            close_to_tray: true,
            hide_icon: false,
            tooltip: DEFAULT_TOOLTIP.to_string(),
            speech_models: Vec::new(),
            mcp: McpMenuStatus::default(),
            activity: Vec::new(),
            recent_meetings: Vec::new(),
            update_version: None,
        }
    }
}

/// Image files the menu loads, resolved once at setup.
#[derive(Default)]
struct Images {
    idle: String,
    recording: String,
    /// Agents' icons by announced client name.
    agents: HashMap<String, String>,
}

/// Managed menu bar state.
#[derive(Clone, Default)]
pub struct MenubarShared {
    state: Arc<Mutex<StateData>>,
    images: Arc<Images>,
    /// The app's version, shown in the menu's header.
    version: String,
    /// Serializes pushes so the menu receives each state in order (Swift applies them on the main queue in turn).
    push: Arc<Mutex<()>>,
}

/// What the menu receives: the status item (visibility, tooltip, image) and the rows.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MenuState<'a> {
    visible: bool,
    tooltip: &'a str,
    icon: &'a str,
    /// The idle image is a template (macOS tints it); the recording image carries its own red.
    icon_template: bool,
    sections: Vec<Vec<MenuRow>>,
}

impl MenubarShared {
    fn lock(&self) -> std::sync::MutexGuard<'_, StateData> {
        self.state.lock().unwrap_or_else(|poisoned| {
            log::error!("[Menubar] State mutex poisoned, recovering");
            poisoned.into_inner()
        })
    }

    /// The menu's state as JSON; the next meeting is read from the calendar cache before taking the state lock.
    fn menu_json(&self) -> Result<String, String> {
        let next_meeting = crate::meeting_reminders::next_meeting();
        let state = self.lock();
        let snapshot = MenuSnapshot {
            version: self.version.clone(),
            recording_active: state.recording_active,
            paused: state.paused,
            elapsed_secs: state.elapsed_secs,
            next_meeting,
            activity: state.activity.clone(),
            mcp: state.mcp.clone(),
            agents: state
                .mcp
                .agents
                .iter()
                .map(|(name, title)| agent_entry(&self.images, name, title))
                .collect(),
            speech_models: state.speech_models.clone(),
            recent_meetings: state.recent_meetings.clone(),
            update_version: state.update_version.clone(),
        };
        let recording = state.recording_active;
        let menu_state = MenuState {
            visible: icon_shown(state.hide_icon, recording),
            tooltip: &state.tooltip,
            icon: if recording { &self.images.recording } else { &self.images.idle },
            icon_template: !recording,
            sections: menu_sections(&snapshot),
        };
        serde_json::to_string(&menu_state).map_err(|e| format!("menu state: {e}"))
    }

    /// Send the current state to the menu, in order with every other push.
    fn push(&self) {
        let _ordered = self.push.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Err(e) = self.menu_json().and_then(|json| send_to_menu(&json)) {
            log::error!("[Menubar] Failed to update the menu: {e}");
        }
    }

    /// Whether closing the window should hide to the menu bar instead of quitting.
    pub fn close_to_tray(&self) -> bool {
        self.lock().close_to_tray
    }
}

fn send_to_menu(json: &str) -> Result<(), String> {
    status_menu::update(json)
}

/// Preference hides the icon, recording forces it back.
fn icon_shown(hide_icon: bool, recording_active: bool) -> bool {
    !hide_icon || recording_active
}

// ── Actions out ──

/// Actions the webview carries out (it owns recording, chat, search, settings, updates and models).
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

fn emit_action(app: &AppHandle, action: &str) {
    if let Err(e) = app.emit(MENUBAR_ACTION_EVENT, action) {
        log::error!("[Menubar] Failed to emit menubar action: {e}");
    }
}

/// Dispatch a menu action; `roci://record`, `stop`, `show` and `settings` come through here too.
/// The window, next-meeting and recent-meeting actions are handled here; the rest go to the webview.
pub(crate) fn dispatch(app: &AppHandle, action: &str) {
    if action == item::SHOW {
        crate::window::show_main(app);
    } else if let Some(occurrence) = action.strip_prefix(item::NEXT_MEETING_JOIN_PREFIX) {
        crate::meeting_reminders::record_occurrence(occurrence, true);
    } else if let Some(occurrence) = action.strip_prefix(item::NEXT_MEETING_RECORD_PREFIX) {
        crate::meeting_reminders::record_occurrence(occurrence, false);
    } else if let Some(id) = action.strip_prefix(item::OPEN_MEETING_PREFIX) {
        // The same path as `roci://meeting/<id>` and Spotlight results.
        crate::url_actions::open_meeting(app, id.to_string());
    } else if WEBVIEW_ACTIONS.contains(&action) || action.starts_with(item::SPEECH_MODEL_PREFIX) {
        emit_action(app, action);
    } else {
        log::warn!("[Menubar] Unknown menu bar action: {action}");
    }
}

// ── Lifecycle ──

/// A bundled file's absolute path; empty (logged) when it can't be resolved.
fn resource_path(app: &AppHandle, resource: &str) -> String {
    match app.path().resolve(resource, BaseDirectory::Resource) {
        Ok(path) => path.to_string_lossy().into_owned(),
        Err(e) => {
            log::error!("[Menubar] Failed to resolve resource {resource}: {e}");
            String::new()
        }
    }
}

fn resolve_images(app: &AppHandle) -> Images {
    Images {
        idle: resource_path(app, IDLE_ICON_RESOURCE),
        recording: resource_path(app, RECORDING_ICON_RESOURCE),
        agents: KNOWN_AGENTS
            .iter()
            .map(|(name, _, resource)| (name.to_string(), resource_path(app, resource)))
            .collect(),
    }
}

fn install_menu(app: &AppHandle) -> Result<(), String> {
    let handle = app.clone();
    status_menu::install(move |action| dispatch(&handle, action))
}

/// Create the shared state, install the menu, show the first state and start the ticker; call once from setup.
pub fn setup(app: &AppHandle) {
    let shared = MenubarShared {
        images: Arc::new(resolve_images(app)),
        version: app.package_info().version.to_string(),
        ..MenubarShared::default()
    };
    app.manage(shared.clone());
    match install_menu(app) {
        Ok(()) => {
            shared.push();
            spawn_ticker(shared);
            log::info!("[Menubar] Menu installed");
        }
        Err(e) => log::error!("[Menubar] Menu installation failed: {e}"),
    }
}

/// Each second: the recording clock (pause freezes, resume continues, stop resets) and, every few seconds, the next meeting.
fn spawn_ticker(shared: MenubarShared) {
    std::thread::Builder::new()
        .name("menubar-ticker".to_string())
        .spawn(move || {
            let mut next_meeting = crate::meeting_reminders::next_meeting();
            let mut seconds: u64 = 0;
            loop {
                std::thread::sleep(Duration::from_secs(1));
                seconds = seconds.wrapping_add(1);
                let ticking = {
                    let mut state = shared.lock();
                    let ticking = state.recording_active && !state.paused;
                    if ticking {
                        state.elapsed_secs = state.elapsed_secs.saturating_add(1);
                    }
                    ticking
                };
                let meeting_changed = seconds % NEXT_MEETING_REFRESH_SECS == 0 && {
                    let next = crate::meeting_reminders::next_meeting();
                    std::mem::replace(&mut next_meeting, next.clone()) != next
                };
                if ticking || meeting_changed {
                    shared.push();
                }
            }
        })
        .expect("failed to spawn menubar ticker thread");
}

// ── Commands ──

/// Apply one report and push the menu when it changed what the menu shows.
fn report(app: &AppHandle, apply: impl FnOnce(&mut StateData) -> bool) -> Result<(), String> {
    let shared = app
        .try_state::<MenubarShared>()
        .ok_or_else(|| "Menubar not installed".to_string())?;
    let changed = apply(&mut shared.lock());
    if changed {
        shared.push();
    }
    Ok(())
}

/// Report a recording transition from the frontend; the backend keeps the only elapsed clock.
#[tauri::command]
pub async fn menubar_set_recording_state(app: AppHandle, active: bool, paused: bool) -> Result<(), String> {
    crate::call_detection::recording_changed(active);
    report(&app, |state| {
        if active != state.recording_active {
            state.elapsed_secs = 0;
        }
        state.recording_active = active;
        state.paused = active && paused;
        true
    })
}

/// The ready keyless speech models and the selected one.
#[tauri::command]
pub async fn menubar_set_speech_models(app: AppHandle, models: Vec<SpeechModelArg>) -> Result<(), String> {
    let models: Vec<SpeechModelEntry> =
        models.into_iter().map(|m| SpeechModelEntry { id: m.id, name: m.name, selected: m.selected }).collect();
    report(&app, |state| std::mem::replace(&mut state.speech_models, models.clone()) != models)
}

/// The background jobs running now (the webview's activity tray), one row each.
#[tauri::command]
pub async fn menubar_set_activity(app: AppHandle, items: Vec<ActivityArg>) -> Result<(), String> {
    let activity: Vec<ActivityEntry> = items.into_iter().map(|a| ActivityEntry { label: a.label, percent: a.percent }).collect();
    report(&app, |state| std::mem::replace(&mut state.activity, activity.clone()) != activity)
}

/// The update waiting to install, if any: its row reads "Update to vX…" instead of "Check for Updates…".
#[tauri::command]
pub async fn menubar_set_update(app: AppHandle, version: Option<String>) -> Result<(), String> {
    report(&app, |state| std::mem::replace(&mut state.update_version, version.clone()) != version)
}

/// The most recent meetings, newest first.
#[tauri::command]
pub async fn menubar_set_recent_meetings(app: AppHandle, meetings: Vec<RecentMeetingArg>) -> Result<(), String> {
    let recent: Vec<RecentMeetingEntry> = meetings.into_iter().map(|m| RecentMeetingEntry { id: m.id, title: m.title }).collect();
    report(&app, |state| std::mem::replace(&mut state.recent_meetings, recent.clone()) != recent)
}

/// Update the MCP server row (its dot and connected agents); called by the MCP host.
pub fn set_mcp_status(app: &AppHandle, status: McpMenuStatus) {
    let _ = report(app, |state| std::mem::replace(&mut state.mcp, status.clone()) != status);
}

/// Set the status item's tooltip.
#[tauri::command]
pub async fn menubar_set_tooltip(app: AppHandle, tooltip: String) -> Result<(), String> {
    report(&app, |state| std::mem::replace(&mut state.tooltip, tooltip.clone()) != tooltip)
}

/// Show or hide the status item, subject to the recording force-visible rule.
#[tauri::command]
pub async fn menubar_set_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    report(&app, |state| std::mem::replace(&mut state.hide_icon, !visible) == visible)
}

/// Behaviour preferences: hide the menu bar icon, close the window to the menu bar.
#[tauri::command]
pub async fn menubar_set_prefs(app: AppHandle, close_to_tray: Option<bool>, hide_icon: Option<bool>) -> Result<(), String> {
    report(&app, |state| {
        if let Some(value) = close_to_tray {
            state.close_to_tray = value;
        }
        hide_icon.is_some_and(|value| std::mem::replace(&mut state.hide_icon, value) != value)
    })
}

/// Current menu bar status for frontend sync.
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
    app.try_state::<MenubarShared>().map(|shared| shared.close_to_tray()).unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_agents_show_roci_s_name_for_them() {
        let images = Images::default();
        assert_eq!(agent_entry(&images, "opencode", "opencode").title, "OpenCode");
        assert_eq!(agent_entry(&images, "cursor", "Cursor").title, "Cursor");
    }

    #[test]
    fn recording_forces_icon_visible() {
        assert!(icon_shown(false, false));
        assert!(icon_shown(false, true));
        assert!(!icon_shown(true, false));
        // The hide preference never hides an active recording.
        assert!(icon_shown(true, true));
    }

    #[test]
    fn webview_actions_cover_what_it_handles() {
        assert!(WEBVIEW_ACTIONS.contains(&item::PAUSE_RECORDING));
        assert!(WEBVIEW_ACTIONS.contains(&item::INSTALL_UPDATE));
        assert!(!WEBVIEW_ACTIONS.contains(&item::SHOW));
    }
}
