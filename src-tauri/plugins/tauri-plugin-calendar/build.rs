const COMMANDS: &[&str] = &[
    "request_access",
    "check_access",
    "get_upcoming_events",
    "get_events_in_range",
    "reminders_request_access",
    "reminders_check_access",
    "reminders_lists",
    "reminders_ensure_list",
    "reminders_upsert",
    "reminders_states",
];

fn main() {
    apple_build::SwiftLibrary {
        name: "calendar_bridge",
        module: "CalendarBridge",
        sources: &["swift/CalendarBridge.swift", "swift/RemindersBridge.swift"],
        frameworks: &["EventKit", "Foundation"],
    }
    .build();
    tauri_plugin::Builder::new(COMMANDS).build();
}
