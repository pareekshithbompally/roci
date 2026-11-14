//! FFI to the Swift bridges. Every call returns a JSON C string, parsed then freed here.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use serde::de::DeserializeOwned;

extern "C" {
    fn apple_intelligence_availability() -> i32;
    fn apple_intelligence_context_size() -> isize;
    fn apple_intelligence_generate(
        instructions: *const c_char,
        prompt: *const c_char,
        schema_json: *const c_char,
        timeout_ms: u64,
    ) -> *mut c_char;
    fn apple_speech_status(language: *const c_char) -> *mut c_char;
    fn apple_speech_request_access() -> *mut c_char;
    fn apple_speech_prepare(language: *const c_char) -> *mut c_char;
    fn apple_speech_transcribe(path: *const c_char, language: *const c_char) -> *mut c_char;
    fn apple_intelligence_free_string(ptr: *mut c_char);
}

fn c_string(value: &str) -> Result<CString, String> {
    CString::new(value.replace('\0', "")).map_err(|e| e.to_string())
}

fn parse_and_free<T: DeserializeOwned>(ptr: *mut c_char) -> Result<T, String> {
    if ptr.is_null() {
        return Err("Null pointer from the Apple Intelligence bridge".into());
    }
    let json = unsafe {
        let text = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        apple_intelligence_free_string(ptr);
        text
    };
    serde_json::from_str(&json).map_err(|e| format!("Bridge JSON: {e}"))
}

pub fn availability() -> i32 {
    unsafe { apple_intelligence_availability() }
}

pub fn context_size() -> usize {
    usize::try_from(unsafe { apple_intelligence_context_size() }).unwrap_or(0)
}

pub fn generate<T: DeserializeOwned>(instructions: &str, prompt: &str, schema_json: &str, timeout_ms: u64) -> Result<T, String> {
    let (instructions, prompt, schema) = (c_string(instructions)?, c_string(prompt)?, c_string(schema_json)?);
    parse_and_free(unsafe { apple_intelligence_generate(instructions.as_ptr(), prompt.as_ptr(), schema.as_ptr(), timeout_ms) })
}

pub fn speech_status<T: DeserializeOwned>(language: &str) -> Result<T, String> {
    let language = c_string(language)?;
    parse_and_free(unsafe { apple_speech_status(language.as_ptr()) })
}

pub fn speech_request_access<T: DeserializeOwned>() -> Result<T, String> {
    parse_and_free(unsafe { apple_speech_request_access() })
}

pub fn speech_prepare<T: DeserializeOwned>(language: &str) -> Result<T, String> {
    let language = c_string(language)?;
    parse_and_free(unsafe { apple_speech_prepare(language.as_ptr()) })
}

pub fn speech_transcribe<T: DeserializeOwned>(path: &str, language: &str) -> Result<T, String> {
    let (path, language) = (c_string(path)?, c_string(language)?);
    parse_and_free(unsafe { apple_speech_transcribe(path.as_ptr(), language.as_ptr()) })
}
