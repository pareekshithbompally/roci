//! Microphone and System Audio (or Screen) Recording consent; reading never prompts, only a request does.

pub mod commands;
mod guide;
pub(crate) mod macos;
mod state;

use tauri::{AppHandle, Emitter};

pub use state::PermissionKind;
use state::PermissionState;

/// Webview: a permission prompt was answered, so the rows re-read now instead of on the next focus.
pub const CHANGED_EVENT: &str = "permissions://changed";

/// Emits [`CHANGED_EVENT`] whenever macOS reports a consent answer. Call once from setup.
pub fn emit_answers(app: AppHandle) {
    macos::on_answered(move || {
        if let Err(error) = app.emit(CHANGED_EVENT, ()) {
            tracing::warn!("permission change event failed: {error}");
        }
    });
}

/// The first of `needs` a recording lacks now, in checklist order.
pub fn missing(needs: &[PermissionKind]) -> Option<PermissionKind> {
    PermissionKind::ALL
        .into_iter()
        .filter(|kind| needs.contains(kind))
        .find(|kind| macos::state(*kind) != PermissionState::Ready)
}
