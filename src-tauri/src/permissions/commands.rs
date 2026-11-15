//! The permission checklist's Tauri commands.

use tauri::AppHandle;

use super::state::{PermissionKind, PermissionRow};
use super::{guide, macos};

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

/// Opens System Settings at the list for `kind`, with the floating guide beside it.
#[tauri::command]
pub fn open_permission_settings(app: AppHandle, kind: PermissionKind) -> Result<(), String> {
    app.run_on_main_thread(move || guide::show(kind))
        .map_err(|error| format!("could not open System Settings: {error}"))
}
