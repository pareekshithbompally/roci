
use std::ffi::c_void;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};

use block2::RcBlock;
use objc2::msg_send;
use objc2::runtime::{AnyClass, Bool};
use objc2_core_foundation::CFString;
use objc2_foundation::NSString;

use super::state::{PermissionKind, PermissionState};

/// Runs when macOS reports a consent answer (a prompt was answered); set once at setup.
static ON_ANSWERED: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

/// Call `handler` whenever a microphone or System Audio Recording prompt is answered. Register once.
pub(crate) fn on_answered(handler: impl Fn() + Send + Sync + 'static) {
    if ON_ANSWERED.set(Box::new(handler)).is_err() {
        tracing::warn!("permission answer handler already registered");
    }
}

fn answered() {
    if let Some(handler) = ON_ANSWERED.get() {
        handler();
    }
}

/// How `kind` stands now. Never prompts.
pub fn state(kind: PermissionKind) -> PermissionState {
    match kind {
        PermissionKind::Microphone => microphone_state(),
        PermissionKind::SystemAudio => system_audio_state(),
    }
}

/// Asks macOS for `kind`. macOS prompts only while it is undecided.
pub fn request(kind: PermissionKind) {
    match kind {
        PermissionKind::Microphone => request_microphone(),
        PermissionKind::SystemAudio => {
            if !request_system_audio_access() {
                request_screen_recording();
            }
        }
    }
}

fn system_audio_state() -> PermissionState {
    if system_audio_permitted() {
        return PermissionState::Ready;
    }
    match system_audio_authorization() {
        SystemAudioAuthorization::NotDetermined => PermissionState::NeedsRequest,
        _ => PermissionState::NeedsSettings,
    }
}

// MARK: Microphone

pub fn request_microphone() {
    let Some(class) = AnyClass::get(c"AVCaptureDevice") else {
        tracing::error!("AVCaptureDevice is unavailable");
        return;
    };
    let handler = RcBlock::new(|granted: Bool| {
        tracing::info!(
            granted = granted.as_bool(),
            "microphone permission request finished"
        );
        answered();
    });
    unsafe {
        let _: () = msg_send![
            class,
            requestAccessForMediaType: &*AVMediaTypeAudio,
            completionHandler: &*handler
        ];
    }
}

fn microphone_state() -> PermissionState {
    let Some(class) = AnyClass::get(c"AVCaptureDevice") else {
        return PermissionState::NeedsRequest;
    };
    let status: isize =
        unsafe { msg_send![class, authorizationStatusForMediaType: &*AVMediaTypeAudio] };
    microphone_authorization_state(status)
}

const fn microphone_authorization_state(status: isize) -> PermissionState {
    match status {
        0 => PermissionState::NeedsRequest,
        3 => PermissionState::Ready,
        _ => PermissionState::NeedsSettings,
    }
}

#[link(name = "AVFoundation", kind = "framework")]
unsafe extern "C" {
    static AVMediaTypeAudio: *const NSString;
}

// MARK: Screen and system audio

unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Whether macOS allows Screen & System Audio Recording, which capture needs for remote audio.
pub(crate) fn screen_recording_permitted() -> bool {
    // SAFETY: A CoreGraphics query without arguments or side effects.
    unsafe { CGPreflightScreenCaptureAccess() }
}

/// Lists Roci under Screen & System Audio Recording; macOS prompts at most once.
pub(crate) fn request_screen_recording() -> bool {
    // SAFETY: A CoreGraphics request without arguments.
    unsafe { CGRequestScreenCaptureAccess() }
}

/// Whether capture can hear others: System Audio Recording (process tap) or Screen Recording (fallback).
pub(crate) fn system_audio_permitted() -> bool {
    system_audio_ready() || screen_recording_permitted()
}

/// Whether system audio uses the display-independent process tap.
pub(crate) fn system_audio_ready() -> bool {
    matches!(
        system_audio_authorization(),
        SystemAudioAuthorization::Granted | SystemAudioAuthorization::Unknown
    )
}

/// System Audio Recording consent (TCC `kTCCServiceAudioCapture`); Screen Recording does not imply it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SystemAudioAuthorization {
    Granted,
    Denied,
    NotDetermined,
    /// The private TCC query is unavailable; try the tap and let macOS ask.
    Unknown,
}

type TccPreflight = unsafe extern "C" fn(*const c_void, *const c_void) -> i32;
type TccRequest = unsafe extern "C" fn(*const c_void, *const c_void, *mut c_void);

struct Tcc {
    preflight: TccPreflight,
    request: TccRequest,
}

fn tcc() -> Option<&'static Tcc> {
    static TCC: OnceLock<Option<Tcc>> = OnceLock::new();
    TCC.get_or_init(|| {
        // SAFETY: dlopen/dlsym of a system framework; symbols are checked.
        unsafe {
            let handle = libc::dlopen(
                c"/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC".as_ptr(),
                libc::RTLD_NOW,
            );
            if handle.is_null() {
                return None;
            }
            let preflight = libc::dlsym(handle, c"TCCAccessPreflight".as_ptr());
            let request = libc::dlsym(handle, c"TCCAccessRequest".as_ptr());
            if preflight.is_null() || request.is_null() {
                return None;
            }
            Some(Tcc {
                preflight: std::mem::transmute::<*mut c_void, TccPreflight>(preflight),
                request: std::mem::transmute::<*mut c_void, TccRequest>(request),
            })
        }
    })
    .as_ref()
}

fn audio_capture_service() -> objc2_core_foundation::CFRetained<CFString> {
    CFString::from_static_str("kTCCServiceAudioCapture")
}

pub fn system_audio_authorization() -> SystemAudioAuthorization {
    let Some(tcc) = tcc() else {
        return SystemAudioAuthorization::Unknown;
    };
    let service = audio_capture_service();
    // SAFETY: A CFString service name and no options.
    let result =
        unsafe { (tcc.preflight)((&*service as *const CFString).cast(), std::ptr::null()) };
    match result {
        0 => SystemAudioAuthorization::Granted,
        1 => SystemAudioAuthorization::Denied,
        _ => SystemAudioAuthorization::NotDetermined,
    }
}

static SYSTEM_AUDIO_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Shows the System Audio Recording prompt when consent is undecided; returns whether it was requested.
pub fn request_system_audio_access() -> bool {
    if system_audio_authorization() != SystemAudioAuthorization::NotDetermined
        || SYSTEM_AUDIO_REQUESTED.swap(true, Ordering::Relaxed)
    {
        return false;
    }
    let Some(tcc) = tcc() else {
        return false;
    };
    let service = audio_capture_service();
    let completion = RcBlock::new(|granted: Bool| {
        tracing::info!(
            granted = granted.as_bool(),
            "system audio recording consent answered"
        );
        answered();
    });
    // SAFETY: TCC copies the completion block before returning.
    unsafe {
        (tcc.request)(
            (&*service as *const CFString).cast(),
            std::ptr::null(),
            RcBlock::as_ptr(&completion).cast(),
        );
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denied_microphone_permission_requires_system_settings() {
        assert_eq!(
            microphone_authorization_state(0),
            PermissionState::NeedsRequest
        );
        assert_eq!(
            microphone_authorization_state(2),
            PermissionState::NeedsSettings
        );
        assert_eq!(microphone_authorization_state(3), PermissionState::Ready);
    }
}
