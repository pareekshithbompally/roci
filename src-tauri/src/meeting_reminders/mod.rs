//! Calendar meeting reminders: on each calendar, settings or recording change, the system (macOS, iOS) is handed the
//! reminders to deliver — scheduled notifications, so they arrive while Roci is idle or, on iPhone, suspended.

mod scheduler;

use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tauri_plugin_calendar::types::CalendarEvent;
use tauri_plugin_notifications::{self as notifications, Action, Category, Notice, Response};

use crate::audio::commands::is_recording;
pub(crate) use scheduler::wall_clock_ms;
#[cfg(desktop)]
use scheduler::current_for_call;
use scheduler::{meetings, minutes_until, CalendarMeeting, ReminderScheduler, ReminderUpdate};

/// Frontend: start recording this meeting (`CalendarEvent`).
const RECORD_EVENT: &str = "meeting-reminders://record";

/// Events read behind now: meetings still in progress (call matching, late reminders).
const READ_BEHIND_MS: i64 = 60 * 60 * 1_000;
/// Events read ahead: past a day, so the next midnight's reread always has tomorrow covered.
const READ_AHEAD_MS: i64 = 36 * 60 * 60 * 1_000;

const ID_PREFIX: &str = "meeting:";
const CATEGORY: &str = "meeting";
const CATEGORY_WITH_LINK: &str = "meeting_link";
const ACTION_RECORD: &str = "record";
const ACTION_JOIN_RECORD: &str = "join_record";
const ACTION_NOT_NOW: &str = "not_now";

/// Everything that changes which reminders macOS should hold; the worker sleeps until one arrives.
#[derive(Debug)]
enum Event {
    /// Upcoming events may differ: a calendar change, a new day, a clock change or wake.
    CalendarChanged,
    /// Settings › Calendar changed.
    Configured,
    Recording(bool),
}

#[derive(Default)]
struct Reminders {
    /// The calendar integration is on: meetings are read (menu bar, call detection) even with reminders off.
    calendar: bool,
    /// Reminder notifications are on.
    enabled: bool,
    lead_ms: i64,
    recording: bool,
    scheduler: ReminderScheduler,
    meetings: Vec<CalendarMeeting>,
    /// The events behind `meetings`, by id: what Record hands the frontend.
    events: HashMap<String, CalendarEvent>,
    read_failed: bool,
}

impl Reminders {
    fn handle(&mut self, event: Event) {
        match event {
            Event::Recording(active) => self.recording = active,
            Event::CalendarChanged | Event::Configured => self.reread(wall_clock_ms()),
        }
    }

    /// What macOS should hold now, as changes to make.
    fn reconcile(&mut self) -> Vec<ReminderUpdate> {
        let meetings: &[CalendarMeeting] = if self.enabled { &self.meetings } else { &[] };
        self.scheduler.reconcile(meetings, wall_clock_ms(), self.lead_ms, self.recording)
    }

    fn reread(&mut self, now_ms: i64) {
        if !self.calendar {
            self.meetings.clear();
            self.events.clear();
            return;
        }
        match tauri_plugin_calendar::events_between_ms(now_ms - READ_BEHIND_MS, now_ms + READ_AHEAD_MS) {
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
static EVENTS: OnceLock<Sender<Event>> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();

fn reminders() -> MutexGuard<'static, Reminders> {
    REMINDERS.get_or_init(Mutex::default).lock().unwrap_or_else(|error| error.into_inner())
}

/// Hands an event to the worker; called from EventKit, command and menu threads.
fn send(event: Event) {
    let Some(events) = EVENTS.get() else { return };
    if let Err(error) = events.send(event) {
        log::warn!("[meeting-reminders] worker gone; dropped {:?}", error.0);
    }
}

// ── Lifecycle ──

/// Starts the worker and subscribes it to calendar changes. Idle until the frontend turns the calendar on.
pub fn start(app: AppHandle) {
    if APP.set(app).is_err() {
        return;
    }
    let (sender, receiver) = mpsc::channel();
    if EVENTS.set(sender).is_err() {
        return;
    }
    notifications::add_categories(&categories());
    notifications::on_response_received(handle_response);
    // macOS keeps reminders queued by an earlier run; this run's first reconcile queues what still applies.
    notifications::remove_pending_with_prefix(ID_PREFIX);
    tauri_plugin_calendar::on_events_changed(|| send(Event::CalendarChanged));
    let spawned = thread::Builder::new().name("meeting-reminders".into()).spawn(move || run(&receiver));
    if let Err(error) = spawned {
        log::error!("[meeting-reminders] thread failed to start: {error}");
    }
}

/// A recording started or stopped (reported with the menu bar's state): reminders wait while Roci records.
pub(crate) fn recording_changed(active: bool) {
    send(Event::Recording(active));
}

/// Applies each event, updates macOS's queue, then sleeps until the next event or withdraw deadline.
fn run(events: &Receiver<Event>) {
    loop {
        let event = match deadline() {
            Some(wait) => match events.recv_timeout(wait) {
                Ok(event) => Some(event),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => return,
            },
            None => match events.recv() {
                Ok(event) => Some(event),
                Err(_) => return,
            },
        };
        let updates = {
            let mut reminders = reminders();
            if let Some(event) = event {
                reminders.handle(event);
            }
            reminders.reconcile()
        };
        updates.iter().for_each(apply);
    }
}

/// How long until the next reminder is withdrawn, from the wall clock so sleep is counted.
fn deadline() -> Option<Duration> {
    let at_ms = reminders().scheduler.next_deadline_ms()?;
    let wait_ms = u64::try_from(at_ms - wall_clock_ms()).unwrap_or(0);
    Some(Duration::from_millis(wait_ms))
}

/// Calendar reading on or off, reminders on or off, and how many minutes before a meeting they show.
#[tauri::command]
pub fn configure_meeting_reminders(calendar: bool, enabled: bool, lead_minutes: u32) {
    {
        let mut reminders = reminders();
        reminders.calendar = calendar;
        reminders.enabled = calendar && enabled;
        reminders.lead_ms = i64::from(lead_minutes) * 60_000;
    }
    send(Event::Configured);
}

/// The soonest meeting that hasn't ended, as the menu bar shows it.
#[cfg(desktop)]
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
#[cfg(desktop)]
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
#[cfg(desktop)]
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

/// "Starts in 2 min · Zoom", as of when macOS shows it.
fn body(meeting: &CalendarMeeting, at_ms: i64) -> String {
    let when = match minutes_until(meeting.start_ms, at_ms) {
        0 => "Starting now".to_string(),
        n => format!("Starts in {n} min"),
    };
    match &meeting.link {
        Some(link) => format!("{when} · {}", link.provider.label()),
        None => when,
    }
}

fn apply(update: &ReminderUpdate) {
    match update {
        ReminderUpdate::Schedule(meeting, at_ms) => schedule(meeting, *at_ms),
        ReminderUpdate::Withdraw(occurrence) => notifications::remove(&[format!("{ID_PREFIX}{occurrence}")]),
    }
}

fn schedule(meeting: &CalendarMeeting, at_ms: i64) {
    let notice = Notice {
        id: format!("{ID_PREFIX}{}", meeting.occurrence()),
        title: meeting.display_title(),
        body: body(meeting, at_ms),
        category: Some(if meeting.link.is_some() { CATEGORY_WITH_LINK } else { CATEGORY }.into()),
        user_info: HashMap::new(),
        // On/off is the watcher's own switch (`configure_meeting_reminders`).
        kind: None,
    };
    notifications::schedule(notice, at_ms);
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
    let event = {
        let mut reminders = reminders();
        reminders.scheduler.answered(occurrence);
        // Answered with a button: its call is not offered again (the Mac's call detection).
        #[cfg(desktop)]
        if let Some(meeting) = reminders.meeting_for(occurrence)
            && matches!(response.action.as_str(), ACTION_RECORD | ACTION_JOIN_RECORD | ACTION_NOT_NOW)
        {
            crate::call_detection::snooze_calendar_call(calendar_snooze(meeting));
        }
        reminders.event_for(occurrence)
    };
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
#[cfg(desktop)]
pub(crate) fn event_for_call(application: &str) -> Option<CalendarEvent> {
    let reminders = reminders();
    let meeting = current_for_call(&reminders.meetings, &[application], wall_clock_ms(), reminders.lead_ms)?;
    reminders.events.get(&meeting.id).cloned()
}

/// An answered reminder's snooze: its service's calls until the meeting ends, else any call near the start.
#[cfg(desktop)]
pub(crate) fn calendar_snooze(meeting: &CalendarMeeting) -> (Vec<String>, i64) {
    match &meeting.link {
        Some(link) => (link.provider.detection_keys().iter().map(|key| key.to_string()).collect(), meeting.end_ms),
        None => (Vec::new(), (meeting.start_ms + scheduler::LATE_GRACE_MS).min(meeting.end_ms)),
    }
}

/// The call link in its app (Zoom, Teams, Meet …) or the browser, on Mac and iPhone alike.
fn open_link(url: &str) {
    use tauri_plugin_opener::OpenerExt;
    let Some(app) = APP.get() else { return };
    if let Err(error) = app.opener().open_url(url, None::<&str>) {
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
