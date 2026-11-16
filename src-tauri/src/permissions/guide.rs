//! Floating guide beside Privacy & Security: opens one permission's pane and closes once it is granted.

use objc2::MainThreadMarker;

use super::state::PermissionKind;

unsafe extern "C" {
    fn roci_show_permission_guide(permission: i32);
}

/// The guide's permission codes (`RociPermission` in permission_guide.m).
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
        unsafe { roci_show_permission_guide(code(kind)) };
    }
}
