mod bridge;
mod call_link;
mod commands;
pub mod types;

use std::sync::OnceLock;

pub use call_link::{call_link, key_matches, CallLink, CallProvider};
use types::{CalendarEvent, EventsResponse};

use tauri::{
    plugin::{Builder, TauriPlugin},
    Emitter, Runtime,
};

/// Frontend event fired when the reminders database changes (any app).
pub const REMINDERS_CHANGED_EVENT: &str = "reminders://changed";

/// Emits `REMINDERS_CHANGED_EVENT`; set once at plugin setup.
static ON_REMINDERS_CHANGED: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

extern "C" fn reminders_changed() {
    if let Some(emit) = ON_REMINDERS_CHANGED.get() {
        emit();
    }
}

/// Events in an ISO 8601 range, each with its `meeting_url`.
pub fn events_in_range(start: &str, end: &str) -> Result<Vec<CalendarEvent>, String> {
    with_links(bridge::get_events_in_range(start, end)?)
}

/// Events between two epoch-millisecond times, each with its `meeting_url`.
pub fn events_between_ms(start_ms: i64, end_ms: i64) -> Result<Vec<CalendarEvent>, String> {
    with_links(bridge::get_events_between_ms(start_ms, end_ms)?)
}

/// EventKit store changes seen so far (any app): reread when it moves.
pub fn change_count() -> u64 {
    bridge::change_count()
}

fn with_links(response: EventsResponse) -> Result<Vec<CalendarEvent>, String> {
    if let Some(err) = response.error {
        return Err(err);
    }
    Ok(response
        .events
        .into_iter()
        .map(|mut event| {
            if let Some(link) = call_link(&event) {
                event.meeting_provider = Some(link.provider.label().to_string());
                event.meeting_url = Some(link.url);
            }
            event
        })
        .collect())
}

/// Initialize the EventKit Tauri plugin: calendar events (read) and reminders
/// (Kasset's to-dos, read/write). Requires `NSCalendarsFullAccessUsageDescription`
/// and `NSRemindersFullAccessUsageDescription` in Info.plist.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("calendar")
        .invoke_handler(tauri::generate_handler![
            commands::request_access,
            commands::check_access,
            commands::get_upcoming_events,
            commands::get_events_in_range,
            commands::reminders_request_access,
            commands::reminders_check_access,
            commands::reminders_lists,
            commands::reminders_ensure_list,
            commands::reminders_upsert,
            commands::reminders_states,
        ])
        .setup(|app, _api| {
            let handle = app.clone();
            let emit = move || {
                if let Err(error) = handle.emit(REMINDERS_CHANGED_EVENT, ()) {
                    log::warn!("[calendar] reminders change event failed: {error}");
                }
            };
            if ON_REMINDERS_CHANGED.set(Box::new(emit)).is_ok() {
                bridge::observe_reminders(reminders_changed);
            }
            Ok(())
        })
        .build()
}
