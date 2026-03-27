mod bridge;
mod commands;
pub mod types;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

/// Initialize the calendar Tauri plugin.
///
/// Provides read-only access to macOS Calendar events via EventKit.
/// Requires `NSCalendarsFullAccessUsageDescription` in Info.plist.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("calendar")
        .invoke_handler(tauri::generate_handler![
            commands::request_access,
            commands::check_access,
            commands::get_upcoming_events,
            commands::get_events_in_range,
        ])
        .build()
}
