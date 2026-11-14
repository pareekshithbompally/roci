use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use crate::types::{
    AccessResult, AccessStatus, BridgeReply, EventsResponse, ReminderInput, ReminderState, RemindersList,
    RemindersListsResponse,
};

// FFI declarations for the Swift CalendarBridge
extern "C" {
    fn calendar_request_access() -> *mut c_char;
    fn calendar_check_access() -> *mut c_char;
    fn calendar_get_upcoming_events(minutes_ahead: i32) -> *mut c_char;
    fn calendar_get_events_in_range(start_iso: *const c_char, end_iso: *const c_char) -> *mut c_char;
    fn calendar_change_count() -> u64;
    fn calendar_get_events_between_ms(start_ms: f64, end_ms: f64) -> *mut c_char;
    fn calendar_free_string(ptr: *mut c_char);

    fn reminders_request_access() -> *mut c_char;
    fn reminders_check_access() -> *mut c_char;
    fn reminders_lists() -> *mut c_char;
    fn reminders_ensure_list(title: *const c_char) -> *mut c_char;
    fn reminders_upsert(input: *const c_char) -> *mut c_char;
    fn reminders_states(list_id: *const c_char) -> *mut c_char;
    fn reminders_observe_changes(callback: extern "C" fn());
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

/// Fetch events between two epoch-millisecond times.
pub fn get_events_between_ms(start_ms: i64, end_ms: i64) -> Result<EventsResponse, String> {
    let ptr = unsafe { calendar_get_events_between_ms(start_ms as f64, end_ms as f64) };
    parse_and_free(ptr)
}

/// EventKit store changes seen so far (any app); 0 without access.
pub fn change_count() -> u64 {
    unsafe { calendar_change_count() }
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

// ─── Reminders ──────────────────────────────────────────────────────────────

/// Request full reminders access from the user.
pub fn request_reminders_access() -> Result<AccessResult, String> {
    parse_and_free(unsafe { reminders_request_access() })
}

/// Current reminders authorization, without prompting.
pub fn check_reminders_access() -> Result<AccessStatus, String> {
    parse_and_free(unsafe { reminders_check_access() })
}

/// Every reminders list.
pub fn reminders_list_all() -> Result<Vec<RemindersList>, String> {
    parse_and_free::<RemindersListsResponse>(unsafe { reminders_lists() }).map(|r| r.lists)
}

/// The id of the list titled `title`, created when missing.
pub fn ensure_reminders_list(title: &str) -> Result<String, String> {
    let title = CString::new(title).map_err(|e| format!("Invalid list title: {e}"))?;
    let reply: BridgeReply<ReminderState> = parse_and_free(unsafe { reminders_ensure_list(title.as_ptr()) })?;
    reply_result(reply.error)?;
    reply.id.ok_or_else(|| "Reminders list has no id".into())
}

/// Create or update the reminder for one to-do.
pub fn upsert_reminder(input: &ReminderInput) -> Result<(), String> {
    let json = serde_json::to_string(input).map_err(|e| format!("Invalid reminder: {e}"))?;
    let json = CString::new(json).map_err(|e| format!("Invalid reminder: {e}"))?;
    let reply: BridgeReply<ReminderState> = parse_and_free(unsafe { reminders_upsert(json.as_ptr()) })?;
    reply_result(reply.error)
}

/// Completion of every Kasset-tagged reminder in a list.
pub fn reminder_states(list_id: &str) -> Result<Vec<ReminderState>, String> {
    let list_id = CString::new(list_id).map_err(|e| format!("Invalid list id: {e}"))?;
    let reply: BridgeReply<ReminderState> = parse_and_free(unsafe { reminders_states(list_id.as_ptr()) })?;
    reply_result(reply.error)?;
    Ok(reply.items.unwrap_or_default())
}

/// Calls `callback` whenever the reminders database changes. Register once.
pub fn observe_reminders(callback: extern "C" fn()) {
    unsafe { reminders_observe_changes(callback) }
}

fn reply_result(error: Option<String>) -> Result<(), String> {
    error.map_or(Ok(()), Err)
}
