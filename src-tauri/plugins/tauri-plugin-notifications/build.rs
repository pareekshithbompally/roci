const COMMANDS: &[&str] = &[
    "status",
    "request",
    "post",
    "schedule",
    "remove",
    "add_categories",
    "set_muted",
];

fn main() {
    apple_build::SwiftLibrary {
        name: "notifications_bridge",
        module: "NotificationsBridge",
        sources: &["swift/NotificationsBridge.swift"],
        frameworks: &["UserNotifications", "Foundation"],
    }
    .build();
    tauri_plugin::Builder::new(COMMANDS).build();
}
