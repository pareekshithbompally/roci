use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use crate::types::{AccessResult, AccessStatus, EventsResponse};

// FFI declarations for the Swift CalendarBridge
extern "C" {
    fn calendar_request_access() -> *mut c_char;
    fn calendar_check_access() -> *mut c_char;
    fn calendar_get_upcoming_events(minutes_ahead: i32) -> *mut c_char;
    fn calendar_get_events_in_range(start_iso: *const c_char, end_iso: *const c_char) -> *mut c_char;
    fn calendar_free_string(ptr: *mut c_char);
}

/// Parse a JSON string from a C pointer, then free the pointer.
fn parse_and_free<T: serde::de::DeserializeOwned>(ptr: *mut c_char) -> Result<T, String> {
    if ptr.is_null() {
        return Err("Null pointer from Swift bridge".into());
    }
    let json_str = unsafe {
        let cstr = CStr::from_ptr(ptr);
        let s = cstr.to_string_lossy().into_owned();
        calendar_free_string(ptr);
        s
    };
    serde_json::from_str(&json_str).map_err(|e| format!("JSON parse error: {e}"))
}

/// Request calendar access from the user.
pub fn request_access() -> Result<AccessResult, String> {
    let ptr = unsafe { calendar_request_access() };
    parse_and_free(ptr)
}

/// Check current authorization status.
pub fn check_access() -> Result<AccessStatus, String> {
    let ptr = unsafe { calendar_check_access() };
    parse_and_free(ptr)
}

/// Fetch events starting within the next N minutes.
pub fn get_upcoming_events(minutes_ahead: u32) -> Result<EventsResponse, String> {
    let ptr = unsafe { calendar_get_upcoming_events(minutes_ahead as i32) };
    parse_and_free(ptr)
}

/// Fetch events in an ISO 8601 date range.
pub fn get_events_in_range(start: &str, end: &str) -> Result<EventsResponse, String> {
    let start_c = CString::new(start).map_err(|e| format!("Invalid start date: {e}"))?;
    let end_c = CString::new(end).map_err(|e| format!("Invalid end date: {e}"))?;
    let ptr = unsafe { calendar_get_events_in_range(start_c.as_ptr(), end_c.as_ptr()) };
    parse_and_free(ptr)
}
