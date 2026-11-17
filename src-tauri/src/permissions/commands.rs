//! The permission checklist's Tauri commands.

use tauri::AppHandle;

use super::state::{PermissionKind, PermissionRow};
use super::system;
#[cfg(target_os = "macos")]
use super::guide;

/// iOS: Roci's own page in Settings (`UIApplication.openSettingsURLString`), where its permissions live.
#[cfg(target_os = "ios")]
const APP_SETTINGS_URL: &str = "app-settings:";

/// Every permission a recording needs, in checklist order. Never prompts.
#[tauri::command]
pub fn get_permissions() -> Vec<PermissionRow> {
    PermissionKind::ALL
        .map(|kind| PermissionRow {
            kind,
            state: system::state(kind),
        })
        .to_vec()
}

/// Asks the system for `kind`; it shows its prompt only while undecided.
#[tauri::command]
pub fn request_permission(kind: PermissionKind) {
    system::request(kind);
}

/// Opens System Settings at the list for `kind`, with the floating guide beside it.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn open_permission_settings(app: AppHandle, kind: PermissionKind) -> Result<(), String> {
    app.run_on_main_thread(move || guide::show(kind))
        .map_err(|error| format!("could not open System Settings: {error}"))
}

/// Opens Roci's page in Settings, the one place iOS lets an app send the user to turn a permission back on.
#[cfg(target_os = "ios")]
#[tauri::command]
pub fn open_permission_settings(app: AppHandle, _kind: PermissionKind) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(APP_SETTINGS_URL, None::<&str>)
        .map_err(|error| format!("could not open Settings: {error}"))
}
