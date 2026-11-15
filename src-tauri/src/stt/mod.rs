//! On-device speech-to-text: transcribe.cpp (ggml, Metal) at Hex's pin,
//! running in this process, on the curated speech models in `crate::models`.
//! There is no endpoint: the webview calls `stt_transcribe`, and everything
//! else reaches transcription through Kasset (MCP).
//!
//! - `engine`: one warm model at a time, unloaded after an idle period.
//! - `commands`: transcribe one WAV part.

pub mod commands;
mod engine;

/// The warm engine, managed by Tauri.
#[derive(Default)]
pub struct SttState {
    pub engine: engine::Engine,
}
