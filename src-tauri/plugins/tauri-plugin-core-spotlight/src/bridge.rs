//! FFI to `swift/CoreSpotlightBridge.swift`: JSON in, JSON out, every returned
//! string freed through `core_spotlight_free_string`.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use serde::de::DeserializeOwned;
use serde::Serialize;

extern "C" {
    fn core_spotlight_setup(callback: extern "C" fn(*const c_char));
    fn core_spotlight_supported() -> bool;
    fn core_spotlight_index(json: *const c_char) -> *mut c_char;
    fn core_spotlight_remove(json: *const c_char) -> *mut c_char;
    fn core_spotlight_remove_all() -> *mut c_char;
    fn core_spotlight_free_string(ptr: *mut c_char);
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
        core_spotlight_free_string(ptr);
        json
    };
    serde_json::from_str(&json).map_err(|e| format!("JSON parse error: {e}"))
}

/// Read a `{"ok","error"?}` answer.
fn ok(ptr: *mut c_char) -> Result<(), String> {
    let reply: OkReply = take(ptr)?;
    if reply.ok {
        Ok(())
    } else {
        Err(reply
            .error
            .unwrap_or_else(|| "Core Spotlight bridge failed".into()))
    }
}

/// Call a bridge function that takes JSON and answers `{"ok","error"?}`.
fn call_ok(
    input: &impl Serialize,
    call: unsafe extern "C" fn(*const c_char) -> *mut c_char,
) -> Result<(), String> {
    let json = serde_json::to_string(input).map_err(|e| e.to_string())?;
    let json = CString::new(json).map_err(|e| e.to_string())?;
    ok(unsafe { call(json.as_ptr()) })
}

pub fn setup(callback: extern "C" fn(*const c_char)) {
    unsafe { core_spotlight_setup(callback) }
}

pub fn supported() -> bool {
    unsafe { core_spotlight_supported() }
}

pub fn index(items: &impl Serialize) -> Result<(), String> {
    call_ok(items, core_spotlight_index)
}

pub fn remove(ids: &impl Serialize) -> Result<(), String> {
    call_ok(ids, core_spotlight_remove)
}

pub fn remove_all() -> Result<(), String> {
    ok(unsafe { core_spotlight_remove_all() })
}
