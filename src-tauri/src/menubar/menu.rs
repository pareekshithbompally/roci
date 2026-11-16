//! What the menu bar menu shows, as one serializable view model: Rust owns every row and its words, Swift only turns them into menu items.
//! Sections with nothing to show are left out.

use serde::Serialize;

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
const APP_LABEL: &str = "Kasset";

/// Longest meeting title a row shows before it ends in an ellipsis.
const TITLE_MAX_CHARS: usize = 40;

/// ⌘ keys the menu answers to while open: the app's own (`APP_SHORTCUTS`, `src/config/shortcuts.config.ts`), and Quit's.
const NEW_CHAT_KEY: &str = "n";
const SEARCH_KEY: &str = "k";
const SETTINGS_KEY: &str = ",";
const QUIT_KEY: &str = "q";

// ── What the menu is built from ──

/// One row of the Speech Model choices, reported by the frontend because the settings live there.
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

/// One connected agent's row: its title and, for agents Kasset knows, its icon file.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct AgentEntry {
    pub title: String,
    pub icon: Option<String>,
}

/// Everything the menu is built from, copied out under the state lock (icon paths already resolved).
#[derive(Clone, Default)]
pub(super) struct MenuSnapshot {
    /// The app's version (`tauri.conf.json`), shown in the header.
    pub version: String,
    pub recording_active: bool,
    pub paused: bool,
    pub elapsed_secs: u64,
    pub next_meeting: Option<NextMeeting>,
    pub activity: Vec<ActivityEntry>,
    pub mcp: McpMenuStatus,
    pub agents: Vec<AgentEntry>,
    pub speech_models: Vec<SpeechModelEntry>,
    pub recent_meetings: Vec<RecentMeetingEntry>,
    pub update_version: Option<String>,
}

// ── The view model (the JSON contract with `StatusMenu.swift`) ──

/// One menu item. A row with `children` opens them as a submenu; a row with `action` sends it when picked; the rest only show.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MenuRow {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    /// The key that, with ⌘, picks this row (its key equivalent).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<&'static str>,
    /// A status dot before the label (the system's status images).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dot: Option<StatusLevel>,
    /// An image file shown before the label (agents' icons).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub checked: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<MenuRow>,
}

impl MenuRow {
    fn text(label: impl Into<String>) -> Self {
        Self { label: label.into(), ..Self::default() }
    }

    fn action(label: impl Into<String>, action: impl Into<String>) -> Self {
        Self { label: label.into(), action: Some(action.into()), ..Self::default() }
    }

    /// A row that opens `children` as a submenu; with none, plain text.
    fn submenu(label: impl Into<String>, children: Vec<MenuRow>) -> Self {
        Self { label: label.into(), children, ..Self::default() }
    }

    fn shortcut(mut self, key: &'static str) -> Self {
        self.shortcut = Some(key);
        self
    }
}

// ── Formatting ──

pub(super) fn format_elapsed(total_secs: u64) -> String {
    format!("{}:{:02}", total_secs / 60, total_secs % 60)
}

fn stop_text(elapsed_secs: u64, paused: bool) -> String {
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

fn next_meeting_text(meeting: &NextMeeting) -> String {
    let when = if meeting.minutes == 0 { "now".to_string() } else { format!("in {} min", meeting.minutes) };
    format!("Next: {} · {when}", truncated(&meeting.title, TITLE_MAX_CHARS))
}

// ── Sections ──

/// The next meeting (when not recording), then Record — or Stop and Pause/Resume while recording.
fn recorder_section(s: &MenuSnapshot) -> Vec<MenuRow> {
    if s.recording_active {
        let (pause_id, pause_label) = if s.paused { (item::RESUME_RECORDING, RESUME_LABEL) } else { (item::PAUSE_RECORDING, PAUSE_LABEL) };
        return vec![
            MenuRow { dot: Some(StatusLevel::Unavailable), ..MenuRow::action(stop_text(s.elapsed_secs, s.paused), item::STOP_RECORDING) },
            MenuRow::action(pause_label, pause_id),
        ];
    }
    let mut rows = Vec::new();
    if let Some(meeting) = &s.next_meeting {
        let mut choices = Vec::new();
        if meeting.joinable {
            choices.push(MenuRow::action(JOIN_RECORD_LABEL, format!("{}{}", item::NEXT_MEETING_JOIN_PREFIX, meeting.occurrence)));
        }
        choices.push(MenuRow::action(RECORD_NEXT_LABEL, format!("{}{}", item::NEXT_MEETING_RECORD_PREFIX, meeting.occurrence)));
        rows.push(MenuRow::submenu(next_meeting_text(meeting), choices));
    }
    rows.push(MenuRow::action(RECORD_LABEL, item::START_RECORDING));
    rows
}

/// One row per background job, with its percent once known; clicking opens Kasset.
fn activity_section(activity: &[ActivityEntry]) -> Vec<MenuRow> {
    activity.iter().map(|job| MenuRow::action(activity_text(job), item::SHOW)).collect()
}

fn activity_text(job: &ActivityEntry) -> String {
    match job.percent {
        Some(percent) => format!("{} · {percent}%", job.label),
        None => job.label.clone(),
    }
}

/// MCP server with its status dot (its connected agents open from it), then the Speech Model choices.
fn status_section(s: &MenuSnapshot) -> Vec<MenuRow> {
    let mut agents: Vec<MenuRow> = s
        .agents
        .iter()
        .map(|agent| MenuRow { icon: agent.icon.clone(), ..MenuRow::action(agent.title.clone(), item::MANAGE_AGENTS) })
        .collect();
    if !agents.is_empty() {
        agents.push(MenuRow::action(MANAGE_AGENTS_LABEL, item::MANAGE_AGENTS));
    }
    let mcp = MenuRow { dot: Some(s.mcp.level), ..MenuRow::submenu(format!("{MCP_LABEL} · {}", s.mcp.summary), agents) };
    vec![mcp, speech_models_row(&s.speech_models)]
}

/// The Speech Model row, titled with the selected model: downloaded models to pick from, then Manage Models…
fn speech_models_row(models: &[SpeechModelEntry]) -> MenuRow {
    let mut choices: Vec<MenuRow> = models
        .iter()
        .map(|model| {
            // The selected model never picks again.
            let action = (!model.selected).then(|| format!("{}{}", item::SPEECH_MODEL_PREFIX, model.id));
            MenuRow { action, checked: model.selected, ..MenuRow::text(model.name.clone()) }
        })
        .collect();
    if choices.is_empty() {
        choices.push(MenuRow::text(NO_MODELS_LABEL));
    }
    choices.push(MenuRow::action(MANAGE_MODELS_LABEL, item::MANAGE_MODELS));
    let label = match models.iter().find(|model| model.selected) {
        Some(model) => format!("{SPEECH_MODEL_LABEL} · {}", model.name),
        None => SPEECH_MODEL_LABEL.to_string(),
    };
    MenuRow::submenu(label, choices)
}

/// New Chat, Search, and the recent meetings.
fn quick_section(recent: &[RecentMeetingEntry]) -> Vec<MenuRow> {
    let mut rows = vec![
        MenuRow::action(NEW_CHAT_LABEL, item::NEW_CHAT).shortcut(NEW_CHAT_KEY),
        MenuRow::action(SEARCH_LABEL, item::SEARCH).shortcut(SEARCH_KEY),
    ];
    if !recent.is_empty() {
        let meetings = recent
            .iter()
            .map(|m| MenuRow::action(truncated(&m.title, TITLE_MAX_CHARS), format!("{}{}", item::OPEN_MEETING_PREFIX, m.id)))
            .collect();
        rows.push(MenuRow::submenu(RECENT_LABEL, meetings));
    }
    rows
}

/// Open, Settings, and the update row (Update to vX… when one is waiting), then Quit.
fn app_section(update_version: Option<&str>) -> Vec<MenuRow> {
    let update = match update_version {
        Some(version) => MenuRow::action(format!("Update to v{version}…"), item::INSTALL_UPDATE),
        None => MenuRow::action(CHECK_UPDATES_LABEL, item::CHECK_UPDATES),
    };
    vec![
        MenuRow::action(OPEN_LABEL, item::SHOW),
        MenuRow::action(SETTINGS_LABEL, item::SETTINGS).shortcut(SETTINGS_KEY),
        update,
        MenuRow::action(QUIT_LABEL, item::QUIT).shortcut(QUIT_KEY),
    ]
}

/// The header: the app, its version, and whether it's recording.
fn header_section(s: &MenuSnapshot) -> Vec<MenuRow> {
    let dot = if s.recording_active { StatusLevel::Unavailable } else { StatusLevel::Available };
    vec![MenuRow { dot: Some(dot), ..MenuRow::text(format!("{APP_LABEL} · v{}", s.version)) }]
}

/// The menu's sections, top to bottom; empty ones are left out.
pub(super) fn menu_sections(s: &MenuSnapshot) -> Vec<Vec<MenuRow>> {
    [
        header_section(s),
        recorder_section(s),
        activity_section(&s.activity),
        status_section(s),
        quick_section(&s.recent_meetings),
        app_section(s.update_version.as_deref()),
    ]
    .into_iter()
    .filter(|section| !section.is_empty())
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(section: &[MenuRow]) -> Vec<&str> {
        section.iter().map(|row| row.label.as_str()).collect()
    }

    #[test]
    fn formats_elapsed_and_the_stop_row() {
        assert_eq!(format_elapsed(0), "0:00");
        assert_eq!(format_elapsed(3600), "60:00");
        assert_eq!(stop_text(65, false), "Stop Recording · 1:05");
        assert_eq!(stop_text(65, true), "Stop Recording · 1:05 (paused)");
    }

    #[test]
    fn shows_the_next_meeting_before_record_and_hides_it_while_recording() {
        let meeting = NextMeeting { occurrence: "o".into(), title: "Weekly".into(), minutes: 12, joinable: true };
        let idle = MenuSnapshot { next_meeting: Some(meeting.clone()), ..MenuSnapshot::default() };
        let rows = recorder_section(&idle);
        assert_eq!(labels(&rows), ["Next: Weekly · in 12 min", "Record Meeting"]);
        assert_eq!(labels(&rows[0].children), ["Join & Record", "Record"]);
        let recording = MenuSnapshot { recording_active: true, paused: true, elapsed_secs: 5, next_meeting: Some(meeting), ..MenuSnapshot::default() };
        assert_eq!(labels(&recorder_section(&recording)), ["Stop Recording · 0:05 (paused)", "Resume"]);
    }

    #[test]
    fn the_selected_speech_model_titles_its_row_and_cannot_be_picked_again() {
        let models = vec![
            SpeechModelEntry { id: "a".into(), name: "Parakeet".into(), selected: true },
            SpeechModelEntry { id: "b".into(), name: "Whisper".into(), selected: false },
        ];
        let row = speech_models_row(&models);
        assert_eq!(row.label, "Speech Model · Parakeet");
        assert!(row.children[0].checked && row.children[0].action.is_none());
        assert_eq!(row.children[1].action.as_deref(), Some("speech_model:b"));
    }

    #[test]
    fn leaves_out_empty_sections_and_shortens_long_titles() {
        assert_eq!(menu_sections(&MenuSnapshot::default()).len(), 5); // header, recorder, status, quick, app — no jobs
        assert_eq!(truncated("abcdef", 4), "abc…");
    }

    #[test]
    fn serializes_only_what_a_row_uses() {
        let row = MenuRow::action("New Chat", item::NEW_CHAT).shortcut(NEW_CHAT_KEY);
        assert_eq!(serde_json::to_string(&row).unwrap(), r#"{"label":"New Chat","action":"new_chat","shortcut":"n"}"#);
        let empty = MenuRow::submenu("Recent", Vec::new());
        assert_eq!(serde_json::to_string(&empty).unwrap(), r#"{"label":"Recent"}"#);
        let job = ActivityEntry { label: "Downloading Parakeet".into(), percent: Some(42) };
        assert_eq!(activity_text(&job), "Downloading Parakeet · 42%");
    }
}
