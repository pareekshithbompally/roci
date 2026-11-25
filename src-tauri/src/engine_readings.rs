//! Readings from the engines' shared ggml build that need no model running: a GGUF header (context length, chat
//! template), the memory llama.cpp projects for a model's context, and the app's memory (footprint, highest, how much
//! more it may use).

use std::ffi::{c_char, c_int, CStr, CString};
use std::path::Path;

use roci_llama_sys as sys;
use serde_json::Value;

use crate::models::LocalError;

/// A model file's context length and chat template, read from its GGUF header (no weights loaded).
pub fn model_info(path: &Path) -> (Option<u64>, Option<String>) {
    let Ok(path) = to_c_path(path) else { return (None, None) };
    // SAFETY: a valid C string; the returned string is ours to free.
    let Ok(info) = take(unsafe { sys::roci_llama_model_info(path.as_ptr()) }) else { return (None, None) };
    (info["contextTokens"].as_u64(), info["chatTemplate"].as_str().map(str::to_string))
}

/// The bytes llama.cpp projects for the model file at `path` run as llama-server runs it, with a context of `tokens` and
/// a KV cache of `kv_type` (f16, q8_0, q4_0): its KV cache and compute buffers, measured with no weights read (the
/// weights are memory-mapped, read from disk as needed, and not counted) (blocking).
pub fn projected_memory(path: &Path, tokens: u32, kv_type: &str) -> Result<u64, LocalError> {
    let path = to_c_path(path)?;
    let kv_type = CString::new(kv_type).map_err(|e| LocalError::BadInput(e.to_string()))?;
    let tokens = c_int::try_from(tokens).map_err(|e| LocalError::BadInput(e.to_string()))?;
    // SAFETY: valid C strings; the returned string is ours to free.
    let projection = take(unsafe { sys::roci_llama_project_memory(path.as_ptr(), tokens, kv_type.as_ptr()) })?;
    projection["bytes"].as_u64().ok_or_else(|| LocalError::Engine("llama.cpp projected no memory".into()))
}

/// Logs what the app holds in memory after `event`: its footprint, the highest since launch, and how much more it may use.
pub fn log_memory(event: &str) {
    let Some(reading) = memory() else { return };
    let mb = |key: &str| reading[key].as_u64().map_or_else(|| "-".to_string(), |bytes| (bytes >> 20).to_string());
    log::info!("[memory] {event}: footprint {} MB (highest {}) · available {} MB", mb("footprint"), mb("footprintPeak"), mb("available"));
}

/// The shim's memory reading (`footprint`, `footprintPeak`, `available`, bytes).
pub(crate) fn memory() -> Option<Value> {
    // SAFETY: no input; the returned string is ours to free.
    take(unsafe { sys::roci_llama_memory() }).ok()
}

/// One figure of the memory reading, bytes (0 when unknown); the in-app engine's room check (iPhone and iPad).
#[cfg(mobile)]
pub(crate) fn reading(key: &str) -> u64 {
    memory().and_then(|m| m[key].as_u64()).unwrap_or(0)
}

pub(crate) fn to_c_path(path: &Path) -> Result<CString, LocalError> {
    CString::new(path.to_string_lossy().into_owned()).map_err(|e| LocalError::BadInput(e.to_string()))
}

/// The shim's reply (`{"ok":…}`), freed after reading: the result on success, its error otherwise.
pub(crate) fn take(reply: *mut c_char) -> Result<Value, LocalError> {
    // SAFETY: the shim returns a valid, owned C string; it is freed exactly once, below.
    let text = unsafe { CStr::from_ptr(reply) }.to_string_lossy().into_owned();
    unsafe { sys::roci_llama_free_string(reply) };
    let mut value: Value = serde_json::from_str(&text).map_err(|e| LocalError::Engine(e.to_string()))?;
    if value["ok"].as_bool() == Some(true) {
        Ok(value)
    } else {
        Err(LocalError::Engine(value["error"].take().as_str().unwrap_or("llama.cpp failed").to_string()))
    }
}

