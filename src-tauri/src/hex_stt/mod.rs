//! Transcription through the running Hex app's local HTTP API.
//!
//! Hex publishes its loopback port and bearer token in an owner-only discovery
//! file. This module reads it on every call (both change per Hex launch), keeps
//! the token in Rust, and exposes two commands: `hex_status` and
//! `hex_transcribe` (one WAV in, its transcript out). Splitting long recordings
//! and progress happen in TypeScript.

pub mod commands;
mod client;
mod discovery;

use serde::Serialize;

/// Errors the webview maps to user-facing messages, serialized as `{ code, detail? }`.
#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "detail", rename_all = "kebab-case")]
pub enum HexError {
    /// No discovery file, or nothing listening on its port.
    NotRunning,
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
