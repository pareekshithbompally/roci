//! What a recording needs from macOS: the Microphone, and System Audio
//! Recording (or Screen Recording, for the ScreenCaptureKit fallback).
//! Reading a state never prompts; only a request does.

pub mod commands;
mod guide;
pub(crate) mod macos;
mod state;

pub use state::PermissionKind;
use state::PermissionState;

/// The first of `needs` a recording lacks now, in checklist order.
pub fn missing(needs: &[PermissionKind]) -> Option<PermissionKind> {
    PermissionKind::ALL
        .into_iter()
        .filter(|kind| needs.contains(kind))
        .find(|kind| macos::state(*kind) != PermissionState::Ready)
}
