//! Read aloud: markdown becomes sentence chunks spoken by macOS voices or a downloaded voice model, one reply at a time.

pub mod commands;
mod macos;
mod playback;
mod text;
mod voice_model;

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

/// Stops one reply's speech: a flag read between chunks, and a wake-up for whatever is waiting on that reply.
#[derive(Default)]
pub struct Halt {
    stopped: AtomicBool,
    wakers: Mutex<Vec<Box<dyn Fn() + Send>>>,
}

impl Halt {
    pub fn is_stopped(&self) -> bool {
        self.stopped.load(Ordering::Acquire)
    }

    fn stop(&self) {
        let wakers = {
            let mut wakers = lock(&self.wakers);
            self.stopped.store(true, Ordering::Release);
            std::mem::take(&mut *wakers)
        };
        wakers.iter().for_each(|wake| wake());
    }

    /// Runs `wake` once the reply is stopped (at once if it already is), so waiting code blocks instead of polling.
    pub fn on_stop(&self, wake: impl Fn() + Send + 'static) {
        let mut wakers = lock(&self.wakers);
        if self.is_stopped() {
            drop(wakers);
            wake();
        } else {
            wakers.push(Box::new(wake));
        }
    }
}

#[derive(Default)]
pub struct TtsState {
    /// The reply speaking now.
    current: Mutex<Option<Arc<Halt>>>,
}

impl TtsState {
    /// Stops whatever is speaking and returns the new reply's halt.
    fn begin(&self) -> Arc<Halt> {
        let halt = Arc::new(Halt::default());
        if let Some(previous) = lock(&self.current).replace(Arc::clone(&halt)) {
            previous.stop();
        }
        halt
    }

    fn stop(&self) {
        if let Some(current) = lock(&self.current).take() {
            current.stop();
        }
    }

    /// Stops speaking and frees the voice model about to be deleted.
    pub fn forget(&self) {
        self.stop();
        crate::mlx::unload(crate::models::catalog::Kind::Voice);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn a_halt_wakes_waiters_registered_before_and_after_the_stop() {
        let halt = Halt::default();
        let (woken, wakes) = mpsc::channel();
        let early = woken.clone();
        halt.on_stop(move || early.send("before").unwrap());
        assert!(wakes.try_recv().is_err(), "nothing runs before the stop");
        halt.stop();
        halt.on_stop(move || woken.send("after").unwrap());
        assert!(halt.is_stopped());
        assert_eq!(wakes.try_iter().collect::<Vec<_>>(), ["before", "after"]);
    }
}
