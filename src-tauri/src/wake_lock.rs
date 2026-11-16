//! Keeps the Mac from idle-sleeping (display and system) for as long as a `WakeLock` lives.

use core_foundation::base::TCFType;
use core_foundation::string::{CFString, CFStringRef};

type IOPMAssertionID = u32;
type IOReturn = i32;

const K_IOPM_ASSERTION_LEVEL_ON: u32 = 255;
/// kIOPMAssertionTypePreventUserIdleDisplaySleep
const K_ASSERTION_TYPE: &str = "PreventUserIdleDisplaySleep";
const K_IORETURN_SUCCESS: IOReturn = 0;

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOPMAssertionCreateWithName(
        assertionType: CFStringRef,
        assertionLevel: u32,
        assertionName: CFStringRef,
        assertionID: *mut IOPMAssertionID,
    ) -> IOReturn;

    fn IOPMAssertionRelease(assertionID: IOPMAssertionID) -> IOReturn;
}

/// An IOKit power assertion, released on drop.
pub struct WakeLock(IOPMAssertionID);

impl WakeLock {
    /// `None` (logged) when macOS refuses the assertion; recording goes on without it.
    pub fn acquire(reason: &str) -> Option<Self> {
        let assertion_type = CFString::new(K_ASSERTION_TYPE);
        let assertion_name = CFString::new(reason);
        let mut id: IOPMAssertionID = 0;
        let result = unsafe {
            IOPMAssertionCreateWithName(
                assertion_type.as_concrete_TypeRef(),
                K_IOPM_ASSERTION_LEVEL_ON,
                assertion_name.as_concrete_TypeRef(),
                &mut id,
            )
        };
        if result != K_IORETURN_SUCCESS {
            log::warn!("[wake_lock] IOPMAssertionCreateWithName failed: {result}");
            return None;
        }
        log::info!("[wake_lock] acquired (IOPMAssertion id={id})");
        Some(Self(id))
    }
}

impl Drop for WakeLock {
    fn drop(&mut self) {
        let result = unsafe { IOPMAssertionRelease(self.0) };
        if result != K_IORETURN_SUCCESS {
            log::warn!("[wake_lock] IOPMAssertionRelease returned {result}");
        }
        log::info!("[wake_lock] released");
    }
}
