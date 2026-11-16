//! Calendar meeting reminders: a 500 ms poll of EventKit drives the scheduler and posts notifications.

mod scheduler;

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tauri_plugin_calendar::types::CalendarEvent;
use tauri_plugin_notifications::{self as notifications, Action, Category, Notice, Response};

use crate::audio::commands::is_recording;
pub(crate) use scheduler::wall_clock_ms;
use scheduler::{
    current_for_call, meetings, minutes_until, CalendarMeeting, ReminderScheduler, ReminderUpdate,
};

/// Frontend: start recording this meeting (`CalendarEvent`).
const RECORD_EVENT: &str = "meeting-reminders://record";

/// Controller loop interval.
pub(crate) const TICK: Duration = Duration::from_millis(500);
/// How often the poll rereads the calendar without a change notification.
const CALENDAR_REREAD_MS: i64 = 60_000;
/// Events read either side of now: covers late grace behind and any lead ahead.
const READ_WINDOW_MS: i64 = 60 * 60 * 1_000;

const ID_PREFIX: &str = "meeting:";
const CATEGORY: &str = "meeting";
const CATEGORY_WITH_LINK: &str = "meeting_link";
const ACTION_RECORD: &str = "record";
const ACTION_JOIN_RECORD: &str = "join_record";
const ACTION_NOT_NOW: &str = "not_now";

#[derive(Default)]
struct Reminders {
    /// The calendar integration is on: meetings are read (menu bar, call detection) even with reminders off.
    calendar: bool,
    /// Reminder notifications are on.
    enabled: bool,
    lead_ms: i64,
    scheduler: ReminderScheduler,
    meetings: Vec<CalendarMeeting>,
    /// The events behind `meetings`, by id: what Record hands the frontend.
    events: HashMap<String, CalendarEvent>,
    change_count: Option<u64>,
    /// Wall-clock time of the last read, so a wake from sleep rereads.
    read_at_ms: Option<i64>,
    read_failed: bool,
}

impl Reminders {
    fn poll(&mut self, recording: bool) -> Option<ReminderUpdate> {
        if !self.calendar {
            self.meetings.clear();
            self.change_count = None;
            self.read_at_ms = None;
            return self.scheduler.clear().map(ReminderUpdate::Withdraw);
        }
        let now_ms = wall_clock_ms();
        self.reread_if_stale(now_ms);
        if !self.enabled {
            return self.scheduler.clear().map(ReminderUpdate::Withdraw);
        }
        // A reminder waits while Roci records; it shows after, if still due.
        if recording {
            return None;
        }
        self.scheduler.poll(&self.meetings, now_ms, self.lead_ms)
    }

    fn reread_if_stale(&mut self, now_ms: i64) {
        let changes = tauri_plugin_calendar::change_count();
        let stale = self.read_at_ms.is_none_or(|read_at| (now_ms - read_at).abs() >= CALENDAR_REREAD_MS);
        if !stale && self.change_count == Some(changes) {
            return;
        }
        self.change_count = Some(changes);
        self.read_at_ms = Some(now_ms);
        match read_events(now_ms, self.lead_ms) {
            Ok(events) => {
                self.meetings = meetings(&events);
                self.events = events.into_iter().map(|event| (event.event_id.clone(), event)).collect();
                self.read_failed = false;
            }
            Err(error) => {
                if !self.read_failed {
                    log::warn!("[meeting-reminders] could not read calendar: {error}");
                }
                self.read_failed = true;
                self.meetings.clear();
            }
        }
    }

    fn meeting_for(&self, occurrence: &str) -> Option<&CalendarMeeting> {
        self.meetings.iter().find(|meeting| meeting.occurrence() == occurrence)
    }

    fn event_for(&self, occurrence: &str) -> Option<CalendarEvent> {
        let meeting = self.meeting_for(occurrence)?;
        self.events.get(&meeting.id).cloned()
    }
}

static REMINDERS: OnceLock<Mutex<Reminders>> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();

fn reminders() -> MutexGuard<'static, Reminders> {
    REMINDERS.get_or_init(Mutex::default).lock().unwrap_or_else(|error| error.into_inner())
}

fn read_events(now_ms: i64, lead_ms: i64) -> Result<Vec<CalendarEvent>, String> {
    tauri_plugin_calendar::events_between_ms(now_ms - READ_WINDOW_MS, now_ms + lead_ms + READ_WINDOW_MS)
}

// ── Lifecycle ──

/// Start the reminder thread. Idle until the frontend turns reminders on.
pub fn start(app: AppHandle) {
    if APP.set(app).is_err() {
        return;
    }
    notifications::add_categories(&categories());
    notifications::on_response_received(handle_response);
    let spawned = thread::Builder::new().name("meeting-reminders".into()).spawn(|| loop {
        tick();
        thread::sleep(TICK);
    });
    if let Err(error) = spawned {
        log::error!("[meeting-reminders] thread failed to start: {error}");
    }
}

fn tick() {
    let update = reminders().poll(is_recording());
    match update {
        Some(ReminderUpdate::Show(meeting)) => show(&meeting),
        Some(ReminderUpdate::Withdraw(occurrence)) => withdraw(&occurrence),
        None => {}
    }
}

/// Calendar reading on or off, reminders on or off, and how many minutes before a meeting they show.
#[tauri::command]
pub fn configure_meeting_reminders(calendar: bool, enabled: bool, lead_minutes: u32) {
    let mut reminders = reminders();
    reminders.calendar = calendar;
    reminders.enabled = calendar && enabled;
    reminders.lead_ms = i64::from(lead_minutes) * 60_000;
}

/// The soonest meeting that hasn't ended, as the menu bar shows it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NextMeeting {
    pub occurrence: String,
    pub title: String,
    /// Whole minutes until it starts; 0 once it has.
    pub minutes: i64,
    /// It has a call link, so Join & Record can open it.
    pub joinable: bool,
}

/// The next meeting from the calendar already read (no extra read); None when the calendar is off or the hour is clear.
pub(crate) fn next_meeting() -> Option<NextMeeting> {
    let now_ms = wall_clock_ms();
    let reminders = reminders();
    let meeting = reminders.meetings.iter().filter(|m| m.end_ms > now_ms).min_by_key(|m| m.start_ms)?;
    Some(NextMeeting {
        occurrence: meeting.occurrence(),
        title: meeting.title.clone(),
        minutes: minutes_until(meeting.start_ms, now_ms),
        joinable: meeting.link.is_some(),
    })
}

/// Record (or Join & Record) a meeting chosen in the menu bar, through the same path as its reminder.
pub(crate) fn record_occurrence(occurrence: &str, join: bool) {
    let event = reminders().event_for(occurrence);
    match event {
        Some(event) => record(&event, join),
        None => log::warn!("[meeting-reminders] meeting {occurrence} is no longer in the calendar"),
    }
}

// ── Notification ──

fn categories() -> [Category; 2] {
    let action = |id: &str, title: &str| Action { id: id.into(), title: title.into() };
    [
        Category {
            id: CATEGORY.into(),
            actions: vec![action(ACTION_RECORD, "Record"), action(ACTION_NOT_NOW, "Not now")],
        },
        Category {
            id: CATEGORY_WITH_LINK.into(),
            actions: vec![
                action(ACTION_RECORD, "Record"),
                action(ACTION_JOIN_RECORD, "Join & record"),
                action(ACTION_NOT_NOW, "Not now"),
            ],
        },
    ]
}

/// "Starts in 2 min · Zoom".
fn body(meeting: &CalendarMeeting) -> String {
    let minutes = minutes_until(meeting.start_ms, wall_clock_ms());
    let when = match minutes {
        0 => "Starting now".to_string(),
        n => format!("Starts in {n} min"),
    };
    match &meeting.link {
        Some(link) => format!("{when} · {}", link.provider.label()),
        None => when,
    }
}

fn show(meeting: &CalendarMeeting) {
    notifications::post(&Notice {
        id: format!("{ID_PREFIX}{}", meeting.occurrence()),
        title: meeting.display_title(),
        body: body(meeting),
        category: Some(if meeting.link.is_some() { CATEGORY_WITH_LINK } else { CATEGORY }.into()),
        user_info: HashMap::new(),
        // On/off is the watcher's own switch (`configure_meeting_reminders`).
        kind: None,
    });
}

fn withdraw(occurrence: &str) {
    notifications::remove(&[format!("{ID_PREFIX}{occurrence}")]);
}

fn emit(name: &str, event: &CalendarEvent) {
    if let Some(app) = APP.get() {
        if let Err(error) = app.emit(name, event) {
            log::warn!("[meeting-reminders] {name} failed: {error}");
        }
    }
}

// ── Answer ──

fn handle_response(response: &Response) {
    let Some(occurrence) = response.id.strip_prefix(ID_PREFIX) else {
        return;
    };
    let (meeting, event) = {
        let mut reminders = reminders();
        reminders.scheduler.answered(occurrence);
        (reminders.meeting_for(occurrence).cloned(), reminders.event_for(occurrence))
    };
    // Answered with a button: its call is not offered again.
    #[cfg(target_os = "macos")]
    if let Some(meeting) = &meeting
        && matches!(response.action.as_str(), ACTION_RECORD | ACTION_JOIN_RECORD | ACTION_NOT_NOW)
    {
        crate::call_detection::snooze_calendar_call(calendar_snooze(meeting));
    }
    let Some(event) = event else { return };
    match response.action.as_str() {
        ACTION_RECORD => record(&event, false),
        ACTION_JOIN_RECORD => record(&event, true),
        _ => {}
    }
}

/// Join opens the call link; Record is ignored while already recording.
pub(crate) fn record(event: &CalendarEvent, join: bool) {
    if join {
        if let Some(url) = &event.meeting_url {
            open_link(url);
        }
    }
    if is_recording() {
        log::info!("[meeting-reminders] already recording; Record ignored");
        return;
    }
    emit(RECORD_EVENT, event);
}

/// The in-progress calendar meeting a detected call's app belongs to; known while the calendar integration is on.
pub(crate) fn event_for_call(application: &str) -> Option<CalendarEvent> {
    let reminders = reminders();
    let meeting = current_for_call(&reminders.meetings, &[application], wall_clock_ms(), reminders.lead_ms)?;
    reminders.events.get(&meeting.id).cloned()
}

/// An answered reminder's snooze: its service's calls until the meeting ends, else any call near the start.
pub(crate) fn calendar_snooze(meeting: &CalendarMeeting) -> (Vec<String>, i64) {
    match &meeting.link {
        Some(link) => (link.provider.detection_keys().iter().map(|key| key.to_string()).collect(), meeting.end_ms),
        None => (Vec::new(), (meeting.start_ms + scheduler::LATE_GRACE_MS).min(meeting.end_ms)),
    }
}

fn open_link(url: &str) {
    if let Err(error) = std::process::Command::new("open").arg(url).spawn() {
        log::warn!("[meeting-reminders] could not open call link: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_calendar::{CallLink, CallProvider};

    const MINUTE: i64 = 60_000;

    fn meeting(start_minute: i64, minutes: i64) -> CalendarMeeting {
        CalendarMeeting {
            id: "m".into(),
            title: "Sync".into(),
            start_ms: start_minute * MINUTE,
            end_ms: (start_minute + minutes) * MINUTE,
            attendees: vec!["Ana Ruiz".into()],
            link: None,
        }
    }

    #[test]
    fn calendar_snooze_without_link_lapses_after_grace() {
        let workshop = meeting(100, 240);
        assert_eq!(calendar_snooze(&workshop), (Vec::new(), 100 * MINUTE + scheduler::LATE_GRACE_MS));
        assert_eq!(calendar_snooze(&meeting(100, 3)), (Vec::new(), 103 * MINUTE));
    }

    #[test]
    fn calendar_snooze_with_link_covers_its_service_until_the_end() {
        let mut zoom = meeting(100, 240);
        zoom.link = Some(CallLink { provider: CallProvider::Zoom, url: "https://zoom.us/j/1".into() });
        let (keys, until_ms) = calendar_snooze(&zoom);
        assert!(keys.iter().any(|key| key == "us.zoom.xos"), "{keys:?}");
        assert_eq!(until_ms, zoom.end_ms);
    }
}
