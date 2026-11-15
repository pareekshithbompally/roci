//! Read aloud on this Mac. Two voices, one path: the reply's markdown becomes
//! plain sentences (`text`), then
//! - `macos`: the system voice (System Settings › Accessibility › Spoken
//!   Content) through Apple's `say`;
//! - Phonon 31M (`ptts`, Apache-2.0), downloaded via `crate::models`,
//!   synthesizing the next sentence while `playback` plays the current one.
//!
//! One reply speaks at a time: starting another stops the first.

pub mod commands;
mod macos;
mod phonon;
mod playback;
mod text;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

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
        if let Some(previous) = self.current.lock().unwrap_or_else(|e| e.into_inner()).replace(Arc::clone(&stop)) {
            previous.store(true, Ordering::Relaxed);
        }
        stop
    }

    fn stop(&self) {
        if let Some(current) = self.current.lock().unwrap_or_else(|e| e.into_inner()).take() {
            current.store(true, Ordering::Relaxed);
        }
    }

    /// Lets go of the Phonon model about to be deleted.
    pub fn forget(&self) {
        self.stop();
        self.phonon.unload();
    }
}
