mod bridge;
mod commands;
pub mod types;

use std::sync::OnceLock;

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
