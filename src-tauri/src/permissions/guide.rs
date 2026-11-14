//! The floating guide beside System Settings' Privacy & Security pane, ported
//! from Hex (`src/desktop/permission_guide.rs` + `native/permission_guide.m`):
//! it opens the pane for one permission, flies Kasset's tile from the click to
//! a drag tile beside System Settings (or, for a refused microphone, asks to
//! switch Kasset on), and closes once the permission is granted.
//!
//! Hex's retired-identity TCC cleanup is not ported: Kasset has one bundle id.

use objc2::MainThreadMarker;

use super::state::PermissionKind;

unsafe extern "C" {
    fn kasset_show_permission_guide(permission: i32);
}

/// The guide's permission codes (`KassetPermission` in permission_guide.m).
const fn code(kind: PermissionKind) -> i32 {
    match kind {
        PermissionKind::Microphone => 2,
        PermissionKind::SystemAudio => 3,
    }
}

/// Shows the guide for `kind`. Main thread only; elsewhere it does nothing.
pub fn show(kind: PermissionKind) {
    if MainThreadMarker::new().is_some() {
        // SAFETY: Called on the main thread, as the guide asserts.
        unsafe { kasset_show_permission_guide(code(kind)) };
    }
}
