//! On-device speech-to-text in-process on the curated models; the webview calls these commands.

pub mod commands;
pub(crate) mod engine;
mod live;
mod vad;
mod vocabulary;

use std::sync::Mutex;

/// The warm engine, the speech detector and the live dictation, if one is running.
#[derive(Default)]
pub struct SttState {
    pub engine: engine::Engine,
    detector: vad::SpeechDetector,
    live: Mutex<Option<live::LiveSession>>,
}
