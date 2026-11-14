use tauri::command;

use crate::bridge;
use crate::types::{AccessResult, AccessStatus, CalendarEvent, ReminderInput, ReminderState, RemindersList};

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

// ─── Reminders ──────────────────────────────────────────────────────────────
// EventKit calls block on a semaphore, so they run off the main thread.

async fn off_main<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("Reminders task failed: {e}"))?
}

/// Request reminders access (the macOS prompt shows only while undecided).
#[command]
pub async fn reminders_request_access() -> Result<AccessResult, String> {
    off_main(bridge::request_reminders_access).await
}

/// Current reminders authorization, without prompting.
#[command]
pub fn reminders_check_access() -> Result<AccessStatus, String> {
    bridge::check_reminders_access()
}

/// Every reminders list.
#[command]
pub async fn reminders_lists() -> Result<Vec<RemindersList>, String> {
    off_main(bridge::reminders_list_all).await
}

/// The id of the list titled `title`, created when missing.
#[command]
pub async fn reminders_ensure_list(title: String) -> Result<String, String> {
    off_main(move || bridge::ensure_reminders_list(&title)).await
}

/// Create or update reminders for to-dos (one save each).
#[command]
pub async fn reminders_upsert(items: Vec<ReminderInput>) -> Result<(), String> {
    off_main(move || items.iter().try_for_each(bridge::upsert_reminder)).await
}

/// Completion of every Kasset-tagged reminder in a list.
#[command]
pub async fn reminders_states(list_id: String) -> Result<Vec<ReminderState>, String> {
    off_main(move || bridge::reminder_states(&list_id)).await
}
