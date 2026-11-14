//! The Hex integration: Hex's transcription models (its loopback HTTP API) and
//! one-way meeting sync (its versioned CLI JSON + the meeting-finished stream).
//!
//! Hex publishes its loopback port and bearer token in an owner-only discovery
//! file, read on every call (both change per Hex launch); the token stays in
//! Rust. Splitting long recordings, progress and the meeting import happen in
//! TypeScript. Kasset never writes to Hex.

pub mod commands;
mod client;
mod discovery;
mod events;
mod meetings;

/// The meeting-finished watcher, while the integration is on.
#[derive(Default)]
pub struct HexState {
    watcher: std::sync::Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

use serde::Serialize;

/// Errors the webview maps to user-facing messages, serialized as `{ code, detail? }`.
#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "detail", rename_all = "kebab-case")]
pub enum HexError {
    /// No discovery file, or nothing listening on its port.
    NotRunning,
    /// Hex.app isn't in /Applications or ~/Applications.
    NotInstalled,
    /// Hex speaks a local API version this client doesn't.
    Incompatible,
    /// Hex rejected the bearer token (stale discovery file).
    Unauthorized,
    /// The requested model isn't downloaded in Hex.
    ModelNotReady,
    /// Hex is dictating or shutting down.
    Busy,
    /// Hex refused the upload size.
    TooLarge,
    /// Any other refusal, with Hex's code or the transport error.
    Rejected(String),
}
