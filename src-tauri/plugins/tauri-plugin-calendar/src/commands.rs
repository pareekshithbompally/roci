use tauri::command;

use crate::bridge;
use crate::types::{AccessResult, AccessStatus, CalendarEvent};

/// Request calendar access permission from the user.
/// Triggers macOS permission dialog if not yet determined.
#[command]
pub fn request_access() -> Result<AccessResult, String> {
    bridge::request_access()
}

/// Check current calendar authorization status without prompting.
#[command]
pub fn check_access() -> Result<AccessStatus, String> {
    bridge::check_access()
}

/// Fetch calendar events starting within the next `minutes_ahead` minutes.
/// Excludes events the user has declined.
#[command]
pub fn get_upcoming_events(minutes_ahead: Option<u32>) -> Result<Vec<CalendarEvent>, String> {
    let ahead = minutes_ahead.unwrap_or(15);
    let response = bridge::get_upcoming_events(ahead)?;
    if let Some(err) = response.error {
        return Err(err);
    }
    Ok(response.events)
}

/// Fetch calendar events in an ISO 8601 date range.
#[command]
pub fn get_events_in_range(start: String, end: String) -> Result<Vec<CalendarEvent>, String> {
    let response = bridge::get_events_in_range(&start, &end)?;
    if let Some(err) = response.error {
        return Err(err);
    }
    Ok(response.events)
}
