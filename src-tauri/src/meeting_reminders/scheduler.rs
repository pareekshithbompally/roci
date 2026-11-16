//! When each meeting's reminder shows, from Roci's EventKit events across every calendar.

use std::collections::{HashMap, HashSet};

use tauri_plugin_calendar::{call_link, key_matches, types::CalendarEvent, CallLink};

/// How late a reminder may still show, for a meeting added (or a recording stopped) after it started.
pub const LATE_GRACE_MS: i64 = 5 * 60 * 1_000;
/// How long a reminder stays up after its meeting starts.
pub const REMINDER_AFTER_START_MS: i64 = 60 * 1_000;
/// The shortest time a reminder stays up, for one shown late.
pub const REMINDER_MIN_MS: i64 = 30 * 1_000;
/// Reminders handed to macOS at once; it keeps 64 pending per app, shared with to-do reminders.
const MAX_QUEUED: usize = 32;
/// How long an occurrence is remembered after it ends, so it reminds once.
const FORGET_AFTER_END_MS: i64 = 60 * 60 * 1_000;

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

/// An event the user will attend with other people or a call link: not all-day, declined, cancelled or free.
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

/// The current meeting whose link names the call's service, from its reminder lead until it ends.
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

/// A reminder handed to macOS.
#[derive(Clone, Debug)]
struct Queued {
    fire_ms: i64,
    /// When it is withdrawn from Notification Center.
    until_ms: i64,
    end_ms: i64,
    /// Answered or withdrawn: kept only so the occurrence never reminds again.
    done: bool,
}

/// Keeps macOS's queue of meeting reminders in line with the calendar; macOS delivers them on time.
#[derive(Default)]
pub struct ReminderScheduler {
    queued: HashMap<String, Queued>,
}

/// A reminder closes a minute after its meeting starts, never sooner than [`REMINDER_MIN_MS`] after showing.
pub fn reminder_until_ms(start_ms: i64, shown_ms: i64) -> i64 {
    (start_ms + REMINDER_AFTER_START_MS).max(shown_ms + REMINDER_MIN_MS)
}

impl ReminderScheduler {
    /// Called on every change: `meetings` (empty when reminders are off), and `paused` while Roci records.
    pub fn reconcile(
        &mut self,
        meetings: &[CalendarMeeting],
        now_ms: i64,
        lead_ms: i64,
        paused: bool,
    ) -> Vec<ReminderUpdate> {
        let mut updates = self.withdraw(meetings, now_ms, paused);
        self.queued.retain(|_, queued| queued.end_ms + FORGET_AFTER_END_MS > now_ms);
        if !paused {
            updates.extend(self.queue(meetings, now_ms, lead_ms));
        }
        updates
    }

    /// Past its time, gone from the calendar (cancelled, moved, declined, off), or not yet shown while paused.
    fn withdraw(&mut self, meetings: &[CalendarMeeting], now_ms: i64, paused: bool) -> Vec<ReminderUpdate> {
        let current: HashSet<String> = meetings.iter().map(CalendarMeeting::occurrence).collect();
        let mut updates = Vec::new();
        self.queued.retain(|occurrence, queued| {
            if queued.done {
                return true;
            }
            let expired = queued.until_ms <= now_ms;
            let unwanted = !current.contains(occurrence) || (paused && queued.fire_ms > now_ms);
            if expired || unwanted {
                updates.push(ReminderUpdate::Withdraw(occurrence.clone()));
            }
            // Expired ones stay (done) so they never remind again; unwanted ones go, to queue afresh later.
            queued.done = expired;
            !unwanted || expired
        });
        updates.sort_by_key(ReminderUpdate::occurrence);
        updates
    }

    /// Every upcoming meeting not yet handed over: at its lead time, or now if that has passed.
    fn queue(&mut self, meetings: &[CalendarMeeting], now_ms: i64, lead_ms: i64) -> Vec<ReminderUpdate> {
        let mut updates = Vec::new();
        for meeting in meetings {
            if self.queued.len() >= MAX_QUEUED {
                break;
            }
            let occurrence = meeting.occurrence();
            let late = now_ms >= meeting.start_ms + LATE_GRACE_MS || now_ms >= meeting.end_ms;
            if late || self.queued.contains_key(&occurrence) {
                continue;
            }
            let fire_ms = (meeting.start_ms - lead_ms).max(now_ms);
            self.queued.insert(
                occurrence,
                Queued {
                    fire_ms,
                    until_ms: reminder_until_ms(meeting.start_ms, fire_ms),
                    end_ms: meeting.end_ms,
                    done: false,
                },
            );
            updates.push(ReminderUpdate::Schedule(meeting.clone(), fire_ms));
        }
        updates
    }

    /// The user answered the reminder: it is not withdrawn or shown again.
    pub fn answered(&mut self, occurrence: &str) {
        if let Some(queued) = self.queued.get_mut(occurrence) {
            queued.done = true;
        }
    }

    /// When the next reminder is due to be withdrawn; nothing else needs a timer.
    pub fn next_deadline_ms(&self) -> Option<i64> {
        self.queued.values().filter(|queued| !queued.done).map(|queued| queued.until_ms).min()
    }
}

/// What to tell macOS after a change.
#[derive(Clone, Debug, PartialEq)]
pub enum ReminderUpdate {
    /// Hand this reminder to macOS for delivery at the given wall-clock ms.
    Schedule(CalendarMeeting, i64),
    /// Withdraw this occurrence's reminder, pending or shown.
    Withdraw(String),
}

impl ReminderUpdate {
    fn occurrence(&self) -> String {
        match self {
            Self::Schedule(meeting, _) => meeting.occurrence(),
            Self::Withdraw(occurrence) => occurrence.clone(),
        }
    }
}

/// Whole minutes until `start_ms`, rounded up; zero once it has started.
pub fn minutes_until(start_ms: i64, now_ms: i64) -> i64 {
    ((start_ms - now_ms).max(0) + 59_999) / 60_000
}

/// Milliseconds since the Unix epoch; the wall clock keeps counting while the Mac sleeps.
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

    fn scheduled_at(updates: &[ReminderUpdate]) -> Vec<(String, i64)> {
        updates
            .iter()
            .filter_map(|update| match update {
                ReminderUpdate::Schedule(meeting, at) => Some((meeting.occurrence(), *at)),
                ReminderUpdate::Withdraw(_) => None,
            })
            .collect()
    }

    #[test]
    fn hands_the_reminder_to_macos_once_for_its_lead_time_and_withdraws_it_after_start() {
        let mut scheduler = ReminderScheduler::default();
        let meetings = [meeting("a", 10 * MINUTE)];
        let updates = scheduler.reconcile(&meetings, 7 * MINUTE, 2 * MINUTE, false);
        assert_eq!(scheduled_at(&updates), [("a@600000".to_string(), 8 * MINUTE)]);
        // Nothing changes on later reconciles until the withdraw deadline.
        assert!(scheduler.reconcile(&meetings, 9 * MINUTE, 2 * MINUTE, false).is_empty());
        let until = reminder_until_ms(10 * MINUTE, 8 * MINUTE);
        assert_eq!(scheduler.next_deadline_ms(), Some(until));
        assert_eq!(
            scheduler.reconcile(&meetings, until, 2 * MINUTE, false),
            [ReminderUpdate::Withdraw("a@600000".into())]
        );
        assert!(scheduler.reconcile(&meetings, until + 1, 2 * MINUTE, false).is_empty());
        assert_eq!(scheduler.next_deadline_ms(), None);
    }

    #[test]
    fn a_moved_meeting_withdraws_and_queues_again() {
        let mut scheduler = ReminderScheduler::default();
        scheduler.reconcile(&[meeting("a", 10 * MINUTE)], 7 * MINUTE, 2 * MINUTE, false);
        let updates = scheduler.reconcile(&[meeting("a", 11 * MINUTE)], 7 * MINUTE, 2 * MINUTE, false);
        assert_eq!(updates[0], ReminderUpdate::Withdraw("a@600000".into()));
        assert_eq!(scheduled_at(&updates), [("a@660000".to_string(), 9 * MINUTE)]);
    }

    #[test]
    fn recording_holds_pending_reminders_and_shows_them_after_if_still_due() {
        let mut scheduler = ReminderScheduler::default();
        let meetings = [meeting("a", 10 * MINUTE)];
        scheduler.reconcile(&meetings, 7 * MINUTE, 2 * MINUTE, false);
        assert_eq!(
            scheduler.reconcile(&meetings, 7 * MINUTE + 1, 2 * MINUTE, true),
            [ReminderUpdate::Withdraw("a@600000".into())]
        );
        // Stopped two minutes into the meeting: shown now.
        let updates = scheduler.reconcile(&meetings, 12 * MINUTE, 2 * MINUTE, false);
        assert_eq!(scheduled_at(&updates), [("a@600000".to_string(), 12 * MINUTE)]);
    }

    #[test]
    fn a_meeting_past_its_grace_is_not_reminded() {
        let mut scheduler = ReminderScheduler::default();
        let meetings = [meeting("a", 10 * MINUTE)];
        assert!(scheduler.reconcile(&meetings, 10 * MINUTE + LATE_GRACE_MS, 2 * MINUTE, false).is_empty());
    }

    #[test]
    fn turning_reminders_off_withdraws_everything_queued() {
        let mut scheduler = ReminderScheduler::default();
        scheduler.reconcile(&[meeting("a", 10 * MINUTE), meeting("b", 20 * MINUTE)], 7 * MINUTE, 2 * MINUTE, false);
        assert_eq!(
            scheduler.reconcile(&[], 7 * MINUTE, 2 * MINUTE, false),
            [ReminderUpdate::Withdraw("a@600000".into()), ReminderUpdate::Withdraw("b@1200000".into())]
        );
        assert_eq!(scheduler.next_deadline_ms(), None);
    }

    #[test]
    fn an_answered_reminder_is_neither_withdrawn_nor_shown_again() {
        let mut scheduler = ReminderScheduler::default();
        let meetings = [meeting("a", 10 * MINUTE)];
        scheduler.reconcile(&meetings, 8 * MINUTE, 2 * MINUTE, false);
        scheduler.answered("a@600000");
        assert_eq!(scheduler.next_deadline_ms(), None);
        assert!(scheduler.reconcile(&meetings, 12 * MINUTE, 2 * MINUTE, false).is_empty());
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
