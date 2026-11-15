//! Helpers for commands that take a raw invoke body (audio, files) with their arguments in headers.

use tauri::ipc::{InvokeBody, Request};

/// A header's value as text, if present and valid.
pub fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|value| value.to_str().ok())
}

/// The raw bytes of the invoke body; None when the webview sent JSON.
pub fn raw_body<'a>(request: &'a Request<'_>) -> Option<&'a [u8]> {
    match request.body() {
        InvokeBody::Raw(bytes) => Some(bytes),
        InvokeBody::Json(_) => None,
    }
}

