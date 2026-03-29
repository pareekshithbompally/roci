use serde::{Deserialize, Serialize};

/// A calendar event from macOS EventKit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub event_id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub organizer_name: Option<String>,
    pub organizer_email: Option<String>,
    pub attendees: Vec<Attendee>,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub url: Option<String>,
    pub calendar_name: String,
    pub is_all_day: bool,
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
