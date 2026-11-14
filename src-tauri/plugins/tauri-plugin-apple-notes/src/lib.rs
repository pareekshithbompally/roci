//! Apple Notes for Kasset: one note per meeting (summary + transcript) in a
//! "Kasset" folder, written with Apple Events (Notes has no public API).
//! Requires the `com.apple.security.automation.apple-events` entitlement and
//! `NSAppleEventsUsageDescription`; the user grants Automation → Notes.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use serde::{Deserialize, Serialize};
use tauri::{
    command,
    plugin::{Builder, TauriPlugin},
    Runtime,
};

extern "C" {
    fn apple_notes_access(ask: bool) -> *mut c_char;
    fn apple_notes_upsert(input: *const c_char) -> *mut c_char;
    fn apple_notes_free_string(ptr: *mut c_char);
}

/// Errors the webview maps to user-facing copy, serialized as `{ code, detail? }`.
#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "detail", rename_all = "kebab-case")]
pub enum NotesError {
    /// Automation → Notes isn't allowed for Kasset.
    NotAuthorized,
    Failed(String),
}

#[derive(Deserialize)]
struct BridgeFailure {
    kind: String,
    message: String,
}

#[derive(Deserialize)]
struct Reply {
    status: Option<String>,
    error: Option<BridgeFailure>,
}

/// One meeting's note.
#[derive(Debug, Serialize, Deserialize)]
pub struct NoteInput {
    pub folder: String,
    /// A line inside the note that identifies it on later saves.
    pub tag: String,
    pub title: String,
    pub html: String,
}

fn call(ptr: *mut c_char) -> Result<Reply, NotesError> {
    if ptr.is_null() {
        return Err(NotesError::Failed("Null pointer from the Apple Notes bridge".into()));
    }
    let json = unsafe {
        let text = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        apple_notes_free_string(ptr);
        text
    };
    let reply: Reply = serde_json::from_str(&json).map_err(|e| NotesError::Failed(format!("Bridge JSON: {e}")))?;
    match reply.error {
        Some(failure) if failure.kind == "not-authorized" => Err(NotesError::NotAuthorized),
        Some(failure) => Err(NotesError::Failed(failure.message)),
        None => Ok(reply),
    }
}

async fn off_main<T: Send + 'static>(work: impl FnOnce() -> Result<T, NotesError> + Send + 'static) -> Result<T, NotesError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| NotesError::Failed(format!("Apple Notes task failed: {e}")))?
}

/// Automation consent for Notes: `authorized` · `denied` · `not_determined`. `ask` raises the prompt while undecided.
#[command]
async fn access(ask: bool) -> Result<String, NotesError> {
    off_main(move || call(unsafe { apple_notes_access(ask) }).map(|r| r.status.unwrap_or_else(|| "not_determined".into()))).await
}

/// Creates or updates one meeting's note.
#[command]
async fn upsert(note: NoteInput) -> Result<(), NotesError> {
    off_main(move || {
        let json = serde_json::to_string(&note).map_err(|e| NotesError::Failed(e.to_string()))?;
        let json = CString::new(json.replace('\0', "")).map_err(|e| NotesError::Failed(e.to_string()))?;
        call(unsafe { apple_notes_upsert(json.as_ptr()) }).map(|_| ())
    })
    .await
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("apple-notes").invoke_handler(tauri::generate_handler![access, upsert]).build()
}
