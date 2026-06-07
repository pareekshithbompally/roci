//! macOS audio capture.
//!
//! The capture engine itself is native Swift (`src-tauri/swift/`, talking to
//! AVFoundation + ScreenCaptureKit); this Rust module is the thin glue that the
//! Tauri frontend calls, following the same pattern as `tauri-plugin-calendar`.
//!
//! - [`commands`] — the four `#[tauri::command]`s the frontend invokes.
//! - `bridge`     — the `extern "C"` FFI to the Swift `@_cdecl` functions.
//! - `types`      — shared request types (`AudioCaptureSource`, options).

pub mod commands;
mod bridge;
mod types;
