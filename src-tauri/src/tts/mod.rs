//! Read aloud on this Mac. Two engines, one path: the reply's markdown becomes
//! plain sentences (`text`), then
//! - `macos`: the installed system voices, spoken natively (AVSpeechSynthesizer);
//! - Phonon 31M (`ptts`, Apache-2.0), downloaded via `crate::models` with its
//!   curated voices, synthesizing the next sentence while `playback` plays
//!   the current one.
//!
//! Each engine lists its voices (`tts_voices`); a reply is spoken in one
//! (`tts_speak`), sentence chunk by chunk, reporting `tts://chunk` with each
//! chunk's text as its audio begins. One reply speaks at a time: starting
//! another stops the first.

pub mod commands;
mod macos;
mod phonon;
mod playback;
mod text;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use crate::sync::lock;

/// A voice an engine can speak in: `id` is passed back to speak with it.
#[derive(Serialize)]
pub struct VoiceOption {
    pub id: String,
    pub name: String,
    /// A quality note (Premium, Enhanced) where the system reports one.
    pub detail: Option<&'static str>,
}

#[derive(Default)]
pub struct TtsState {
    phonon: phonon::Phonon,
    /// Stop flag of the reply speaking now.
    current: Mutex<Option<Arc<AtomicBool>>>,
}

impl TtsState {
    /// Stops whatever is speaking and returns the new reply's stop flag.
    fn begin(&self) -> Arc<AtomicBool> {
        let stop = Arc::new(AtomicBool::new(false));
        if let Some(previous) = lock(&self.current).replace(Arc::clone(&stop)) {
            previous.store(true, Ordering::Relaxed);
        }
        stop
    }

    fn stop(&self) {
        if let Some(current) = lock(&self.current).take() {
            current.store(true, Ordering::Relaxed);
        }
    }

    /// Lets go of the Phonon model about to be deleted.
    pub fn forget(&self) {
        self.stop();
        self.phonon.unload();
    }
}
