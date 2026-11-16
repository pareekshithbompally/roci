//! The tray menu as rows, built from one snapshot: recorder, background work, status, quick actions, app, quit.
//! Sections with nothing to show are left out with their separator.

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, IconMenuItem, IsMenuItem, Menu, MenuItem, NativeIcon, PredefinedMenuItem, Submenu};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Wry};

use super::{item, McpMenuStatus, StatusLevel};
use crate::meeting_reminders::NextMeeting;

// ── Labels ──

const RECORD_LABEL: &str = "Record Meeting";
const PAUSE_LABEL: &str = "Pause";
const RESUME_LABEL: &str = "Resume";
const JOIN_RECORD_LABEL: &str = "Join & Record";
const RECORD_NEXT_LABEL: &str = "Record";
const MCP_LABEL: &str = "MCP Server";
const MANAGE_AGENTS_LABEL: &str = "Manage Agents…";
const SPEECH_MODEL_LABEL: &str = "Speech Model";
const NO_MODELS_LABEL: &str = "No downloaded models";
const MANAGE_MODELS_LABEL: &str = "Manage Models…";
const NEW_CHAT_LABEL: &str = "New Chat";
const SEARCH_LABEL: &str = "Search";
const RECENT_LABEL: &str = "Recent Meetings";
const OPEN_LABEL: &str = "Open Kasset";
const SETTINGS_LABEL: &str = "Settings…";
const CHECK_UPDATES_LABEL: &str = "Check for Updates…";
const QUIT_LABEL: &str = "Quit Kasset";

/// Longest meeting title the Next row shows before it ends in an ellipsis.
const NEXT_TITLE_MAX_CHARS: usize = 40;

/// The app's own shortcuts, mirrored from `APP_SHORTCUTS` (`src/config/shortcuts.config.ts`).
const NEW_CHAT_ACCELERATOR: &str = "CmdOrCtrl+N";
const SEARCH_ACCELERATOR: &str = "CmdOrCtrl+K";
const SETTINGS_ACCELERATOR: &str = "CmdOrCtrl+,";
const QUIT_ACCELERATOR: &str = "CmdOrCtrl+Q";

/// Agents' icons, keyed by the MCP client name each announces (read from their own builds: Claude Code, OpenCode).
const AGENT_ICONS: [(&str, &str); 2] = [
    ("claude-code", "icons/agents/claude-code.png"),
    ("opencode", "icons/agents/opencode.png"),
];

// ── What the menu shows ──

/// One row of the Speech Model submenu, reported by the frontend because the settings live there.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct SpeechModelEntry {
    pub id: String,
    pub name: String,
    pub selected: bool,
}

/// One background job (download, transcription, indexing), reported by the frontend's activity tray.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ActivityEntry {
    pub label: String,
    pub percent: Option<u8>,
}

/// One recent meeting, reported by the frontend's history.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct RecentMeetingEntry {
    pub id: String,
    pub title: String,
}

/// Everything the menu is built from, copied out under the state lock.
#[derive(Clone, Default)]
pub(super) struct MenuSnapshot {
    pub recording_active: bool,
    pub paused: bool,
    pub elapsed_secs: u64,
    pub next_meeting: Option<NextMeeting>,
    pub activity: Vec<ActivityEntry>,
    pub mcp: McpMenuStatus,
    pub speech_models: Vec<SpeechModelEntry>,
    pub recent_meetings: Vec<RecentMeetingEntry>,
    pub update_version: Option<String>,
}

type Row = Box<dyn IsMenuItem<Wry>>;

/// Rows whose text changes while the menu may be open (elapsed time, minutes to the next meeting, a job's percent).
/// They're retitled in place: replacing the menu under an open menu throws the user's click away.
#[derive(Clone, Default)]
pub(super) struct LiveRows {
    pub recording: Option<MenuItem<Wry>>,
    pub next_meeting: Option<Submenu<Wry>>,
    pub activity: Vec<MenuItem<Wry>>,
}

// ── Formatting ──

pub(super) fn format_elapsed(total_secs: u64) -> String {
    format!("{}:{:02}", total_secs / 60, total_secs % 60)
}

pub(super) fn stop_item_text(elapsed_secs: u64, paused: bool) -> String {
    let elapsed = format_elapsed(elapsed_secs);
    if paused {
        format!("Stop Recording · {elapsed} (paused)")
    } else {
        format!("Stop Recording · {elapsed}")
    }
}

fn truncated(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    format!("{}…", text.chars().take(max_chars - 1).collect::<String>().trim_end())
}

pub(super) fn next_meeting_text(meeting: &NextMeeting) -> String {
    let when = if meeting.minutes == 0 { "now".to_string() } else { format!("in {} min", meeting.minutes) };
    format!("Next: {} · {when}", truncated(&meeting.title, NEXT_TITLE_MAX_CHARS))
}

pub(super) fn activity_text(entry: &ActivityEntry) -> String {
    match entry.percent {
        Some(percent) => format!("{} · {percent}%", entry.label),
        None => entry.label.clone(),
    }
}

fn status_icon(level: StatusLevel) -> NativeIcon {
    match level {
        StatusLevel::Available => NativeIcon::StatusAvailable,
        StatusLevel::Starting => NativeIcon::StatusPartiallyAvailable,
        StatusLevel::Unavailable => NativeIcon::StatusUnavailable,
    }
}

/// A bundled image (`tauri.conf.json > bundle.resources`); None, logged, when it's missing.
pub(super) fn load_resource_image(app: &AppHandle, resource: &str) -> Option<Image<'static>> {
    let path = app
        .path()
        .resolve(resource, BaseDirectory::Resource)
        .map_err(|e| log::error!("[Menubar] Failed to resolve resource {resource}: {e}"))
        .ok()?;
    Image::from_path(&path)
        .map_err(|e| log::error!("[Menubar] Failed to load image {resource}: {e}"))
        .ok()
}

fn agent_icon(app: &AppHandle, client_name: &str) -> Option<Image<'static>> {
    let (_, resource) = AGENT_ICONS.iter().find(|(name, _)| *name == client_name)?;
    load_resource_image(app, resource)
}

fn plain(app: &AppHandle, id: impl AsRef<str>, text: &str, accelerator: Option<&str>) -> tauri::Result<Row> {
    Ok(Box::new(MenuItem::with_id(app, id.as_ref(), text, true, accelerator)?))
}

fn submenu(app: &AppHandle, id: &str, text: &str, rows: &[Row]) -> tauri::Result<Submenu<Wry>> {
    let refs: Vec<&dyn IsMenuItem<Wry>> = rows.iter().map(|row| row.as_ref()).collect();
    Submenu::with_id_and_items(app, id, text, true, &refs)
}

// ── Sections ──

/// The next meeting (when not recording), then Record — or Stop and Pause/Resume while recording.
fn recorder_section(app: &AppHandle, s: &MenuSnapshot, live: &mut LiveRows) -> tauri::Result<Vec<Row>> {
    let mut rows: Vec<Row> = Vec::new();
    if !s.recording_active {
        if let Some(meeting) = &s.next_meeting {
            let mut choices = Vec::new();
            if meeting.joinable {
                choices.push(plain(app, format!("{}{}", item::NEXT_MEETING_JOIN_PREFIX, meeting.occurrence), JOIN_RECORD_LABEL, None)?);
            }
            choices.push(plain(app, format!("{}{}", item::NEXT_MEETING_RECORD_PREFIX, meeting.occurrence), RECORD_NEXT_LABEL, None)?);
            let next = submenu(app, item::NEXT_MEETING, &next_meeting_text(meeting), &choices)?;
            live.next_meeting = Some(next.clone());
            rows.push(Box::new(next));
        }
    }
    // One recorder row the ticker retitles: Tauri items have no visibility flag, so Record and Stop never show together.
    let recording_item = if s.recording_active {
        MenuItem::with_id(app, item::STOP_RECORDING, stop_item_text(s.elapsed_secs, s.paused), true, None::<&str>)?
    } else {
        MenuItem::with_id(app, item::START_RECORDING, RECORD_LABEL, true, None::<&str>)?
    };
    live.recording = Some(recording_item.clone());
    rows.push(Box::new(recording_item));
    if s.recording_active {
        let (id, text) = if s.paused { (item::RESUME_RECORDING, RESUME_LABEL) } else { (item::PAUSE_RECORDING, PAUSE_LABEL) };
        rows.push(plain(app, id, text, None)?);
    }
    Ok(rows)
}

/// One row per background job; clicking opens Kasset.
fn activity_section(app: &AppHandle, activity: &[ActivityEntry], live: &mut LiveRows) -> tauri::Result<Vec<Row>> {
    let mut rows: Vec<Row> = Vec::with_capacity(activity.len());
    for (i, entry) in activity.iter().enumerate() {
        let row = MenuItem::with_id(app, format!("{}{i}", item::ACTIVITY_PREFIX), activity_text(entry), true, None::<&str>)?;
        live.activity.push(row.clone());
        rows.push(Box::new(row));
    }
    Ok(rows)
}

/// MCP server with macOS's own status dot (a submenu of connected agents when any), then the Speech Model submenu.
fn status_section(app: &AppHandle, s: &MenuSnapshot) -> tauri::Result<Vec<Row>> {
    let text = format!("{MCP_LABEL} · {}", s.mcp.summary);
    let icon = Some(status_icon(s.mcp.level));
    let mcp: Row = if s.mcp.agents.is_empty() {
        Box::new(IconMenuItem::with_id_and_native_icon(app, item::MCP_STATUS, &text, false, icon, None::<&str>)?)
    } else {
        let mut rows: Vec<Row> = Vec::with_capacity(s.mcp.agents.len() + 2);
        for (i, (name, title)) in s.mcp.agents.iter().enumerate() {
            let id = format!("{}{i}", item::AGENT_PREFIX);
            rows.push(Box::new(IconMenuItem::with_id(app, id, title, true, agent_icon(app, name), None::<&str>)?));
        }
        rows.push(Box::new(PredefinedMenuItem::separator(app)?));
        rows.push(plain(app, item::MANAGE_AGENTS, MANAGE_AGENTS_LABEL, None)?);
        let menu = submenu(app, item::MCP_STATUS, &text, &rows)?;
        menu.set_native_icon(icon)?;
        Box::new(menu)
    };
    Ok(vec![mcp, Box::new(speech_models_menu(app, &s.speech_models)?)])
}

/// The Speech Model submenu, titled with the selected model: downloaded models as check rows, then Manage Models…
fn speech_models_menu(app: &AppHandle, models: &[SpeechModelEntry]) -> tauri::Result<Submenu<Wry>> {
    let mut rows: Vec<Row> = Vec::with_capacity(models.len() + 2);
    if models.is_empty() {
        rows.push(Box::new(MenuItem::with_id(app, item::SPEECH_MODELS_EMPTY, NO_MODELS_LABEL, false, None::<&str>)?));
    }
    for model in models {
        // The selected model never picks again.
        let id = format!("{}{}", item::SPEECH_MODEL_PREFIX, model.id);
        rows.push(Box::new(CheckMenuItem::with_id(app, id, &model.name, !model.selected, model.selected, None::<&str>)?));
    }
    rows.push(Box::new(PredefinedMenuItem::separator(app)?));
    rows.push(plain(app, item::MANAGE_MODELS, MANAGE_MODELS_LABEL, None)?);
    let title = match models.iter().find(|model| model.selected) {
        Some(model) => format!("{SPEECH_MODEL_LABEL} · {}", model.name),
        None => SPEECH_MODEL_LABEL.to_string(),
    };
    submenu(app, item::SPEECH_MODELS, &title, &rows)
}

/// New Chat, Search, and the recent meetings.
fn quick_section(app: &AppHandle, recent: &[RecentMeetingEntry]) -> tauri::Result<Vec<Row>> {
    let mut rows = vec![
        plain(app, item::NEW_CHAT, NEW_CHAT_LABEL, Some(NEW_CHAT_ACCELERATOR))?,
        plain(app, item::SEARCH, SEARCH_LABEL, Some(SEARCH_ACCELERATOR))?,
    ];
    if !recent.is_empty() {
        let meetings = recent
            .iter()
            .map(|m| plain(app, format!("{}{}", item::OPEN_MEETING_PREFIX, m.id), &truncated(&m.title, NEXT_TITLE_MAX_CHARS), None))
            .collect::<tauri::Result<Vec<_>>>()?;
        rows.push(Box::new(submenu(app, item::RECENT_MEETINGS, RECENT_LABEL, &meetings)?));
    }
    Ok(rows)
}

/// Open, Settings, and the update row (Update to vX… when one is waiting).
fn app_section(app: &AppHandle, update_version: Option<&str>) -> tauri::Result<Vec<Row>> {
    let update = match update_version {
        Some(version) => plain(app, item::INSTALL_UPDATE, &format!("Update to v{version}…"), None)?,
        None => plain(app, item::CHECK_UPDATES, CHECK_UPDATES_LABEL, None)?,
    };
    Ok(vec![
        plain(app, item::SHOW, OPEN_LABEL, None)?,
        plain(app, item::SETTINGS, SETTINGS_LABEL, Some(SETTINGS_ACCELERATOR))?,
        update,
    ])
}

/// The tray menu and its live rows (kept so changing text is retitled in place, never by a rebuild).
pub(super) fn build_menu(app: &AppHandle, s: &MenuSnapshot) -> tauri::Result<(Menu<Wry>, LiveRows)> {
    let mut live = LiveRows::default();
    let sections = [
        recorder_section(app, s, &mut live)?,
        activity_section(app, &s.activity, &mut live)?,
        status_section(app, s)?,
        quick_section(app, &s.recent_meetings)?,
        app_section(app, s.update_version.as_deref())?,
        vec![plain(app, item::QUIT, QUIT_LABEL, Some(QUIT_ACCELERATOR))?],
    ];
    let mut rows: Vec<Row> = Vec::new();
    for section in sections.into_iter().filter(|section| !section.is_empty()) {
        if !rows.is_empty() {
            rows.push(Box::new(PredefinedMenuItem::separator(app)?));
        }
        rows.extend(section);
    }
    let refs: Vec<&dyn IsMenuItem<Wry>> = rows.iter().map(|row| row.as_ref()).collect();
    Ok((Menu::with_items(app, &refs)?, live))
}

/// Whether two reports show the same rows (jobs by label), so only their text changed.
pub(super) fn same_activity_rows(a: &[ActivityEntry], b: &[ActivityEntry]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.label == y.label)
}

/// Whether the next meeting is the same row (same occurrence and choices), so only its minutes changed.
pub(super) fn same_next_meeting_row(a: &Option<NextMeeting>, b: &Option<NextMeeting>) -> bool {
    match (a, b) {
        (Some(x), Some(y)) => x.occurrence == y.occurrence && x.joinable == y.joinable,
        (None, None) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_elapsed_and_the_stop_row() {
        assert_eq!(format_elapsed(0), "0:00");
        assert_eq!(format_elapsed(65), "1:05");
        assert_eq!(stop_item_text(65, false), "Stop Recording · 1:05");
        assert_eq!(stop_item_text(65, true), "Stop Recording · 1:05 (paused)");
    }

    #[test]
    fn reads_the_next_meeting_and_shortens_long_titles() {
        let meeting = |title: &str, minutes| NextMeeting { occurrence: "o".into(), title: title.into(), minutes, joinable: true };
        assert_eq!(next_meeting_text(&meeting("Weekly", 12)), "Next: Weekly · in 12 min");
        assert_eq!(next_meeting_text(&meeting("Weekly", 0)), "Next: Weekly · now");
        assert_eq!(truncated("abcdef", 4), "abc…");
    }

    #[test]
    fn shows_a_jobs_percent_when_known() {
        assert_eq!(activity_text(&ActivityEntry { label: "Downloading".into(), percent: Some(42) }), "Downloading · 42%");
        assert_eq!(activity_text(&ActivityEntry { label: "Indexing".into(), percent: None }), "Indexing");
    }

    #[test]
    fn tells_a_text_change_from_a_row_change() {
        let job = |label: &str, percent| ActivityEntry { label: label.into(), percent };
        assert!(same_activity_rows(&[job("Downloading", Some(1))], &[job("Downloading", Some(40))]));
        assert!(!same_activity_rows(&[job("Downloading", Some(1))], &[]));
        let meeting = |occurrence: &str, minutes| Some(NextMeeting { occurrence: occurrence.into(), title: "W".into(), minutes, joinable: true });
        assert!(same_next_meeting_row(&meeting("a", 12), &meeting("a", 11)));
        assert!(!same_next_meeting_row(&meeting("a", 12), &meeting("b", 12)));
    }
}
