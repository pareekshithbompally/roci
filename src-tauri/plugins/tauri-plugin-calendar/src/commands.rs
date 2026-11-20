use tauri::command;

use crate::bridge;
use crate::types::{AccessResult, AccessStatus, CalendarEvent, ReminderInput, ReminderState, RemindersList};

// EventKit calls block (a semaphore, a synchronous fetch), so every command runs off the main thread.

async fn off_main<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("EventKit task failed: {e}"))?
}

/// Requests calendar access; macOS prompts only while undecided.
#[command]
pub async fn request_access() -> Result<AccessResult, String> {
    off_main(bridge::request_access).await
}

/// Check current calendar authorization status without prompting.
#[command]
pub async fn check_access() -> Result<AccessStatus, String> {
    off_main(bridge::check_access).await
}

/// Fetch calendar events in an ISO 8601 date range.
#[command]
pub async fn get_events_in_range(start: String, end: String) -> Result<Vec<CalendarEvent>, String> {
    off_main(move || crate::events_in_range(&start, &end)).await
}

// ─── Reminders ──────────────────────────────────────────────────────────────

/// Request reminders access (the macOS prompt shows only while undecided).
#[command]
pub async fn reminders_request_access() -> Result<AccessResult, String> {
    off_main(bridge::request_reminders_access).await
}

/// Current reminders authorization, without prompting.
#[command]
pub async fn reminders_check_access() -> Result<AccessStatus, String> {
    off_main(bridge::check_reminders_access).await
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

/// Delete the reminders of removed to-dos from a list.
#[command]
pub async fn reminders_remove(list_id: String, todo_ids: Vec<String>) -> Result<(), String> {
    off_main(move || bridge::remove_reminders(&list_id, &todo_ids)).await
}

/// Completion of every Roci-tagged reminder in a list.
#[command]
pub async fn reminders_states(list_id: String) -> Result<Vec<ReminderState>, String> {
    off_main(move || bridge::reminder_states(&list_id)).await
}
