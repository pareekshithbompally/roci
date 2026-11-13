//! FFI bridge to the native Swift audio engine (`src-tauri/swift/`).
//!
//! Each `extern "C"` function below is paired with an `@_cdecl` function of the
//! same name in `swift/AudioBridge.swift`. The Swift side returns a JSON status
//! string (`{"ok":bool,"error":?}`) which [`take_status`] parses and then frees
//! through `audio_free_string`. Level-meter frames flow the other way via
//! [`level_callback`], which re-emits them as the `coreaudio-level` Tauri event.

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Audio level meter event — shape unchanged from the old Rust pipeline so the
/// frontend `coreaudio-level` listener keeps working verbatim.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioLevelEvent {
    levels: Vec<u8>,
    level: f32,
    peak: f32,
}

// FFI to the Swift AudioBridge (swift/AudioBridge.swift).
unsafe extern "C" {
    fn audio_start(
        source: i32,
        hq_path: *const c_char,
        ai_path: *const c_char,
        callback: extern "C" fn(*mut c_void, f32, f32, *const u8, usize),
        ctx: *mut c_void,
    ) -> *mut c_char;
    fn audio_stop() -> *mut c_char;
    fn audio_pause() -> *mut c_char;
    fn audio_resume() -> *mut c_char;
    fn audio_free_string(ptr: *mut c_char);
}

/// Invoked from Swift's audio tap with the latest level frame. `ctx` is the
/// boxed `AppHandle` handed to `start`. Tauri's `emit` is thread-safe.
extern "C" fn level_callback(
    ctx: *mut c_void,
    rms: f32,
    peak: f32,
    bars: *const u8,
    len: usize,
) {
    if ctx.is_null() || bars.is_null() {
        return;
    }
    let app = unsafe { &*(ctx as *const AppHandle) };
    let levels = unsafe { std::slice::from_raw_parts(bars, len) }.to_vec();
    let _ = app.emit("coreaudio-level", AudioLevelEvent { levels, level: rms, peak });
}

/// Parse the `{"ok":bool,"error":...}` JSON returned by the Swift bridge and
/// free the C string.
fn take_status(ptr: *mut c_char) -> Result<(), String> {
    if ptr.is_null() {
        return Err("Null response from audio bridge".into());
    }
    let s = unsafe {
        let owned = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        audio_free_string(ptr);
        owned
    };
    let v: serde_json::Value = serde_json::from_str(&s).map_err(|e| format!("Bad bridge JSON: {e}"))?;
    if v["ok"].as_bool() == Some(true) {
        Ok(())
    } else {
        Err(v["error"].as_str().unwrap_or("Unknown audio error").to_string())
    }
}

/// Start capture. Returns the boxed-`AppHandle` context pointer (as usize so it
/// can be stored across threads); pass it back to `stop` to release it.
pub fn start(source: i32, hq_path: &str, ai_path: &str, app: AppHandle) -> Result<usize, String> {
    let hq = CString::new(hq_path).map_err(|e| e.to_string())?;
    let ai = CString::new(ai_path).map_err(|e| e.to_string())?;
    let ctx = Box::into_raw(Box::new(app)) as *mut c_void;
    let resp = unsafe { audio_start(source, hq.as_ptr(), ai.as_ptr(), level_callback, ctx) };
    match take_status(resp) {
        Ok(()) => Ok(ctx as usize),
        Err(e) => {
            log::error!("[audio] bridge start failed: {e}");
            unsafe { drop(Box::from_raw(ctx as *mut AppHandle)) };
            Err(e)
        }
    }
}

/// Stop capture, finalize the WAV files, and release the context. Blocking —
/// callers run this on a blocking thread, never the async runtime.
pub fn stop(ctx: usize) {
    let _ = take_status(unsafe { audio_stop() });
    if ctx != 0 {
        unsafe { drop(Box::from_raw(ctx as *mut AppHandle)) };
    }
}

pub fn pause() -> Result<(), String> {
    take_status(unsafe { audio_pause() })
}

pub fn resume() -> Result<(), String> {
    take_status(unsafe { audio_resume() })
}
