//! The permission checklist's Tauri commands.

use super::macos;
use super::state::{PermissionKind, PermissionRow};

/// Every permission a recording needs, in checklist order. Never prompts.
#[tauri::command]
pub fn get_permissions() -> Vec<PermissionRow> {
    PermissionKind::ALL
        .map(|kind| PermissionRow {
            kind,
            state: macos::state(kind),
        })
        .to_vec()
}

/// Asks macOS for `kind`; it shows its prompt only while undecided.
#[tauri::command]
pub fn request_permission(kind: PermissionKind) {
    macos::request(kind);
}

/// Opens the System Settings pane that lists `kind`.
#[tauri::command]
pub fn open_permission_settings(kind: PermissionKind) -> Result<(), String> {
    std::process::Command::new("/usr/bin/open")
        .arg(macos::settings_url(kind))
        .spawn()
        .map(drop)
        .map_err(|error| format!("could not open System Settings: {error}"))
}
