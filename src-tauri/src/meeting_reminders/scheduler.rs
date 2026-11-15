//! When each meeting's reminder shows — ported from HEX `src/calendar.rs`
//! (`CalendarMeeting`, `is_meeting`, `meetings`, `ReminderScheduler`,
//! `reminder_until_ms`, `minutes_until`, `wall_clock_ms`; MIT, see
//! `src-tauri/licenses/HEX-MIT.txt`). The scheduler is HEX's, unchanged;
//! `from_event` / `is_meeting` read Kasset's EventKit event shape, and there is
//! no per-calendar include filter (Kasset reminds for every calendar).

use std::collections::HashMap;

use tauri_plugin_calendar::{call_link, key_matches, types::CalendarEvent, CallLink};

/// How late a reminder may still show, for a Mac that wakes after the
/// meeting started.
pub const LATE_GRACE_MS: i64 = 5 * 60 * 1_000;
/// How long a reminder stays up after its meeting starts.
pub const REMINDER_AFTER_START_MS: i64 = 60 * 1_000;
/// The shortest time a reminder stays up, for one shown late.
pub const REMINDER_MIN_MS: i64 = 30 * 1_000;

/// A calendar event that counts as a meeting.
#[derive(Clone, Debug, PartialEq)]
pub struct CalendarMeeting {
    pub id: String,
    pub title: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub attendees: Vec<String>,
    pub link: Option<CallLink>,
}

impl CalendarMeeting {
    /// One occurrence: a moved meeting is a new one to remind about.
    pub fn occurrence(&self) -> String {
        format!("{}@{}", self.id, self.start_ms)
    }

    /// The title, or a stand-in for an untitled event.
    pub fn display_title(&self) -> String {
        let title = self.title.trim();
        if title.is_empty() {
            "Meeting".into()
        } else {
            title.into()
        }
    }

    pub fn from_event(event: &CalendarEvent) -> Self {
        Self {
            id: event.event_id.clone(),
            title: event.title.trim().to_string(),
            start_ms: event.start_ms as i64,
            end_ms: event.end_ms as i64,
            attendees: others(event),
            link: call_link(event),
        }
    }
}

/// Everyone else invited, by name (EventKit lists the user too).
fn others(event: &CalendarEvent) -> Vec<String> {
    event
        .attendees
        .iter()
        .filter(|attendee| attendee.is_current_user != Some(true))
        .filter_map(|attendee| attendee.name.as_deref().or(attendee.email.as_deref()))
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

fn declined(event: &CalendarEvent) -> bool {
    event.attendees.iter().any(|attendee| attendee.is_current_user == Some(true) && attendee.status == "declined")
}

/// A meeting is an event with other people or a call link that the user
/// will attend: not all-day, declined, cancelled, or shown as free.
pub fn is_meeting(event: &CalendarEvent) -> bool {
    if event.is_all_day || declined(event) || event.is_cancelled || event.is_free {
        return false;
    }
    if event.end_ms <= event.start_ms {
        return false;
    }
    !others(event).is_empty() || call_link(event).is_some()
}

/// The meetings among `events`, soonest first.
pub fn meetings(events: &[CalendarEvent]) -> Vec<CalendarMeeting> {
    let mut meetings =
        events.iter().filter(|event| is_meeting(event)).map(CalendarMeeting::from_event).collect::<Vec<_>>();
    meetings.sort_by_key(|meeting| meeting.start_ms);
    meetings
}

/// The meeting happening now that a detected call belongs to: one whose
/// link names the call's service, from its reminder lead until it ends.
pub fn current_for_call<'a>(
    meetings: &'a [CalendarMeeting],
    keys: &[&str],
    now_ms: i64,
    lead_ms: i64,
) -> Option<&'a CalendarMeeting> {
    meetings.iter().find(|meeting| {
        now_ms >= meeting.start_ms - lead_ms.max(5 * 60 * 1_000)
            && now_ms < meeting.end_ms
            && meeting.link.as_ref().is_some_and(|link| {
                link.provider.detection_keys().iter().any(|known| keys.iter().any(|key| key_matches(key, known)))
            })
    })
}

/// Decides when each meeting's reminder shows. Times are wall-clock
/// milliseconds, so a Mac that sleeps through the lead time still reminds on
/// wake if the meeting began less than [`LATE_GRACE_MS`] ago, and a moved
/// meeting (a new start) is reminded again.
#[derive(Default)]
pub struct ReminderScheduler {
    /// Occurrences already reminded, with when they end, so each reminds once.
    reminded: HashMap<String, i64>,
    /// The reminder on screen and when it closes on its own.
    showing: Option<(CalendarMeeting, i64)>,
}

/// When a reminder shown at `shown_ms` closes on its own: a minute after its
/// meeting starts, and never sooner than [`REMINDER_MIN_MS`] after showing.
pub fn reminder_until_ms(start_ms: i64, shown_ms: i64) -> i64 {
    (start_ms + REMINDER_AFTER_START_MS).max(shown_ms + REMINDER_MIN_MS)
}

impl ReminderScheduler {
    /// One reminder shows at a time: while it is up, an overlapping
    /// meeting's reminder waits until it is answered or closes.
    pub fn poll(&mut self, meetings: &[CalendarMeeting], now_ms: i64, lead_ms: i64) -> Option<ReminderUpdate> {
        // Bounded: occurrences are forgotten an hour after they end.
        self.reminded.retain(|_, end_ms| *end_ms + 60 * 60 * 1_000 > now_ms);
        if let Some((showing, until_ms)) = &self.showing {
            let current = meetings.iter().any(|meeting| meeting.occurrence() == showing.occurrence());
            if !current || now_ms >= *until_ms {
                let occurrence = showing.occurrence();
                self.showing = None;
                return Some(ReminderUpdate::Withdraw(occurrence));
            }
            return None;
        }
        let due = meetings.iter().find(|meeting| {
            now_ms >= meeting.start_ms - lead_ms
                && now_ms < meeting.start_ms + LATE_GRACE_MS
                && now_ms < meeting.end_ms
                && !self.reminded.contains_key(&meeting.occurrence())
        })?;
        self.reminded.insert(due.occurrence(), due.end_ms);
        self.showing = Some((due.clone(), reminder_until_ms(due.start_ms, now_ms)));
        Some(ReminderUpdate::Show(due.clone()))
    }

    /// The user answered the reminder, or it closed.
    pub fn answered(&mut self, occurrence: &str) {
        if self.showing.as_ref().is_some_and(|(showing, _)| showing.occurrence() == occurrence) {
            self.showing = None;
        }
    }

    /// Reminders were turned off: forget the showing one, returning its occurrence.
    pub fn clear(&mut self) -> Option<String> {
        self.showing.take().map(|(showing, _)| showing.occurrence())
    }
}

/// What to do with the notification after a poll.
#[derive(Clone, Debug, PartialEq)]
pub enum ReminderUpdate {
    Show(CalendarMeeting),
    /// The showing reminder's meeting (this occurrence) was cancelled,
    /// moved, declined, or is long past: withdraw it.
    Withdraw(String),
}

/// Whole minutes until `start_ms`, rounded up; zero once it has started.
pub fn minutes_until(start_ms: i64, now_ms: i64) -> i64 {
    ((start_ms - now_ms).max(0) + 59_999) / 60_000
}

/// Milliseconds since the Unix epoch. Reminders use the wall clock, which
/// keeps counting while the Mac sleeps.
pub fn wall_clock_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_calendar::CallProvider;

    const MINUTE: i64 = 60_000;

    fn meeting(id: &str, start_ms: i64) -> CalendarMeeting {
        CalendarMeeting {
            id: id.into(),
            title: "Standup".into(),
            start_ms,
            end_ms: start_ms + 30 * MINUTE,
            attendees: vec!["Ada".into()],
            link: None,
        }
    }

    #[test]
    fn reminds_once_at_lead_and_withdraws_after_start() {
        let mut scheduler = ReminderScheduler::default();
        let meetings = [meeting("a", 10 * MINUTE)];
        assert_eq!(scheduler.poll(&meetings, 7 * MINUTE, 2 * MINUTE), None);
        assert!(matches!(scheduler.poll(&meetings, 8 * MINUTE, 2 * MINUTE), Some(ReminderUpdate::Show(_))));
        let until = reminder_until_ms(10 * MINUTE, 8 * MINUTE);
        assert_eq!(scheduler.poll(&meetings, until, 2 * MINUTE), Some(ReminderUpdate::Withdraw("a@600000".into())));
        assert_eq!(scheduler.poll(&meetings, until + 1, 2 * MINUTE), None);
    }

    #[test]
    fn a_moved_meeting_withdraws_and_reminds_again() {
        let mut scheduler = ReminderScheduler::default();
        assert!(scheduler.poll(&[meeting("a", 10 * MINUTE)], 9 * MINUTE, 2 * MINUTE).is_some());
        let moved = [meeting("a", 11 * MINUTE)];
        assert_eq!(scheduler.poll(&moved, 9 * MINUTE, 2 * MINUTE), Some(ReminderUpdate::Withdraw("a@600000".into())));
        assert!(matches!(scheduler.poll(&moved, 9 * MINUTE, 2 * MINUTE), Some(ReminderUpdate::Show(_))));
    }

    fn with_link(mut meeting: CalendarMeeting, provider: CallProvider) -> CalendarMeeting {
        meeting.link = Some(CallLink { provider, url: "https://zoom.us/j/1".into() });
        meeting
    }

    #[test]
    fn current_for_call_matches_provider_in_window() {
        let meetings = [with_link(meeting("z", 100 * MINUTE), CallProvider::Zoom)];
        let keys = ["us.zoom.xos"];
        assert!(current_for_call(&meetings, &keys, 100 * MINUTE, MINUTE).is_some());
        assert!(current_for_call(&meetings, &keys, 95 * MINUTE, MINUTE).is_some());
        assert!(current_for_call(&meetings, &keys, 94 * MINUTE, MINUTE).is_none());
        assert!(current_for_call(&meetings, &keys, 130 * MINUTE, MINUTE).is_none());
    }

    #[test]
    fn current_for_call_ignores_other_provider() {
        let meetings = [with_link(meeting("z", 100 * MINUTE), CallProvider::Zoom)];
        assert!(current_for_call(&meetings, &["com.microsoft.teams2"], 100 * MINUTE, MINUTE).is_none());
        let unlinked = [meeting("n", 100 * MINUTE)];
        assert!(current_for_call(&unlinked, &["us.zoom.xos"], 100 * MINUTE, MINUTE).is_none());
    }
}
