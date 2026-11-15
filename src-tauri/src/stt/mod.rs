//! On-device speech-to-text: transcribe.cpp (ggml, Metal) running in this
//! process, on the curated speech models in `crate::models`. There is no
//! endpoint: the webview calls these commands, and everything else reaches
//! transcription through Kasset (MCP).
//!
//! - `engine`: one warm model at a time, unloaded after an idle period.
//! - `live`: dictation transcribed while it's spoken (models that stream).
//! - `commands`: transcribe one WAV part; start / feed / finish / cancel live.

pub mod commands;
mod engine;
mod live;

use std::sync::Mutex;

/// The warm engine and the live dictation, if one is running.
#[derive(Default)]
pub struct SttState {
    pub engine: engine::Engine,
    live: Mutex<Option<live::LiveSession>>,
}
