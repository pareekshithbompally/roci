//! FFI to `swift/NotificationsBridge.swift`: JSON in/out, returned strings freed by `notifications_free_string`.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use serde::de::DeserializeOwned;
use serde::Serialize;

extern "C" {
    fn notifications_setup(callback: extern "C" fn(*const c_char));
    fn notifications_status() -> *mut c_char;
    fn notifications_request() -> *mut c_char;
    fn notifications_set_categories(json: *const c_char) -> *mut c_char;
    fn notifications_show(json: *const c_char) -> *mut c_char;
    fn notifications_remove(json: *const c_char) -> *mut c_char;
    fn notifications_remove_pending_prefix(json: *const c_char) -> *mut c_char;
    fn notifications_free_string(ptr: *mut c_char);
}

#[derive(serde::Deserialize)]
pub struct StatusReply {
    pub status: String,
    /// Set when macOS refused the request (e.g. an unsigned bundle).
    pub error: Option<String>,
}

#[derive(serde::Deserialize)]
struct OkReply {
    ok: bool,
    error: Option<String>,
}

fn take<T: DeserializeOwned>(ptr: *mut c_char) -> Result<T, String> {
    if ptr.is_null() {
        return Err("Null pointer from Swift bridge".into());
    }
    let json = unsafe {
        let json = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        notifications_free_string(ptr);
        json
    };
    serde_json::from_str(&json).map_err(|e| format!("JSON parse error: {e}"))
}

/// Call a bridge function that takes JSON and answers `{"ok","error"?}`.
fn call_ok(input: &impl Serialize, call: unsafe extern "C" fn(*const c_char) -> *mut c_char) -> Result<(), String> {
    let json = serde_json::to_string(input).map_err(|e| e.to_string())?;
    let json = CString::new(json).map_err(|e| e.to_string())?;
    let reply: OkReply = take(unsafe { call(json.as_ptr()) })?;
    if reply.ok {
        Ok(())
    } else {
        Err(reply.error.unwrap_or_else(|| "Notification bridge failed".into()))
    }
}

pub fn setup(callback: extern "C" fn(*const c_char)) {
    unsafe { notifications_setup(callback) }
}

pub fn status() -> Result<StatusReply, String> {
    take(unsafe { notifications_status() })
}

pub fn request() -> Result<StatusReply, String> {
    take(unsafe { notifications_request() })
}

pub fn set_categories(categories: &impl Serialize) -> Result<(), String> {
    call_ok(categories, notifications_set_categories)
}

pub fn show(notice: &impl Serialize) -> Result<(), String> {
    call_ok(notice, notifications_show)
}

pub fn remove(ids: &impl Serialize) -> Result<(), String> {
    call_ok(ids, notifications_remove)
}

pub fn remove_pending_prefix(prefix: &str) -> Result<(), String> {
    call_ok(&prefix, notifications_remove_pending_prefix)
}
