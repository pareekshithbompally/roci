/// Wake lock via IOKit power management assertions.
///
/// Uses IOPMAssertionCreateWithName with assertion type
/// "PreventUserIdleDisplaySleep" — prevents display idle sleep and cascades
/// to prevent system idle sleep. This is the same assertion used by Zoom,
/// QuickTime, and all recording/video apps on macOS.
///
/// No subprocess, no bindgen: calls IOKit directly using the core-foundation
/// crate that is already a project dependency.
use core_foundation::base::TCFType;
use core_foundation::string::{CFString, CFStringRef};
use std::sync::Mutex;

type IOPMAssertionID = u32;
type IOReturn = i32;

const K_IOPM_ASSERTION_LEVEL_ON: u32 = 255;
/// kIOPMAssertionTypePreventUserIdleDisplaySleep
const K_ASSERTION_TYPE: &str = "PreventUserIdleDisplaySleep";
const K_IORETURN_SUCCESS: IOReturn = 0;

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOPMAssertionCreateWithName(
        assertionType: CFStringRef,
        assertionLevel: u32,
        assertionName: CFStringRef,
        assertionID: *mut IOPMAssertionID,
    ) -> IOReturn;

    fn IOPMAssertionRelease(assertionID: IOPMAssertionID) -> IOReturn;
}

/// Holds the active IOPMAssertionID while recording is in progress.
pub struct WakeLockState {
    assertion_id: Mutex<Option<IOPMAssertionID>>,
}

impl WakeLockState {
    pub fn new() -> Self {
        Self { assertion_id: Mutex::new(None) }
    }
}

/// Prevent display and system idle sleep.
/// Idempotent — calling while already held is a no-op.
#[tauri::command]
pub fn acquire_wake_lock(state: tauri::State<WakeLockState>) -> Result<(), String> {
    let mut guard = state.assertion_id.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }

    let assertion_type = CFString::new(K_ASSERTION_TYPE);
    let assertion_name = CFString::new("Recording in progress");
    let mut assertion_id: IOPMAssertionID = 0;

    let result = unsafe {
        IOPMAssertionCreateWithName(
            assertion_type.as_concrete_TypeRef(),
            K_IOPM_ASSERTION_LEVEL_ON,
            assertion_name.as_concrete_TypeRef(),
            &mut assertion_id,
        )
    };

    if result != K_IORETURN_SUCCESS {
        return Err(format!("IOPMAssertionCreateWithName failed: {result}"));
    }

    *guard = Some(assertion_id);
    log::info!("[wake_lock] acquired (IOPMAssertion id={assertion_id})");
    Ok(())
}

/// Release the IOPMAssertion. No-op if not currently held.
#[tauri::command]
pub fn release_wake_lock(state: tauri::State<WakeLockState>) -> Result<(), String> {
    let mut guard = state.assertion_id.lock().map_err(|e| e.to_string())?;
    if let Some(id) = guard.take() {
        let result = unsafe { IOPMAssertionRelease(id) };
        if result != K_IORETURN_SUCCESS {
            log::warn!("[wake_lock] IOPMAssertionRelease returned {result}");
        }
        log::info!("[wake_lock] released");
    }
    Ok(())
}
