use serde::{Deserialize, Serialize};

/// A calendar event from macOS EventKit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub event_id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    /// Wall-clock milliseconds, for schedulers.
    #[serde(default)]
    pub start_ms: f64,
    #[serde(default)]
    pub end_ms: f64,
    pub organizer_name: Option<String>,
    pub organizer_email: Option<String>,
    pub attendees: Vec<Attendee>,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub url: Option<String>,
    pub calendar_name: String,
    pub is_all_day: bool,
    #[serde(default)]
    pub is_cancelled: bool,
    /// Shown as free time.
    #[serde(default)]
    pub is_free: bool,
    /// The video call link (`call_link`), filled in Rust after reading.
    #[serde(default)]
    pub meeting_url: Option<String>,
    /// The call service behind `meeting_url` ("Zoom", "Google Meet", …).
    #[serde(default)]
    pub meeting_provider: Option<String>,
}

/// A meeting participant.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attendee {
    pub name: Option<String>,
    pub email: Option<String>,
    pub status: String,
    pub is_organizer: bool,
    pub is_current_user: Option<bool>,
}

/// Authorization status for calendar access.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessStatus {
    pub status: String,
}

/// Result of an access request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessResult {
    pub granted: bool,
    pub error: Option<String>,
}

/// Wrapper for the events response from Swift bridge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventsResponse {
    pub events: Vec<CalendarEvent>,
    pub error: Option<String>,
}

/// A reminders list (an EventKit reminder calendar).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemindersList {
    pub id: String,
    pub title: String,
}

/// Wrapper for the lists response from the Swift bridge.
#[derive(Debug, Clone, Deserialize)]
pub struct RemindersListsResponse {
    pub lists: Vec<RemindersList>,
}

/// One to-do as a reminder (input to `reminders_upsert`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReminderInput {
    pub list_id: String,
    pub todo_id: String,
    pub title: String,
    pub notes: Option<String>,
    /// `YYYY-MM-DD`
    pub due_date: Option<String>,
    pub completed: bool,
    /// Create when missing (new action items); otherwise update an existing reminder only.
    pub create: bool,
}

/// Completion of the reminder tagged with a to-do id.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReminderState {
    pub todo_id: String,
    pub completed: bool,
}

/// Bridge reply carrying an optional id, items, or an error.
#[derive(Debug, Clone, Deserialize)]
pub struct BridgeReply<T> {
    pub id: Option<String>,
    pub items: Option<Vec<T>>,
    pub error: Option<String>,
}
